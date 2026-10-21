/**
 * Fix seeded Telescope products: copy thumbnails from Telescope's AWS S3
 * into the marketplace's MinIO, create preview MediaAssets, and update
 * each product to previewMode "blurred".
 *
 * Also copies the actual video files so delivery works post-purchase.
 *
 * Derives thumbnail keys from the video key pattern:
 *   profiles/{id}/media/{uuid}.mp4  →  profiles/{id}/media/{uuid}_thumb.jpg
 *
 * Requires environment variables:
 *   TELESCOPE_S3_BUCKET     – Telescope's S3 bucket name
 *   TELESCOPE_S3_REGION     – Telescope's AWS region
 *   TELESCOPE_S3_ACCESS_KEY – Telescope's AWS access key
 *   TELESCOPE_S3_SECRET_KEY – Telescope's AWS secret key
 *
 * Plus the standard marketplace env (MONGODB_URI, S3_* for MinIO).
 *
 * Usage:
 *   npx tsx apps/api/src/fix-telescope-previews.ts
 */
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import mongoose from "mongoose";
import { config } from "./config.js";
import { MediaAsset, Product } from "./models.js";

const TELESCOPE_BUCKET = process.env.TELESCOPE_S3_BUCKET!;
const TELESCOPE_REGION = process.env.TELESCOPE_S3_REGION || "us-east-1";

if (!TELESCOPE_BUCKET || !process.env.TELESCOPE_S3_ACCESS_KEY || !process.env.TELESCOPE_S3_SECRET_KEY) {
  console.error("Missing required TELESCOPE_* env vars. See script header.");
  process.exit(1);
}

const telescopeS3 = new S3Client({
  region: TELESCOPE_REGION,
  credentials: {
    accessKeyId: process.env.TELESCOPE_S3_ACCESS_KEY!,
    secretAccessKey: process.env.TELESCOPE_S3_SECRET_KEY!,
  },
});

const marketplaceS3 = new S3Client({
  endpoint: config.S3_ENDPOINT,
  region: config.S3_REGION,
  forcePathStyle: config.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: config.S3_ACCESS_KEY_ID!,
    secretAccessKey: config.S3_SECRET_ACCESS_KEY!,
  },
});

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function copyObject(telescopeKey: string, marketplaceKey: string, mimeType: string): Promise<number> {
  const response = await telescopeS3.send(new GetObjectCommand({ Bucket: TELESCOPE_BUCKET, Key: telescopeKey }));
  if (!response.Body) throw new Error(`Empty body for ${telescopeKey}`);
  const buffer = await streamToBuffer(response.Body as Readable);
  await marketplaceS3.send(new PutObjectCommand({
    Bucket: config.S3_BUCKET,
    Key: marketplaceKey,
    Body: buffer,
    ContentType: mimeType,
  }));
  return buffer.length;
}

/** Derive thumbnail key from video key: {uuid}.mp4 → {uuid}_thumb.jpg */
function thumbnailKey(videoKey: string): string {
  return videoKey.replace(/\.(mp4|mov|webm)$/i, "_thumb.jpg");
}

async function main() {
  await mongoose.connect(config.MONGODB_URI);
  console.log("Connected to marketplace MongoDB.\n");

  const products = await Product.find({ status: "published" }).lean();
  console.log(`Found ${products.length} published products.\n`);

  let previewsCreated = 0;
  let videosCopied = 0;
  let errors = 0;

  for (const product of products) {
    const deliveryAssetId = product.mediaAssetIds?.[0];
    if (!deliveryAssetId) {
      console.log(`  SKIP ${product.title}: no delivery asset`);
      continue;
    }

    const deliveryAsset: any = await MediaAsset.findById(deliveryAssetId).lean();
    if (!deliveryAsset) {
      console.log(`  SKIP ${product.title}: delivery asset not found`);
      continue;
    }

    const currentKey: string = deliveryAsset.storageKey;
    const isTelescopeKey = currentKey.startsWith("profiles/");

    // 1. Copy the video file to marketplace MinIO (if still a Telescope key).
    if (isTelescopeKey) {
      const safeFileName: string = deliveryAsset.fileName.replace(/[^A-Za-z0-9._-]/g, "_");
      const marketplaceDeliveryKey = `agency/${product.agencyId}/assets/${deliveryAssetId}/${safeFileName}`;
      try {
        const bytes = await copyObject(currentKey, marketplaceDeliveryKey, deliveryAsset.mimeType);
        await MediaAsset.updateOne({ _id: deliveryAssetId }, { $set: { storageKey: marketplaceDeliveryKey, bytes } });
        videosCopied++;
        console.log(`  ✓ Video copied: ${product.title} (${(bytes / 1_000_000).toFixed(1)} MB)`);
      } catch (err) {
        console.log(`  ✗ Video copy failed for ${product.title}: ${(err as Error).message}`);
        errors++;
        continue;
      }
    } else {
      console.log(`  – Video already migrated: ${product.title}`);
    }

    // 2. Create preview asset (skip if product already has one).
    if (product.previewAssetId) {
      console.log(`  – Preview already set: ${product.title}`);
      continue;
    }

    // Derive thumbnail key from the original Telescope video key.
    const thumbKey = isTelescopeKey ? thumbnailKey(currentKey) : null;
    if (!thumbKey) {
      console.log(`  – Cannot derive thumbnail for already-migrated: ${product.title}`);
      continue;
    }

    const previewFileName = thumbKey.split("/").pop() || "thumb.jpg";
    const previewAsset = await MediaAsset.create({
      agencyId: product.agencyId,
      storageKey: "pending",
      fileName: previewFileName,
      mimeType: "image/jpeg",
      bytes: 1,
      sha256: crypto.createHash("sha256").update(thumbKey).digest("hex"),
      purpose: "preview",
      status: "ready",
    });
    const marketplacePreviewKey = `agency/${product.agencyId}/assets/${previewAsset._id}/${previewFileName}`;
    try {
      const bytes = await copyObject(thumbKey, marketplacePreviewKey, "image/jpeg");
      await MediaAsset.updateOne({ _id: previewAsset._id }, { $set: { storageKey: marketplacePreviewKey, bytes } });
      await Product.updateOne({ _id: product._id }, { $set: { previewAssetId: previewAsset._id, previewMode: "blurred" } });
      previewsCreated++;
      console.log(`  ✓ Preview created: ${product.title}`);
    } catch (err) {
      // Thumbnail might not exist — try using the video itself as preview.
      await MediaAsset.deleteOne({ _id: previewAsset._id });
      console.log(`  ✗ Thumbnail not found for ${product.title}: ${(err as Error).message}`);

      // Fallback: create a preview asset pointing to the video file itself.
      const videoPreviewAsset = await MediaAsset.create({
        agencyId: product.agencyId,
        storageKey: `agency/${product.agencyId}/assets/${deliveryAssetId}/${deliveryAsset.fileName.replace(/[^A-Za-z0-9._-]/g, "_")}`,
        fileName: deliveryAsset.fileName,
        mimeType: deliveryAsset.mimeType,
        bytes: deliveryAsset.bytes,
        sha256: crypto.createHash("sha256").update(currentKey + "-preview").digest("hex"),
        purpose: "preview",
        status: "ready",
      });
      await Product.updateOne({ _id: product._id }, { $set: { previewAssetId: videoPreviewAsset._id, previewMode: "blurred" } });
      previewsCreated++;
      console.log(`  ✓ Video-as-preview fallback: ${product.title}`);
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log(`Videos copied:    ${videosCopied}`);
  console.log(`Previews created: ${previewsCreated}`);
  console.log(`Errors:           ${errors}`);
  console.log("=".repeat(50));

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Fix script failed:", err);
  process.exit(1);
});
