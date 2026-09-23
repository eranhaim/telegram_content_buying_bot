import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "./config.js";

const enabled = Boolean(config.S3_ENDPOINT && config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY);
const options = {
  region: config.S3_REGION,
  forcePathStyle: config.S3_FORCE_PATH_STYLE,
  credentials: { accessKeyId: config.S3_ACCESS_KEY_ID!, secretAccessKey: config.S3_SECRET_ACCESS_KEY! },
};
const client = enabled ? new S3Client({ endpoint: config.S3_ENDPOINT, ...options }) : null;
// Browser uploads need a hostname reachable outside the Docker network while
// retaining the same S3 signature and credentials.
const publicClient = enabled ? new S3Client({ endpoint: config.S3_PUBLIC_ENDPOINT ?? config.S3_ENDPOINT, ...options }) : null;

export function objectKey(agencyId: string, assetId: string, filename: string) {
  return `agency/${agencyId}/assets/${assetId}/${filename.replace(/[^A-Za-z0-9._-]/g, "_")}`;
}

export async function signedUploadUrl(key: string, mimeType: string) {
  if (!publicClient) throw new Error("object_storage_not_configured");
  return getSignedUrl(publicClient, new PutObjectCommand({ Bucket: config.S3_BUCKET, Key: key, ContentType: mimeType }), { expiresIn: 900 });
}

export async function signedDownloadUrl(key: string) {
  if (!publicClient) throw new Error("object_storage_not_configured");
  return getSignedUrl(publicClient, new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key }), { expiresIn: 300 });
}

export async function storedObject(key: string) {
  if (!client) throw new Error("object_storage_not_configured");
  const object = await client.send(new HeadObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
  return { bytes: object.ContentLength, mimeType: object.ContentType };
}
