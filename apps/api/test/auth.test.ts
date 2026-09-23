import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

process.env.TELEGRAM_BOT_TOKEN = "test-telegram-bot-token";
const { verifyTelegramInitData } = await import("../src/auth.js");

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

test("forged Telegram initData is rejected", () => {
  const initData = signedInitData([
    ["auth_date", String(Math.floor(Date.now() / 1000))],
    ["user", JSON.stringify({ id: 123456, first_name: "Test" })],
  ]).replace("123456", "654321");

  assert.throws(() => verifyTelegramInitData(initData), /invalid_telegram_init_data/);
});
