import crypto from "node:crypto";
import { config } from "./config.js";

export type HigherPaysOrder = {
  marketplaceOrderId: string;
  checkoutUrl: string;
  paymentLinkReference: string;
  amountMinor: number;
  currency: string;
  status: "pending" | "approved" | "refunded" | "charged_back" | "expired" | "cancelled";
  providerTransactionId: string | null;
};

export type HigherPaysLifecycleEvent = HigherPaysOrder & {
  eventId: string;
  type: "payment.approved" | "payment.refunded" | "payment.chargeback";
  occurredAt: string;
  paymentId: string | null;
};

function integrationUrl(path: string) {
  if (!config.HIGHERPAYS_API_BASE || !config.HIGHERPAYS_MARKETPLACE_API_KEY) throw new Error("higherpays_not_configured");
  return new URL(path, config.HIGHERPAYS_API_BASE);
}

async function request(path: string, init: RequestInit) {
  const response = await fetch(integrationUrl(path), {
    ...init,
    headers: {
      authorization: `Bearer ${config.HIGHERPAYS_MARKETPLACE_API_KEY}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`higherpays_${response.status}`);
  return response.json() as Promise<HigherPaysOrder>;
}

export function signHigherPaysEvent(timestamp: string, eventId: string, rawBody: string) {
  if (!config.HIGHERPAYS_EVENT_SIGNING_SECRET) throw new Error("higherpays_event_signing_not_configured");
  return crypto.createHmac("sha256", config.HIGHERPAYS_EVENT_SIGNING_SECRET)
    .update(`${timestamp}.${eventId}.${rawBody}`).digest("hex");
}

export function verifyHigherPaysEvent(timestamp: string | undefined, eventId: string | undefined, signature: string | undefined, rawBody: string) {
  if (!timestamp || !eventId || !signature || !config.HIGHERPAYS_EVENT_SIGNING_SECRET) return false;
  const age = Math.abs(Date.now() - Date.parse(timestamp));
  if (!Number.isFinite(age) || age > 5 * 60_000) return false;
  const expected = Buffer.from(signHigherPaysEvent(timestamp, eventId, rawBody), "hex");
  const actual = Buffer.from(signature, "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function createHigherPaysCheckout(order: any) {
  return request("/integrations/marketplace/orders", {
    method: "POST",
    body: JSON.stringify({
      marketplaceOrderId: order.publicId,
      amountMinor: order.subtotalMinor,
      currency: order.currency,
      returnUrl: new URL(`/payment-complete?order=${order.publicId}&state=${order.returnNonce}`, config.PUBLIC_APP_URL).toString(),
    }),
  });
}

export function reconcileHigherPaysOrder(publicId: string) {
  return request(`/integrations/marketplace/orders/${encodeURIComponent(publicId)}`, { method: "GET" });
}
