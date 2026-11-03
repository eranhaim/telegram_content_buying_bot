import assert from "node:assert/strict";
import test from "node:test";
import { customerBotCopy, customerLocale, isCustomerLocale, resolveCustomerLocale } from "../src/customer-locale.js";
import { customerCountry } from "../src/customer-region.js";

test("maps signed Telegram language codes to supported locales with English fallback", () => {
  assert.equal(customerLocale("he"), "he");
  assert.equal(customerLocale("iw-IL"), "he");
  assert.equal(customerLocale("pt-BR"), "pt-BR");
  assert.equal(customerLocale("pt-PT"), "pt-PT");
  assert.equal(customerLocale("pt-AO"), "pt-BR");
  assert.equal(customerLocale("unknown"), "en");
});

test("uses Telegram language first, then location and other available preferences", () => {
  assert.equal(resolveCustomerLocale({ telegramLanguage: "fr-CA", country: "IL" }), "fr");
  assert.equal(resolveCustomerLocale({ telegramLanguage: "ja", country: "IL" }), "he");
  assert.equal(resolveCustomerLocale({ country: "PT", browserLanguage: "en-US" }), "pt-PT");
  assert.equal(resolveCustomerLocale({ browserLanguage: "ru-RU" }), "ru");
  assert.equal(resolveCustomerLocale({ previousLocale: "ar" }), "ar");
  assert.equal(resolveCustomerLocale({ telegramLanguage: "ja", country: "XX" }), "en");
});

test("uses the visitor address from the deployed two-proxy chain", () => {
  assert.equal(customerCountry({ headers: { "x-forwarded-for": "8.8.8.8, 172.18.0.1" }, ip: "172.18.0.2" }), "US");
  assert.equal(customerCountry({ headers: { "x-forwarded-for": "invalid, 172.18.0.1" }, ip: "172.18.0.2" }), undefined);
});

test("accepts only stored locale values and localizes bot delivery text", () => {
  assert.equal(isCustomerLocale("he"), true);
  assert.equal(isCustomerLocale("pt"), false);
  assert.match(customerBotCopy("he").deliveryStarting, /התוכן/);
  assert.match(customerBotCopy("fr").support, /paiement/i);
});
