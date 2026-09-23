import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { config } from "./config.js";
import { TelegramUser } from "./models.js";

export type AppActor = { kind: "telegram"; userId: string; telegramId: string } | { kind: "admin"; email: string };
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
  return JSON.parse(rawUser) as { id: number; username?: string; first_name?: string; last_name?: string };
}

export async function issueTelegramSession(initData: string) {
  const user = verifyTelegramInitData(initData);
  const account = await TelegramUser.findOneAndUpdate(
    { telegramId: String(user.id) },
    { $set: { username: user.username, firstName: user.first_name, lastName: user.last_name, lastSeenAt: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return {
    token: jwt.sign({ kind: "telegram", userId: String(account._id), telegramId: String(user.id) }, config.JWT_SECRET, { expiresIn: "15m" }),
    telegramId: String(user.id),
  };
}

export function issueAdminSession(email: string) {
  return jwt.sign({ kind: "admin", email }, config.JWT_SECRET, { expiresIn: "8h" });
}

export function requireActor(kind?: AppActor["kind"]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "missing_token" });
    try {
      const actor = jwt.verify(token, config.JWT_SECRET) as AppActor;
      if (!actor.kind || (kind && actor.kind !== kind)) return res.status(403).json({ error: "forbidden" });
      req.actor = actor;
      next();
    } catch {
      return res.status(401).json({ error: "invalid_token" });
    }
  };
}
