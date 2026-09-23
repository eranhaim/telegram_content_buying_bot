import { Order } from "./models.js";
import { applyHigherPaysEvent } from "./orders.js";
import { deliverEntitlements } from "./telegram.js";
import { reconcileHigherPaysOrder } from "./higherpays.js";

let running = false;

export async function reconcileOrders() {
  const now = new Date();
  const pending = await Order.find({ paymentStatus: "pending", expiresAt: { $gt: now } }).limit(100);
  for (const order of pending) {
    try {
      await applyHigherPaysEvent(await reconcileHigherPaysOrder(order.publicId));
    } catch { /* a remote error must not stop reconciliation of other orders */ }
  }
}

export async function retryDeliveries() {
  const orders = await Order.find({ paymentStatus: "paid", fulfillmentStatus: { $in: ["queued", "partial"] } }).limit(100);
  for (const order of orders) {
    try { await deliverEntitlements(String(order._id)); } catch { /* logged with delivery attempt state */ }
  }
}

export function startMaintenance() {
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try { await reconcileOrders(); await retryDeliveries(); }
    finally { running = false; }
  }, 5 * 60_000);
  timer.unref();
  return timer;
}
