import crypto from "node:crypto";
import { Agency, Cart, Category, Creator, Delivery, Entitlement, MediaAsset, Order, PaymentAttempt, Product, TelegramUser } from "./models.js";
import { isBrowserCustomer } from "./auth.js";
import { createCheckoutForOrder, type MantapayStatus, type MantapayWebhookPayment } from "./mantapay.js";
import { deliverEntitlements } from "./telegram.js";
import { orderPublicId, sumMinor } from "./commerce.js";

export async function createOrderForCart(telegramUserId: string) {
  const user = await TelegramUser.findById(telegramUserId);
  if (!user?.ageConfirmedAt) throw new Error("age_confirmation_required");
  const cart = await Cart.findOne({ telegramUserId, status: "active" });
  if (!cart?.items.length) throw new Error("cart_empty");
  const existing = await Order.findOne({ cartId: cart._id });
  if (existing?.checkoutUrl) return existing;
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
  if (!agency) throw new Error("agency_checkout_not_configured");
  const creatorDocs = await Creator.find({ _id: { $in: products.map((product: any) => product.creatorId) } });
  const creatorById = new Map(creatorDocs.map((creator: any) => [String(creator._id), creator]));
  const productById = new Map(products.map((product) => [String(product._id), product]));
  const lines = await Promise.all(cart.items.map(async (item: any) => {
    const product = productById.get(String(item.productId))!;
    const creator = creatorById.get(String(product.creatorId));
    const [assets, categories] = await Promise.all([
      MediaAsset.find({ _id: { $in: product.mediaAssetIds }, agencyId: product.agencyId, status: "ready" }),
      Category.find({ _id: { $in: product.categoryIds ?? [] }, agencyId: product.agencyId }),
    ]);
    if (assets.length !== product.mediaAssetIds.length) throw new Error("product_media_unavailable");
    return {
      productId: String(product._id), creatorId: String(product.creatorId), productTitle: product.title,
      creatorName: creator?.displayName ?? "Creator", deliveryMessage: product.deliveryMessage ?? "", contentVersion: product.contentVersion,
      categoryIds: categories.map((category: any) => String(category._id)),
      categoryNames: categories.map((category: any) => category.name),
      amountMinor: product.amountMinor, currency: product.currency,
      assets: assets.map((asset: any) => ({ assetId: String(asset._id), storageKey: asset.storageKey, fileName: asset.fileName, mimeType: asset.mimeType, telegramFileId: asset.telegramFileId })),
    };
  }));
  const subtotalMinor = sumMinor(lines.map((line) => line.amountMinor));

  let order = existing;
  if (!order) {
    try {
      order = await Order.create({
        publicId: orderPublicId(String(cart._id)), checkoutIdempotencyKey: `cart:${cart._id}`,
        agencyId: agency._id,
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
    const checkout = createCheckoutForOrder(order);
    order.checkoutUrl = checkout.checkoutUrl;
    await order.save();
  } catch (error) {
    throw error;
  }
  await PaymentAttempt.updateOne(
    { orderId: order._id, provider: "mantapay", status: "created" },
    { $setOnInsert: { orderId: order._id, provider: "mantapay", status: "created" } },
    { upsert: true },
  );
  await Cart.updateOne({ _id: cart._id, status: "active" }, { $set: { status: "checked_out" } });
  return order;
}

export async function applyMantapayPayment(payment: MantapayWebhookPayment) {
  if (!payment.referenceId) throw new Error("missing_order_reference");
  const order = await Order.findOne({ publicId: payment.referenceId });
  if (!order) throw new Error("unknown_order");

  if (payment.status === "declined" || payment.status === "abandoned") {
    await PaymentAttempt.findOneAndUpdate(
      { providerTransactionId: payment.transactionId },
      {
        $setOnInsert: { orderId: order._id, provider: "mantapay", providerTransactionId: payment.transactionId },
        $set: { status: "declined", replyCode: payment.replyCode, grossMinor: payment.grossAmount ? Math.round(payment.grossAmount * 100) : null, rawPayload: payment.fields },
      },
      { upsert: true },
    );
    return order;
  }

  if (payment.status === "pending") {
    await PaymentAttempt.findOneAndUpdate(
      { providerTransactionId: payment.transactionId },
      {
        $setOnInsert: { orderId: order._id, provider: "mantapay", providerTransactionId: payment.transactionId },
        $set: { status: "pending", replyCode: payment.replyCode, rawPayload: payment.fields },
      },
      { upsert: true },
    );
    return order;
  }

  if (payment.status !== "approved") return order;

  const updated = await Order.findOneAndUpdate(
    { _id: order._id, paymentStatus: { $in: ["pending", "expired"] } },
    { $set: { paymentStatus: "paid", paidAt: new Date(), fulfillmentStatus: "queued", providerTransactionId: payment.transactionId } },
    { new: true },
  );
  await PaymentAttempt.findOneAndUpdate(
    { providerTransactionId: payment.transactionId },
    {
      $setOnInsert: { orderId: order._id, provider: "mantapay", providerTransactionId: payment.transactionId },
      $set: { status: "approved", replyCode: payment.replyCode, grossMinor: payment.grossAmount ? Math.round(payment.grossAmount * 100) : null, rawPayload: payment.fields },
    },
    { upsert: true },
  );
  if (!updated) return order;

  const entitlementRecords = updated.lines.map((line: any) => ({
    telegramUserId: updated.telegramUserId, orderId: updated._id, orderLineId: String(line._id), assets: line.assets, status: "active",
  }));
  try { await Entitlement.insertMany(entitlementRecords, { ordered: false }); } catch (error: unknown) {
    if (!(error instanceof Error) || !error.message.includes("duplicate key")) throw error;
  }
  await Promise.all(updated.lines.map((line: any) => Product.updateOne({ _id: line.productId }, { $inc: { purchasesCount: 1 } })));
  const buyer = await TelegramUser.findById(updated.telegramUserId);
  if (isBrowserCustomer(buyer)) {
    await Order.updateOne({ _id: updated._id }, { $set: { fulfillmentStatus: "delivered" } });
    return updated;
  }
  const entitlements = await Entitlement.find({ orderId: updated._id });
  const jobs = entitlements.flatMap((entry: any) => entry.assets.map((asset: any) => ({ entitlementId: entry._id, assetId: asset.assetId, status: "queued" })));
  try { await Delivery.insertMany(jobs, { ordered: false }); } catch (error: unknown) {
    if (!(error instanceof Error) || !error.message.includes("duplicate key")) throw error;
  }
  void deliverEntitlements(String(updated._id));
  return updated;
}

export async function reconcileOrder(orderId: string, statusResult: { status: MantapayStatus; transaction: any }) {
  if (statusResult.status === "approved" && statusResult.transaction) {
    return applyMantapayPayment({
      kind: "payment",
      transactionId: statusResult.transaction.transId,
      referenceId: statusResult.transaction.order ?? orderId,
      replyCode: statusResult.transaction.replyCode,
      replyDesc: statusResult.transaction.replyDesc,
      status: "approved",
      grossAmount: statusResult.transaction.amount,
      currency: statusResult.transaction.currency,
      clientEmail: null,
      clientName: null,
      occurredAt: statusResult.transaction.date,
      fields: {},
    });
  }
  return null;
}
