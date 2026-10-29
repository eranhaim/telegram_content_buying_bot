import assert from "node:assert/strict";
import test from "node:test";
import { adminCopy, adminDirection, adminLanguage } from "../src/admin-i18n.js";

test("admin language safely defaults to English and enables Hebrew RTL", () => {
  assert.equal(adminLanguage("he"), "he");
  assert.equal(adminLanguage(null), "en");
  assert.equal(adminLanguage("unsupported"), "en");
  assert.equal(adminDirection("he"), "rtl");
  assert.equal(adminDirection("en"), "ltr");
});

test("admin copy translates marketplace attribution guidance", () => {
  assert.match(adminCopy.en.attributionHelp, /MantaPay/i);
  assert.match(adminCopy.he.attributionHelp, /MantaPay/);
  assert.match(adminCopy.he.secretWarning, /לעולם אין/);
});

test("product admin copy describes optional customer delivery text", () => {
  assert.match(adminCopy.en.deliveryMessage, /optional/i);
  assert.match(adminCopy.he.deliveryMessage, /לא חובה/);
  assert.equal(adminCopy.en.editContent, "Edit content");
  assert.equal(adminCopy.he.editContent, "עריכת תוכן");
});
