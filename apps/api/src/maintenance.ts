import { config } from "./config.js";
import { Order } from "./models.js";
import { approveOrder } from "./orders.js";
import { statusForOrder } from "./mantapay.js";
import { deliverEntitlements } from "./telegram.js";
import { exportMarketplaceOrder } from "./higherpays.js";

let running = false;

export async function reconcileOrders() {
  if (!config.MANTAPAY_MERCHANT_ID || !config.MANTAPAY_HASH_KEY) return;
  const now = new Date();
  await Order.updateMany({ paymentStatus: "pending", expiresAt: { $lte: now } }, { $set: { paymentStatus: "expired" } });
  const pending = await Order.find({ paymentStatus: "pending", expiresAt: { $gt: now } }).limit(100);
  for (const order of pending) {
    try {
      const result = await statusForOrder(order.mantaPayOrderRef);
      if (result.status === "approved") await approveOrder({
        orderRef: order.mantaPayOrderRef, transactionId: result.attempt?.transactionId,
        providerEventId: `reconcile:${result.attempt?.transactionId}`, amountMinor: result.attempt?.amountMinor,
        currency: result.attempt?.currency, replyCode: result.attempt?.replyCode, rawPayload: result,
      });
    } catch { /* provider or one order failing must not stop other reconciliation */ }
  }
}

export async function retryDeliveries() {
  const orders = await Order.find({ paymentStatus: "paid", fulfillmentStatus: { $in: ["queued", "partial"] } }).limit(100);
  for (const order of orders) {
    try { await deliverEntitlements(String(order._id)); } catch { /* logged with delivery attempt state */ }
  }
}

export async function retryHigherPaysExports() {
  const orders = await Order.find({ paymentStatus: { $in: ["paid", "refunded", "charged_back"] }, higherPaysExportedAt: { $exists: false } }).limit(100);
  for (const order of orders) {
    try {
      if (await exportMarketplaceOrder(order)) await Order.updateOne({ _id: order._id }, { $set: { higherPaysExportedAt: new Date() } });
    } catch { /* retry on the next run without holding up fulfillment */ }
  }
}

export function startMaintenance() {
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try { await reconcileOrders(); await retryDeliveries(); await retryHigherPaysExports(); }
    finally { running = false; }
  }, 5 * 60_000);
  timer.unref();
  return timer;
}
