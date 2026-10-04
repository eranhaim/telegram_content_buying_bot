import assert from "node:assert/strict";
import test from "node:test";
import { customerBotCopy, customerLocale, isCustomerLocale } from "../src/customer-locale.js";

test("maps signed Telegram language codes to supported locales with English fallback", () => {
  assert.equal(customerLocale("he"), "he");
  assert.equal(customerLocale("iw-IL"), "he");
  assert.equal(customerLocale("pt-BR"), "pt-BR");
  assert.equal(customerLocale("pt-PT"), "pt-PT");
  assert.equal(customerLocale("pt-AO"), "pt-BR");
  assert.equal(customerLocale("unknown"), "en");
});

test("accepts only stored locale values and localizes bot delivery text", () => {
  assert.equal(isCustomerLocale("he"), true);
  assert.equal(isCustomerLocale("pt"), false);
  assert.match(customerBotCopy("he").deliveryStarting, /התוכן/);
  assert.match(customerBotCopy("fr").support, /paiement/i);
});
