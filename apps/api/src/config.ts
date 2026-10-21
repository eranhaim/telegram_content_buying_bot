import "dotenv/config";
import { z } from "zod";

const env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3100),
  APP_ORIGIN: z.string().url().default("http://localhost:5173"),
  PUBLIC_APP_URL: z.string().url().default("http://localhost:5173"),
  MONGODB_URI: z.string().min(1).default("mongodb://localhost:27017/telegram_marketplace"),
  JWT_SECRET: z.string().min(16).default("development-secret-change-me"),
  ADMIN_SHARED_PASSWORD: z.string().min(1).optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(16).default("development-webhook-secret"),
  MARKETPLACE_CURRENCY: z.literal("EUR").default("EUR"),
  S3_ENDPOINT: z.string().url().optional(),
  S3_PUBLIC_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("marketplace-private"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  MANTAPAY_MERCHANT_ID: z.string().optional(),
  MANTAPAY_HASH_KEY: z.string().optional(),
  MANTAPAY_HOSTED_BASE: z.string().url().default("https://uiservices.mantapay.biz"),
  MANTAPAY_PROCESS_BASE: z.string().url().default("https://process.mantapay.biz"),
  MANTAPAY_WEBHOOK_SECRET: z.string().min(8).default("dev-mantapay-webhook-secret"),
}).parse(process.env);

export const config = {
  ...env,
  isProduction: env.NODE_ENV === "production",
  apiUrl: (path: string) => new URL(path, env.PUBLIC_APP_URL).toString(),
};

if (config.isProduction) {
  const missing = [
    config.JWT_SECRET.length >= 32 ? null : "JWT_SECRET (at least 32 characters)",
    config.ADMIN_SHARED_PASSWORD ? null : "ADMIN_SHARED_PASSWORD",
    config.TELEGRAM_BOT_TOKEN ? null : "TELEGRAM_BOT_TOKEN",
    config.PUBLIC_APP_URL.startsWith("https://") ? null : "PUBLIC_APP_URL (HTTPS)",
    // MantaPay fields not yet required — integration is WIP
  ].filter(Boolean);
  if (missing.length) throw new Error(`Production configuration is incomplete: ${missing.join(", ")}`);
}
