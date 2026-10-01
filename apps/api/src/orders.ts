import crypto from "node:crypto";
import { Agency, Agent, Cart, Category, Creator, Delivery, Entitlement, MediaAsset, Order, PaymentAttempt, Product, TelegramUser } from "./models.js";
import { createHigherPaysCheckout, type HigherPaysLifecycleEvent, type HigherPaysOrder } from "./higherpays.js";
import { deliverEntitlements } from "./telegram.js";
import { orderPublicId, sumMinor } from "./commerce.js";

export async function createOrderForCart(telegramUserId: string) {
  const user = await TelegramUser.findById(telegramUserId);
  if (!user?.ageConfirmedAt) throw new Error("age_confirmation_required");
  const cart = await Cart.findOne({ telegramUserId, status: "active" });
  if (!cart?.items.length) throw new Error("cart_empty");
  const existing = await Order.findOne({ cartId: cart._id });
  if (existing?.higherPaysCheckoutUrl) return existing;
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
    const [creator, assets, categories] = await Promise.all([
      Creator.findById(product.creatorId),
      MediaAsset.find({ _id: { $in: product.mediaAssetIds }, agencyId: product.agencyId, status: "ready" }),
      Category.find({ _id: { $in: product.categoryIds ?? [] }, agencyId: product.agencyId }),
    ]);
    if (assets.length !== product.mediaAssetIds.length) throw new Error("product_media_unavailable");
    return {
      productId: String(product._id), creatorId: String(product.creatorId), productTitle: product.title,
      creatorName: creator?.displayName ?? "Creator", contentVersion: product.contentVersion,
      categoryIds: categories.map((category: any) => String(category._id)),
      categoryNames: categories.map((category: any) => category.name),
      amountMinor: product.amountMinor, currency: product.currency,
      assets: assets.map((asset: any) => ({ assetId: String(asset._id), storageKey: asset.storageKey, fileName: asset.fileName, mimeType: asset.mimeType, telegramFileId: asset.telegramFileId })),
    };
  }));
  const subtotalMinor = sumMinor(lines.map((line) => line.amountMinor));
  const agent = await Agent.findById(agency.defaultAgentId);
  if (!agent?.active) throw new Error("agency_checkout_not_configured");
  let order = existing;
  if (!order) {
    try {
      order = await Order.create({
        publicId: orderPublicId(String(cart._id)), checkoutIdempotencyKey: `cart:${cart._id}`,
        agencyId: agency._id, agentId: agent._id,
        higherPaysWorkspaceId: agency.higherPaysWorkspaceId, higherPaysAgentId: agent.higherPaysAgentId,
        telegramUserId, cartId: cart._id, lines, subtotalMinor,
        totalMinor: subtotalMinor,
        currency: cart.currency, returnNonce: crypto.randomBytes(18).toString("base64url"),
        expiresAt: new Date(Date.now() + 30 * 60_000),
      });
    } catch (error: unknown) {
      if ((error as { code?: number }).code !== 11000) throw error;
      order = await Order.findOne({ cartId: cart._id });
      if (!order) throw error;
    }
  }
  try {
    const checkout = await createHigherPaysCheckout(order);
    if (checkout.marketplaceOrderId !== order.publicId || checkout.amountMinor !== order.subtotalMinor || checkout.currency !== order.currency) {
      throw new Error("higherpays_checkout_mismatch");
    }
    order.higherPaysPaymentLinkReference = checkout.paymentLinkReference;
    order.higherPaysCheckoutUrl = checkout.checkoutUrl;
    await order.save();
  } catch (error) {
    throw error;
  }
  await PaymentAttempt.updateOne(
    { orderId: order._id, provider: "higherpays", status: "created" },
    { $setOnInsert: { orderId: order._id, provider: "higherpays", status: "created" } },
    { upsert: true },
  );
  await Cart.updateOne({ _id: cart._id, status: "active" }, { $set: { status: "checked_out" } });
  return order;
}

export async function applyHigherPaysEvent(input: HigherPaysLifecycleEvent | HigherPaysOrder) {
  const order = await Order.findOne({ publicId: input.marketplaceOrderId });
  if (!order) throw new Error("unknown_order");
  if (input.currency !== order.currency || input.amountMinor !== order.subtotalMinor
    || input.paymentLinkReference !== order.higherPaysPaymentLinkReference) throw new Error("higherpays_order_mismatch");
  const eventType = "type" in input ? input.type : undefined;
  if (input.status === "refunded" || input.status === "charged_back" || eventType === "payment.refunded" || eventType === "payment.chargeback") {
    const status = input.status === "charged_back" || eventType === "payment.chargeback" ? "charged_back" : "refunded";
    const revoked = await Order.findOneAndUpdate({ _id: order._id, paymentStatus: "paid" }, { $set: { paymentStatus: status, fulfillmentStatus: "revoked" } }, { new: true });
    if (revoked) await Entitlement.updateMany({ orderId: order._id }, { $set: { status: "revoked" } });
    return revoked ?? order;
  }
  if (input.status === "expired" || input.status === "cancelled") {
    await PaymentAttempt.findOneAndUpdate(
      { providerEventId: "eventId" in input ? input.eventId : `reconcile:${input.providerTransactionId ?? "unknown"}` },
      { $setOnInsert: { orderId: order._id, provider: "higherpays", providerEventId: "eventId" in input ? input.eventId : undefined, providerTransactionId: input.providerTransactionId }, $set: { status: "declined", grossMinor: input.amountMinor, rawPayload: input } },
      { upsert: true },
    );
    return await Order.findOneAndUpdate(
      { _id: order._id, paymentStatus: "pending" },
      { $set: { paymentStatus: "failed", fulfillmentStatus: "not_ready" } },
      { new: true },
    ) ?? order;
  }
  if (input.status !== "approved" && eventType !== "payment.approved") return order;
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, paymentStatus: { $in: ["pending", "expired"] } },
    { $set: { paymentStatus: "paid", paidAt: new Date(), fulfillmentStatus: "queued", providerTransactionId: input.providerTransactionId, higherPaysPaymentId: "paymentId" in input ? input.paymentId : undefined } },
    { new: true },
  );
  await PaymentAttempt.findOneAndUpdate(
    { providerEventId: "eventId" in input ? input.eventId : `reconcile:${input.providerTransactionId ?? "unknown"}` },
    { $setOnInsert: { orderId: order._id, provider: "higherpays", providerEventId: "eventId" in input ? input.eventId : undefined, providerTransactionId: input.providerTransactionId }, $set: { status: "approved", grossMinor: input.amountMinor, rawPayload: input } },
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
  void deliverEntitlements(String(updated._id));
  return updated;
}
