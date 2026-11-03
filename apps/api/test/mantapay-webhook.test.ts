import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import { once } from "node:events";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.MANTAPAY_MERCHANT_ID = "test-merchant";
process.env.MANTAPAY_HASH_KEY = "test-private-hash-key";
process.env.PUBLIC_APP_URL = "https://example.test";
const { createCheckoutForOrder, verifyWebhookSignature } = await import("../src/mantapay.js");
const { app } = await import("../src/app.js");

test("checkout notification URL contains no webhook secret", () => {
  const result = createCheckoutForOrder({ publicId: "order-1", totalMinor: 4900, currency: "EUR", lines: [{ productTitle: "Example" }], returnNonce: "nonce", expiresAt: new Date(Date.now() + 60000) });
  const url = new URL(result.checkoutUrl);
  assert.equal(url.searchParams.get("notification_url"), "https://example.test/api/webhooks/mantapay");
  assert.ok(!result.checkoutUrl.includes("dev-mantapay-webhook-secret"));
});

test("callback signature rejects tampering and missing signatures", () => {
  const values = ["transaction", "order", "000", "49.00", "EUR"];
  const signature = crypto.createHash("sha256").update(values.join("") + "test-private-hash-key").digest("base64");
  const body = new URLSearchParams({ trans_id: values[0], trans_order: values[1], reply_code: values[2], trans_amount: values[3], trans_currency: values[4], signature });
  assert.equal(verifyWebhookSignature(body.toString(), "test-private-hash-key"), true);
  body.set("trans_amount", "1.00");
  assert.equal(verifyWebhookSignature(body.toString(), "test-private-hash-key"), false);
  assert.equal(verifyWebhookSignature("trans_order=order", "test-private-hash-key"), false);
});

test("unsigned callbacks are rejected before accessing the database", async () => {
  const server = http.createServer(app); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); if (!address || typeof address === "string") throw new Error("server_address_unavailable");
  try {
    for (const path of ["/api/webhooks/mantapay", "/api/webhooks/mantapay/old-link"]) {
      const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "trans_order=order&reply_code=000" });
      assert.equal(response.status, 401);
    }
  } finally { server.close(); await once(server, "close"); }
});
