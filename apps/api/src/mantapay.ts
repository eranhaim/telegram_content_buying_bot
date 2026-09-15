import crypto from "node:crypto";
import { config } from "./config.js";

const currencyIds: Record<string, string> = { USD: "1", EUR: "2", GBP: "3" };
const paymentFields = ["trans_id", "trans_order", "reply_code", "trans_amount", "trans_currency"] as const;
const chargebackFields = ["trans_id", "action", "reason", "reasonCode", "comment", "originalID", "OrderId"] as const;

export function digest(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("base64");
}

function formDecode(body: Buffer | string) {
  return Object.fromEntries(new URLSearchParams(Buffer.isBuffer(body) ? body.toString("utf8") : body).entries());
}

function safeEqual(a: string | undefined, b: string) {
  if (!a) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function paymentStatus(replyCode: string | undefined) {
  if (replyCode === "000") return "approved";
  if (replyCode === "553" || replyCode === "663" || replyCode === "001") return "pending";
  if (replyCode === "600") return "abandoned";
  return "declined";
}

export function parseWebhook(raw: Buffer | string) {
  const fields = formDecode(raw);
  const chargeback = Boolean(fields.action && fields.originalID);
  const signed = chargeback ? chargebackFields : paymentFields;
  const signature = fields.signature ?? fields.Signature;
  const expected = digest(signed.map((field) => fields[field] ?? "").join("") + (config.MANTAPAY_HASH_KEY ?? ""));
  return {
    fields,
    valid: Boolean(config.MANTAPAY_HASH_KEY) && safeEqual(signature, expected),
    kind: chargeback ? "chargeback" : "payment",
    providerEventId: fields.trans_id,
    transactionId: fields.trans_id,
    reference: chargeback ? fields.OrderId : fields.trans_order,
    replyCode: fields.reply_code ?? fields.replyCode,
    status: chargeback ? "chargeback" : paymentStatus(fields.reply_code ?? fields.replyCode),
    amountMinor: fields.trans_amount ? Math.round(Number(fields.trans_amount) * 100) : undefined,
    currency: fields.trans_currency,
  };
}

function clientIp(ip: string | undefined) {
  const value = (ip ?? "").replace(/^::ffff:/, "");
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(value) ? value : "127.0.0.1";
}

export async function startCheckout(input: {
  orderRef: string; amountMinor: number; feeMinor: number; currency: string; notificationUrl: string; returnUrl: string; ip?: string;
}) {
  if (!config.MANTAPAY_MERCHANT_ID || !config.MANTAPAY_HASH_KEY) throw new Error("mantapay_not_configured");
  const currencyId = currencyIds[input.currency];
  if (!currencyId) throw new Error("unsupported_currency");
  const amount = (input.amountMinor / 100).toFixed(2);
  const feeRatio = input.feeMinor > 0 ? String(Number((input.feeMinor / input.amountMinor).toFixed(8))) : undefined;
  if (input.feeMinor >= input.amountMinor) throw new Error("mantapay_fee_exceeds_amount");
  const signature = digest(`${config.MANTAPAY_MERCHANT_ID}01${amount}${currencyId}${config.MANTAPAY_HASH_KEY}`);
  const fields: [string, string][] = [
    ["CompanyNum", config.MANTAPAY_MERCHANT_ID], ["TransType", "0"], ["Member", "Customer"], ["TypeCredit", "1"],
    ["Payments", "1"], ["Amount", amount], ["Currency", currencyId], ["Email", "customer@marketplace.invalid"],
    ["ClientIP", clientIp(input.ip)], ["Order", input.orderRef], ["CPM", config.MANTAPAY_CPM],
    ...(feeRatio ? [["ExtraCostAmount", feeRatio] as [string, string]] : []),
    ["RetURL", input.returnUrl], ["notification_url", input.notificationUrl], ["signature", signature],
  ];
  const url = `${config.MANTAPAY_PROCESS_BASE}/member/remote_charge.asp?${fields.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&")}`;
  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
  const direct = response.headers.get("location");
  if (direct && response.status >= 300 && response.status < 400) return direct;
  const responseFields = formDecode(await response.text());
  if (!response.ok || !responseFields.D3Redirect) throw new Error("mantapay_checkout_unavailable");
  return responseFields.D3Redirect;
}

export async function statusForOrder(orderRef: string) {
  if (!config.MANTAPAY_MERCHANT_ID || !config.MANTAPAY_HASH_KEY) throw new Error("mantapay_not_configured");
  const signature = digest(`${config.MANTAPAY_MERCHANT_ID}${orderRef}${config.MANTAPAY_HASH_KEY}`);
  const url = new URL("/member/getStatus.asp", config.MANTAPAY_PROCESS_BASE);
  url.search = new URLSearchParams({ CompanyNum: config.MANTAPAY_MERCHANT_ID, Order: orderRef, signature }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error("mantapay_status_unavailable");
  const body = await response.json() as { error?: string; data?: Record<string, string>[] };
  if (body.error && body.error !== "0") throw new Error("mantapay_status_unavailable");
  const attempts = (body.data ?? []).map((row) => ({
    transactionId: row.trans_id ?? row.TransID,
    replyCode: row.reply_code ?? row.replyCode ?? row.Reply,
    amountMinor: row.trans_amount ? Math.round(Number(row.trans_amount) * 100) : undefined,
    currency: row.trans_currency,
  }));
  const approved = attempts.find((entry) => paymentStatus(entry.replyCode) === "approved");
  const pending = attempts.find((entry) => paymentStatus(entry.replyCode) === "pending");
  return { status: approved ? "approved" : pending ? "pending" : attempts.length ? paymentStatus(attempts.at(-1)?.replyCode) : "unknown", attempt: approved ?? pending ?? attempts.at(-1) };
}
