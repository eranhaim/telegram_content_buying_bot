import { config } from "./config.js";

export async function exportMarketplaceOrder(order: any) {
  if (!config.HIGHERPAYS_API_BASE || !config.HIGHERPAYS_MARKETPLACE_API_KEY) return false;
  const response = await fetch(new URL("/integrations/marketplace/orders", config.HIGHERPAYS_API_BASE), {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.HIGHERPAYS_MARKETPLACE_API_KEY}`,
      "content-type": "application/json",
      "idempotency-key": String(order._id),
    },
    body: JSON.stringify({
      externalOrderId: order.publicId,
      workspaceId: order.higherPaysWorkspaceId,
      agentId: order.higherPaysAgentId,
      provider: "mantapay",
      providerTransactionId: order.providerTransactionId,
      providerOrderRef: order.mantaPayOrderRef,
      amountMinor: order.subtotalMinor,
      currency: order.currency,
      status: order.paymentStatus,
    }),
  });
  if (!response.ok) throw new Error("higherpays_export_failed");
  return true;
}
