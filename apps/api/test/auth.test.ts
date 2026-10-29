import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

process.env.TELEGRAM_BOT_TOKEN = "test-telegram-bot-token";
const { browserTelegramId, canReceiveProtectedDelivery, saveCustomerLocale, verifyTelegramInitData } = await import("../src/auth.js");
const { TelegramUser } = await import("../src/models.js");

function signedInitData(entries: [string, string][]) {
  const dataCheckString = [...entries].sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(process.env.TELEGRAM_BOT_TOKEN!).digest();
  const hash = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  return new URLSearchParams([...entries, ["hash", hash]]).toString();
}

test("Telegram identity is derived from signed initData", () => {
  const initData = signedInitData([
    ["auth_date", String(Math.floor(Date.now() / 1000))],
    ["query_id", "AAEAAAE"],
    ["user", JSON.stringify({ id: 123456, first_name: "Test" })],
  ]);

  assert.deepEqual(verifyTelegramInitData(initData), { id: 123456, first_name: "Test" });
});

test("Telegram language code is accepted only from signed initData", () => {
  const initData = signedInitData([
    ["auth_date", String(Math.floor(Date.now() / 1000))],
    ["user", JSON.stringify({ id: 123456, first_name: "Test", language_code: "he" })],
  ]);

  assert.equal(verifyTelegramInitData(initData).language_code, "he");
});

test("browser session ids are not Telegram accounts", () => {
  assert.equal(browserTelegramId("11111111-1111-4111-8111-111111111111"), "browser:11111111-1111-4111-8111-111111111111");
  assert.throws(() => browserTelegramId("123456"), /invalid_browser_session/);
  assert.throws(() => browserTelegramId("browser:11111111-1111-4111-8111-111111111111"), /invalid_browser_session/);
});

test("protected delivery requires a Telegram chat started with the bot", () => {
  assert.equal(canReceiveProtectedDelivery({ telegramId: "123", chatId: "123" }), true);
  assert.equal(canReceiveProtectedDelivery({ telegramId: "123" }), false);
  assert.equal(canReceiveProtectedDelivery({ telegramId: "browser:11111111-1111-4111-8111-111111111111", chatId: "123" }), false);
});

test("forged Telegram initData is rejected", () => {
  const initData = signedInitData([
    ["auth_date", String(Math.floor(Date.now() / 1000))],
    ["user", JSON.stringify({ id: 123456, first_name: "Test" })],
  ]).replace("123456", "654321");

  assert.throws(() => verifyTelegramInitData(initData), /invalid_telegram_init_data/);
});

test("customer locale overrides are persisted separately from Telegram language", async () => {
  const originalUpdate = TelegramUser.updateOne;
  let filter: unknown;
  let update: unknown;
  TelegramUser.updateOne = async (nextFilter: unknown, nextUpdate: unknown) => {
    filter = nextFilter;
    update = nextUpdate;
    return {} as never;
  };
  try {
    assert.equal(await saveCustomerLocale("user-id", "he"), "he");
    assert.deepEqual(filter, { _id: "user-id" });
    assert.deepEqual(update, { $set: { localeOverride: "he" } });
  } finally {
    TelegramUser.updateOne = originalUpdate;
  }
});
