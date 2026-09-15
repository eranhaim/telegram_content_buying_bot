import assert from "node:assert/strict";
import test from "node:test";
import { config } from "../src/config.js";
import { digest, parseWebhook, paymentStatus } from "../src/mantapay.js";

test("MantaPay uses SHA256 raw digest encoded as base64", () => {
  assert.equal(digest("abc"), "ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=");
});

test("MantaPay preserves non-numeric reply codes and maps pending states", () => {
  assert.equal(paymentStatus("000"), "approved");
  assert.equal(paymentStatus("001"), "pending");
  assert.equal(paymentStatus("663"), "pending");
  assert.equal(paymentStatus("N7"), "declined");
});

test("MantaPay webhook signatures cover the immutable payment fields", () => {
  config.MANTAPAY_HASH_KEY = "merchant-secret";
  const fields = new URLSearchParams({
    trans_id: "provider-1", trans_order: "MP-order", reply_code: "000", trans_amount: "12.34", trans_currency: "EUR",
  });
  fields.set("signature", digest(`${fields.get("trans_id")}${fields.get("trans_order")}${fields.get("reply_code")}${fields.get("trans_amount")}${fields.get("trans_currency")}merchant-secret`));
  assert.equal(parseWebhook(fields.toString()).valid, true);
  fields.set("trans_amount", "99.99");
  assert.equal(parseWebhook(fields.toString()).valid, false);
});
