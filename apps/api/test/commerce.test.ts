import assert from "node:assert/strict";
import test from "node:test";
import { entitlementAction, orderPublicId, previewIsConfigured, sumMinor } from "../src/commerce.js";

test("selected preview must be configured unless preview is disabled", () => {
  assert.equal(previewIsConfigured("blurred"), false);
  assert.equal(previewIsConfigured("visible", "asset-1"), true);
  assert.equal(previewIsConfigured("none"), true);
});

test("cart totals use exact minor units", () => {
  assert.equal(sumMinor([199, 349, 1]), 549);
  assert.throws(() => sumMinor([Number.MAX_SAFE_INTEGER, 1]), /invalid_cart_total/);
});

test("a cart produces one stable checkout idempotency reference", () => {
  assert.equal(orderPublicId("66cb0f4e4c4d4cbd23fabe11"), "ord_66cb0f4e4c4d4cbd23fabe11");
});

test("payment lifecycle grants and revokes entitlement only once", () => {
  assert.equal(entitlementAction("pending", "approved"), "grant");
  assert.equal(entitlementAction("paid", "approved"), "none");
  assert.equal(entitlementAction("paid", "refunded"), "revoke");
  assert.equal(entitlementAction("refunded", "chargeback"), "none");
});
