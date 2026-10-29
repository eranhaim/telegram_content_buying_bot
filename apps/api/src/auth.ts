import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { config } from "./config.js";
import { customerLocale, type CustomerLocale } from "./customer-locale.js";
import { TelegramUser } from "./models.js";

export const BROWSER_CUSTOMER_LABEL = "browser users";

export type AppActor = { kind: "telegram"; userId: string; telegramId: string } | { kind: "browser"; userId: string } | { kind: "admin" };
declare global {
  namespace Express { interface Request { actor?: AppActor; } }
}

function secureEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function verifyTelegramInitData(initData: string) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !config.TELEGRAM_BOT_TOKEN) throw new Error("telegram_auth_unavailable");
  params.delete("hash");
  const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(config.TELEGRAM_BOT_TOKEN).digest();
  const expected = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (!secureEqual(hash, expected)) throw new Error("invalid_telegram_init_data");
  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > 3600) throw new Error("expired_telegram_init_data");
  const rawUser = params.get("user");
  if (!rawUser) throw new Error("missing_telegram_user");
  return JSON.parse(rawUser) as { id: number; username?: string; first_name?: string; last_name?: string; language_code?: string };
}

export async function issueTelegramSession(initData: string) {
  const user = verifyTelegramInitData(initData);
  const locale = customerLocale(user.language_code);
  const account = await TelegramUser.findOneAndUpdate(
    { telegramId: String(user.id) },
    { $set: { username: user.username, firstName: user.first_name, lastName: user.last_name, locale, lastSeenAt: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return {
    token: jwt.sign({ kind: "telegram", userId: String(account._id), telegramId: String(user.id) }, config.JWT_SECRET, { expiresIn: "15m" }),
    telegramId: String(user.id),
    locale: account.localeOverride ?? account.locale,
    actor: "telegram" as const,
  };
}

export function browserTelegramId(browserId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(browserId)) {
    throw new Error("invalid_browser_session");
  }
  return `browser:${browserId.toLowerCase()}`;
}

export function isBrowserCustomer(user: { telegramId?: string } | null | undefined) {
  return String(user?.telegramId ?? "").startsWith("browser:");
}

export function canReceiveProtectedDelivery(user: { telegramId?: string; chatId?: string } | null | undefined) {
  return Boolean(user?.chatId) && !isBrowserCustomer(user);
}

function browserSessionResponse(account: { _id: unknown; localeOverride?: string; locale?: string }) {
  return {
    token: jwt.sign({ kind: "browser", userId: String(account._id) }, config.JWT_SECRET, { expiresIn: "12h" }),
    locale: account.localeOverride ?? account.locale ?? "en",
    actor: "browser" as const,
  };
}

export async function issueBrowserSession(browserId: string) {
  const telegramId = browserTelegramId(browserId);
  const update = {
    $set: { firstName: BROWSER_CUSTOMER_LABEL, lastSeenAt: new Date() },
    $unset: { username: 1, chatId: 1, lastName: 1 },
    $setOnInsert: { telegramId, locale: "en" },
  };
  try {
    const account = await TelegramUser.findOneAndUpdate({ telegramId }, update, { upsert: true, new: true, setDefaultsOnInsert: true });
    return browserSessionResponse(account);
  } catch (error: unknown) {
    if ((error as { code?: number }).code !== 11000) throw error;
    const account = await TelegramUser.findOne({ telegramId });
    if (!account) throw error;
    return browserSessionResponse(account);
  }
}

export async function saveCustomerLocale(userId: string, locale: CustomerLocale) {
  await TelegramUser.updateOne({ _id: userId }, { $set: { localeOverride: locale } });
  return locale;
}

export function verifyAdminPassword(password: string) {
  const sharedPassword = config.ADMIN_SHARED_PASSWORD;
  return sharedPassword ? secureEqual(password, sharedPassword) : false;
}

export function issueAdminSession() {
  return jwt.sign({ kind: "admin" }, config.JWT_SECRET, { expiresIn: "4h" });
}

export function requireActor(kind?: AppActor["kind"] | "customer") {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "missing_token" });
    try {
      const actor = jwt.verify(token, config.JWT_SECRET) as AppActor;
      const isCustomer = actor.kind === "telegram" || actor.kind === "browser";
      const allowed = kind === "customer" ? isCustomer : !kind || actor.kind === kind;
      if (!actor.kind || !allowed) return res.status(403).json({ error: "forbidden" });
      req.actor = actor;
      next();
    } catch {
      return res.status(401).json({ error: "invalid_token" });
    }
  };
}
