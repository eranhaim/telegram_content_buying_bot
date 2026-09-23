import "dotenv/config";
import { z } from "zod";

const env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3100),
  APP_ORIGIN: z.string().url().default("http://localhost:5173"),
  PUBLIC_APP_URL: z.string().url().default("http://localhost:5173"),
  MONGODB_URI: z.string().min(1).default("mongodb://localhost:27017/telegram_marketplace"),
  JWT_SECRET: z.string().min(16).default("development-secret-change-me"),
  ADMIN_EMAIL: z.string().email().default("admin@example.com"),
  ADMIN_PASSWORD: z.string().min(8).default("change-me"),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(16).default("development-webhook-secret"),
  MARKETPLACE_CURRENCY: z.enum(["EUR", "USD", "GBP"]).default("EUR"),
  S3_ENDPOINT: z.string().url().optional(),
  S3_PUBLIC_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("marketplace-private"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  HIGHERPAYS_API_BASE: z.string().url().optional(),
  HIGHERPAYS_MARKETPLACE_API_KEY: z.string().optional(),
  HIGHERPAYS_EVENT_SIGNING_SECRET: z.string().optional(),
}).parse(process.env);

export const config = {
  ...env,
  isProduction: env.NODE_ENV === "production",
  apiUrl: (path: string) => new URL(path, env.PUBLIC_APP_URL).toString(),
};

if (config.isProduction) {
  const missing = [
    config.JWT_SECRET.length >= 32 ? null : "JWT_SECRET (at least 32 characters)",
    config.TELEGRAM_BOT_TOKEN ? null : "TELEGRAM_BOT_TOKEN",
    config.PUBLIC_APP_URL.startsWith("https://") ? null : "PUBLIC_APP_URL (HTTPS)",
    config.HIGHERPAYS_API_BASE ? null : "HIGHERPAYS_API_BASE",
    config.HIGHERPAYS_MARKETPLACE_API_KEY ? null : "HIGHERPAYS_MARKETPLACE_API_KEY",
    config.HIGHERPAYS_EVENT_SIGNING_SECRET ? null : "HIGHERPAYS_EVENT_SIGNING_SECRET",
  ].filter(Boolean);
  if (missing.length) throw new Error(`Production configuration is incomplete: ${missing.join(", ")}`);
}
