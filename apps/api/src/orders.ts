import crypto from "node:crypto";
import { Agency, Agent, Cart, Creator, Delivery, Entitlement, MediaAsset, Order, PaymentAttempt, Product, TelegramUser } from "./models.js";
import { config } from "./config.js";
import { exportMarketplaceOrder } from "./higherpays.js";
import { deliverEntitlements } from "./telegram.js";

const id = (prefix: string) => `${prefix}-${crypto.randomBytes(9).toString("base64url")}`;

export async function createOrderForCart(telegramUserId: string) {
  const user = await TelegramUser.findById(telegramUserId);
  if (!user?.ageConfirmedAt) throw new Error("age_confirmation_required");
  const cart = await Cart.findOne({ telegramUserId, status: "active" });
  if (!cart?.items.length) throw new Error("cart_empty");
  const productIds = cart.items.map((item: any) => item.productId);
  const products = await Product.find({ _id: { $in: productIds }, status: "published" });
  if (products.length !== productIds.length) throw new Error("unavailable_product");
  const agencies = new Map<string, any>();
  for (const product of products) {
    if (product.currency !== cart.currency) throw new Error("mixed_currency_cart");
    const key = String(product.agencyId);
    if (!agencies.has(key)) agencies.set(key, await Agency.findById(product.agencyId));
  }
  if (agencies.size !== 1) throw new Error("mixed_agency_cart");
  const agency = [...agencies.values()][0];
  if (!agency?.defaultAgentId) throw new Error("agency_checkout_not_configured");
  const productById = new Map(products.map((product) => [String(product._id), product]));
  const lines = await Promise.all(cart.items.map(async (item: any) => {
    const product = productById.get(String(item.productId))!;
    const creator = await Creator.findById(product.creatorId);
    const assets = await MediaAsset.find({ _id: { $in: product.mediaAssetIds }, status: "ready" });
    if (assets.length !== product.mediaAssetIds.length) throw new Error("product_media_unavailable");
    return {
      productId: String(product._id), creatorId: String(product.creatorId), productTitle: product.title,
      creatorName: creator?.displayName ?? "Creator", contentVersion: product.contentVersion,
      amountMinor: product.amountMinor, currency: product.currency,
      assets: assets.map((asset: any) => ({ assetId: String(asset._id), storageKey: asset.storageKey, fileName: asset.fileName, mimeType: asset.mimeType, telegramFileId: asset.telegramFileId })),
    };
  }));
  const subtotalMinor = lines.reduce((total, line) => total + line.amountMinor, 0);
  const agent = await Agent.findById(agency.defaultAgentId);
  if (!agent?.active) throw new Error("agency_checkout_not_configured");
  const order = await Order.create({
    publicId: id("ord"), agencyId: agency._id, agentId: agent._id,
    higherPaysWorkspaceId: agency.higherPaysWorkspaceId, higherPaysAgentId: agent.higherPaysAgentId,
    telegramUserId, cartId: cart._id, lines, subtotalMinor,
    checkoutFeeMinor: config.MANTAPAY_CHECKOUT_FEE_MINOR,
    totalMinor: subtotalMinor + config.MANTAPAY_CHECKOUT_FEE_MINOR,
    currency: cart.currency, mantaPayOrderRef: id("MP"), returnNonce: crypto.randomBytes(18).toString("base64url"),
    expiresAt: new Date(Date.now() + 30 * 60_000),
  });
  await PaymentAttempt.create({ orderId: order._id, status: "created" });
  await Cart.updateOne({ _id: cart._id, status: "active" }, { $set: { status: "checked_out" } });
  return order;
}

export async function approveOrder(input: { orderRef: string; transactionId?: string; providerEventId?: string; amountMinor?: number; currency?: string; replyCode?: string; rawPayload: unknown }) {
  const order = await Order.findOne({ mantaPayOrderRef: input.orderRef });
  if (!order) throw new Error("unknown_order");
  if (input.currency && input.currency !== order.currency) throw new Error("currency_mismatch");
  if (input.amountMinor != null && ![order.subtotalMinor, order.totalMinor].includes(input.amountMinor)) throw new Error("amount_mismatch");
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, paymentStatus: { $in: ["pending", "expired"] } },
    { $set: { paymentStatus: "paid", paidAt: new Date(), fulfillmentStatus: "queued", providerTransactionId: input.transactionId } },
    { new: true },
  );
  await PaymentAttempt.findOneAndUpdate(
    { providerEventId: input.providerEventId ?? input.transactionId ?? id("untracked") },
    { $setOnInsert: { orderId: order._id, providerEventId: input.providerEventId, providerTransactionId: input.transactionId }, $set: { status: "approved", replyCode: input.replyCode, grossMinor: input.amountMinor, rawPayload: input.rawPayload } },
    { upsert: true },
  );
  if (!updated) return order;
  const entitlementRecords = updated.lines.map((line: any) => ({
    telegramUserId: updated.telegramUserId, orderId: updated._id, orderLineId: String(line._id), assets: line.assets, status: "active",
  }));
  try { await Entitlement.insertMany(entitlementRecords, { ordered: false }); } catch (error: unknown) {
    if (!(error instanceof Error) || !error.message.includes("duplicate key")) throw error;
  }
  const entitlements = await Entitlement.find({ orderId: updated._id });
  const jobs = entitlements.flatMap((entry: any) => entry.assets.map((asset: any) => ({ entitlementId: entry._id, assetId: asset.assetId, status: "queued" })));
  try { await Delivery.insertMany(jobs, { ordered: false }); } catch (error: unknown) {
    if (!(error instanceof Error) || !error.message.includes("duplicate key")) throw error;
  }
  await Promise.all(updated.lines.map((line: any) => Product.updateOne({ _id: line.productId }, { $inc: { purchasesCount: 1 } })));
  try {
    if (await exportMarketplaceOrder(updated)) await Order.updateOne({ _id: updated._id }, { $set: { higherPaysExportedAt: new Date() } });
  } catch { /* delivery is never blocked by accounting export availability */ }
  void deliverEntitlements(String(updated._id));
  return updated;
}
