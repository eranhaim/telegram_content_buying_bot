import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "./config.js";

const configured = Boolean(
  config.TELESCOPE_S3_BUCKET
  && config.TELESCOPE_S3_ACCESS_KEY
  && config.TELESCOPE_S3_SECRET_KEY,
);

const client = configured
  ? new S3Client({
    region: config.TELESCOPE_S3_REGION,
    credentials: {
      accessKeyId: config.TELESCOPE_S3_ACCESS_KEY!,
      secretAccessKey: config.TELESCOPE_S3_SECRET_KEY!,
    },
  })
  : null;

const cache = new Map<string, { url: string; expiresAt: number }>();
const URL_EXPIRY_SECONDS = 60 * 60;
const CACHE_TTL_MS = 50 * 60 * 1000;

export async function signedTelescopeUrl(key: string | undefined): Promise<string | undefined> {
  if (!key || !client || !config.TELESCOPE_S3_BUCKET) return undefined;

  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: config.TELESCOPE_S3_BUCKET, Key: key }),
    { expiresIn: URL_EXPIRY_SECONDS },
  );
  cache.set(key, { url, expiresAt: Date.now() + CACHE_TTL_MS });
  return url;
}
