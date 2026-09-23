import assert from "node:assert/strict";
import test from "node:test";

process.env.HIGHERPAYS_EVENT_SIGNING_SECRET = "test-event-secret";
const { signHigherPaysEvent, verifyHigherPaysEvent } = await import("../src/higherpays.js");

test("HigherPays lifecycle events are HMAC signed over timestamp, id, and raw body", () => {
  const timestamp = new Date().toISOString();
  const eventId = "e0c80e6b-26bc-4ec1-91d7-b62187813a20";
  const body = '{"amountMinor":1200,"currency":"EUR"}';
  const signature = signHigherPaysEvent(timestamp, eventId, body);
  assert.equal(verifyHigherPaysEvent(timestamp, eventId, signature, body), true);
  assert.equal(verifyHigherPaysEvent(timestamp, eventId, signature, '{"amountMinor":9999,"currency":"EUR"}'), false);
});

test("HigherPays event replay window rejects stale timestamps", () => {
  const timestamp = new Date(Date.now() - 6 * 60_000).toISOString();
  const eventId = "e0c80e6b-26bc-4ec1-91d7-b62187813a20";
  const body = "{}";
  assert.equal(verifyHigherPaysEvent(timestamp, eventId, signHigherPaysEvent(timestamp, eventId, body), body), false);
});
