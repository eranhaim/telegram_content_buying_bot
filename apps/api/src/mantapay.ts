import crypto from "node:crypto";
import { config } from "./config.js";

// MantaPay hosted-page checkout + webhook handler.
//
// Ported from the HigherPays MantaPay provider. The signature scheme:
//   SHA256(concat(raw values in request order) + hashKey) → base64 → URL-encode
//
// The hash uses RAW (un-encoded) values. The wire uses .NET-encoded values.
// They diverge: space is "+" on the wire but " " in the hash.

const HOSTED_PATH = "/hosted/default.aspx";
const STATUS_PATH = "/member/getStatus.asp";

const MAX_LEN: Record<string, number> = {
  disp_payFor: 40,
  trans_refNum: 100,
  client_fullName: 50,
  client_email: 50,
  client_phoneNum: 15,
  notification_url: 255,
  url_redirect: 255,
};

function clip(v: unknown, maxLen?: number): string {
  if (v == null) return "";
  const s = String(v);
  return maxLen ? s.slice(0, maxLen) : s;
}

// .NET HttpUtility.UrlEncode: space → "+", hex escapes lowercase.
// encodeURIComponent gives "%20" for space and uppercase hex — both wrong.
function urlEncodeDotNet(value: string): string {
  return encodeURIComponent(value)
    .replace(/%20/g, "+")
    .replace(/[!'()*]/g, (ch) => "%" + ch.charCodeAt(0).toString(16))
    .replace(/%[0-9A-F]{2}/g, (m) => m.toLowerCase());
}

function sha256Base64(payload: string): string {
  return crypto.createHash("sha256").update(payload, "utf8").digest("base64");
}

// --- Reply code classification (from MantaPay's Reply Codes page) ---

const REPLY_APPROVED = new Set(["000"]);
const REPLY_PENDING = new Set(["553", "663", "001"]);
const REPLY_ABANDONED = new Set(["600"]);

export type MantapayStatus = "approved" | "declined" | "pending" | "abandoned" | "unknown";

export function mapReplyCode(code: string | null | undefined): MantapayStatus {
  const c = String(code ?? "").trim();
  if (c === "") return "unknown";
  if (REPLY_APPROVED.has(c)) return "approved";
  if (REPLY_PENDING.has(c)) return "pending";
  if (REPLY_ABANDONED.has(c)) return "abandoned";
  return "declined";
}

// --- Checkout URL builder ---

export type CheckoutResult = {
  checkoutUrl: string;
  signature: string;
};

export function buildCheckout(options: {
  merchantId: string;
  hashKey: string;
  amount: number;
  currency: string;
  reference: string;
  description: string;
  notificationUrl: string;
  redirectUrl: string;
  expiresAt?: Date | number;
  language?: string;
  customerName?: string;
  customerEmail?: string;
}): CheckoutResult {
  const { merchantId, hashKey, amount, currency, reference, description,
    notificationUrl, redirectUrl, expiresAt, language,
    customerName, customerEmail } = options;

  if (!hashKey) throw new Error("mantapay_hash_key_missing");
  if (!merchantId) throw new Error("mantapay_merchant_id_missing");
  if (!(amount > 0)) throw new Error("invalid_amount");

  // ExpiredOn is epoch SECONDS in GMT. Omit entirely when no deadline —
  // the hosted page rejects an empty value.
  let expiredOn = "";
  if (expiresAt) {
    const ms = expiresAt instanceof Date ? expiresAt.getTime() : Number(expiresAt);
    if (Number.isFinite(ms)) expiredOn = String(Math.floor(ms / 1000));
  }

  // ONE ordered list → query string AND signature. They cannot drift.
  const fields: [string, string][] = [
    ["merchantID", clip(merchantId)],
    ["trans_type", "0"],              // 0 = debit (sale)
    ["trans_installments", "1"],      // non-instalment
    ["trans_amount", amount.toFixed(2)],
    ["trans_currency", clip(currency || "EUR")],
    ["trans_refNum", clip(reference, MAX_LEN.trans_refNum)],
    ["disp_payFor", clip(description, MAX_LEN.disp_payFor)],
    ["disp_lng", clip(language || "en-US")],
    ["client_fullName", clip(customerName, MAX_LEN.client_fullName)],
    ["client_email", clip(customerEmail, MAX_LEN.client_email)],
    ["notification_url", clip(notificationUrl, MAX_LEN.notification_url)],
    ["url_redirect", clip(redirectUrl, MAX_LEN.url_redirect)],
  ];
  if (expiredOn) fields.push(["ExpiredOn", expiredOn]);

  // Signature: hash RAW values (not encoded) in request order, append hashKey.
  const order = fields.map(([k]) => k);
  const params = Object.fromEntries(fields);
  const signedString = order
    .map((k) => (params[k] == null || params[k] === "" ? "" : String(params[k])))
    .join("") + hashKey;
  const base64Sig = sha256Base64(signedString);

  const query = fields
    .map(([k, v]) => `${k}=${v === "" ? "" : urlEncodeDotNet(v)}`)
    .join("&") + `&signature=${encodeURIComponent(base64Sig)}`;

  return {
    checkoutUrl: `${config.MANTAPAY_HOSTED_BASE}${HOSTED_PATH}?${query}`,
    signature: base64Sig,
  };
}

// --- Webhook parsing ---

export type MantapayWebhookPayment = {
  kind: "payment";
  transactionId: string | null;
  referenceId: string | null;
  replyCode: string | null;
  replyDesc: string | null;
  status: MantapayStatus;
  grossAmount: number | null;
  currency: string | null;
  clientEmail: string | null;
  clientName: string | null;
  occurredAt: string | null;
  fields: Record<string, string>;
};

export function parseFormBody(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of text.split("&")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).replace(/\+/g, " "));
  }
  return out;
}

export function parseWebhook(raw: string | Buffer): MantapayWebhookPayment {
  const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw || "");
  const p = parseFormBody(text);
  const code = p.reply_code ?? p.replyCode ?? p.Reply ?? p.ReplyCode ?? null;
  return {
    kind: "payment",
    transactionId: p.trans_id || null,
    referenceId: p.trans_order || null,
    replyCode: code,
    replyDesc: p.reply_desc ?? p.replyDesc ?? null,
    status: mapReplyCode(code),
    grossAmount: p.trans_amount != null ? Number(p.trans_amount) : null,
    currency: p.trans_currency || null,
    clientEmail: p.client_email || null,
    clientName: p.client_fullname || null,
    occurredAt: p.trans_date || null,
    fields: p,
  };
}

// Notification signs a SUBSET of fields:
//   payment: trans_id + trans_order + reply_code + trans_amount + trans_currency
// Values are hashed EXACTLY as received, after URL-decoding.
const PAYMENT_SIGNED_FIELDS = ["trans_id", "trans_order", "reply_code", "trans_amount", "trans_currency"];

export function verifyWebhookSignature(raw: string | Buffer, hashKey: string): boolean {
  const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw || "");
  const p = parseFormBody(text);
  const provided = p.signature ?? p.Signature ?? null;
  if (!provided || !hashKey) return false;
  const base = PAYMENT_SIGNED_FIELDS.map((f) => (p[f] == null ? "" : String(p[f]))).join("");
  const expected = sha256Base64(base + hashKey);
  const x = Buffer.from(String(provided));
  const y = Buffer.from(expected);
  if (x.length !== y.length) return false;
  try { return crypto.timingSafeEqual(x, y); } catch { return false; }
}

// --- Status check (reconciliation safety net) ---

export type StatusTransaction = {
  replyCode: string | null;
  replyDesc: string | null;
  transId: string | null;
  date: string | null;
  amount: number | null;
  currency: string | null;
  status: MantapayStatus;
};

function parseTransDate(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(String(v).trim());
  if (!m) { const d = new Date(v); return isNaN(d.getTime()) ? null : d.toISOString(); }
  return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6])).toISOString();
}

export async function getStatusByOrder(reference: string): Promise<{
  ok: boolean;
  status: MantapayStatus;
  transaction: StatusTransaction | null;
  transactions: StatusTransaction[];
}> {
  const merchantId = config.MANTAPAY_MERCHANT_ID;
  const hashKey = config.MANTAPAY_HASH_KEY;
  if (!merchantId || !hashKey) throw new Error("mantapay_not_configured");

  const signature = sha256Base64(String(merchantId) + String(reference) + hashKey);
  const qs = new URLSearchParams({
    Order: String(reference),
    CompanyNum: String(merchantId),
    signature,
  }).toString();

  const r = await fetch(`${config.MANTAPAY_PROCESS_BASE}${STATUS_PATH}?${qs}`, {
    method: "GET",
    signal: AbortSignal.timeout(10_000),
  });
  const text = await r.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { /* not JSON */ }
  if (!body) throw new Error("mantapay_status_unparseable");
  if (body.error && String(body.error) !== "0") {
    return { ok: false, status: "unknown", transaction: null, transactions: [] };
  }

  const transactions: StatusTransaction[] = (body.data || []).map((d: any) => {
    const code = d.reply_code ?? d.replyCode ?? d.Reply ?? d.ReplyCode ?? null;
    return {
      replyCode: code,
      replyDesc: d.reply_desc ?? d.replyDesc ?? null,
      transId: d.trans_id != null ? String(d.trans_id) : (d.TransID != null ? String(d.TransID) : null),
      date: parseTransDate(d.trans_date),
      amount: d.trans_amount != null ? Number(d.trans_amount) : null,
      currency: d.trans_currency || null,
      status: mapReplyCode(code),
    };
  });

  // Resolve outcome: approved wins, then pending, then latest.
  const approved = transactions.find((t) => t.status === "approved");
  if (approved) return { ok: true, status: "approved", transaction: approved, transactions };
  const pending = transactions.find((t) => t.status === "pending");
  if (pending) return { ok: true, status: "pending", transaction: pending, transactions };
  if (!transactions.length) return { ok: true, status: "unknown", transaction: null, transactions };
  const latest = [...transactions].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))[0];
  return { ok: true, status: latest.status, transaction: latest, transactions };
}

// --- High-level: build checkout for an order ---

export function createCheckoutForOrder(order: any): CheckoutResult {
  const merchantId = config.MANTAPAY_MERCHANT_ID;
  const hashKey = config.MANTAPAY_HASH_KEY;
  if (!merchantId || !hashKey) throw new Error("mantapay_not_configured");

  const amountEur = Number((order.totalMinor / 100).toFixed(2));
  const description = order.lines.length === 1
    ? order.lines[0].productTitle
    : `${order.lines.length} items`;

  return buildCheckout({
    merchantId,
    hashKey,
    amount: amountEur,
    currency: order.currency,
    reference: order.publicId,
    description,
    notificationUrl: config.apiUrl(`/api/webhooks/mantapay/${config.MANTAPAY_WEBHOOK_SECRET}`),
    redirectUrl: config.apiUrl(`/payment-complete?order=${order.publicId}&state=${order.returnNonce}`),
    expiresAt: order.expiresAt,
  });
}
