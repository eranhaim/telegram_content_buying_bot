export type PreviewMode = "none" | "blurred" | "visible";

export function orderPublicId(cartId: string) {
  return `ord_${cartId}`;
}

export function sumMinor(amounts: number[]) {
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  if (!Number.isSafeInteger(total) || total < 1) throw new Error("invalid_cart_total");
  return total;
}

export function previewIsConfigured(mode: PreviewMode, previewAssetId?: string | null) {
  return mode === "none" || Boolean(previewAssetId);
}

export function entitlementAction(
  currentStatus: "pending" | "paid" | "failed" | "refunded" | "charged_back",
  lifecycleStatus: "approved" | "refunded" | "charged_back" | "expired" | "cancelled",
) {
  if (lifecycleStatus === "approved" && currentStatus === "pending") return "grant" as const;
  if ((lifecycleStatus === "refunded" || lifecycleStatus === "charged_back") && currentStatus === "paid") return "revoke" as const;
  return "none" as const;
}
