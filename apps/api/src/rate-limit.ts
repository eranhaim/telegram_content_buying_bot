import type { NextFunction, Request, Response } from "express";

export function rateLimit(windowMs: number, max: number) {
  const attempts = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = `${req.ip}:${req.path}`;
    const record = attempts.get(key);
    if (!record || record.resetAt <= now) {
      attempts.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (record.count >= max) {
      res.setHeader("Retry-After", Math.ceil((record.resetAt - now) / 1000));
      return res.status(429).json({ error: "rate_limited" });
    }
    record.count += 1;
    next();
  };
}
