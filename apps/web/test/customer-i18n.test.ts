import assert from "node:assert/strict";
import test from "node:test";
import { customerCopy, customerDirection, customerLocale, customerLocales } from "../src/customer-i18n.js";

test("customer locale safely falls back to English", () => {
  assert.equal(customerLocale("pt-BR"), "pt-BR");
  assert.equal(customerLocale("unsupported"), "en");
  assert.equal(customerLocale(null), "en");
});

test("every customer locale has complete fixed checkout and access copy", () => {
  for (const locale of customerLocales) {
    const copy = customerCopy[locale];
    assert.ok(copy.secureCheckout);
    assert.ok(copy.paymentConfirmed);
    assert.ok(copy.ageText);
    assert.equal(copy.guideSteps.length, 4);
  }
});

test("Hebrew enables RTL with localized customer text", () => {
  assert.equal(customerDirection("he"), "rtl");
  assert.equal(customerDirection("en"), "ltr");
  assert.match(customerCopy.he.discoverTitle, /גלו/);
  assert.match(customerCopy.he.secureCheckout, /תשלום/);
});
