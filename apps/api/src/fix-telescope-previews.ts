/**
 * Fix seeded Telescope products: copy thumbnails from Telescope's AWS S3
 * into the marketplace's MinIO, create preview MediaAssets, and update
 * each product to previewMode "blurred".
 *
 * Also copies the actual video files so delivery works post-purchase.
 *
 * Requires environment variables:
 *   TELESCOPE_S3_BUCKET     – Telescope's S3 bucket name
 *   TELESCOPE_S3_REGION     – Telescope's AWS region
 *   TELESCOPE_S3_ACCESS_KEY – Telescope's AWS access key
 *   TELESCOPE_S3_SECRET_KEY – Telescope's AWS secret key
 *   TELESCOPE_MONGODB_URI   – Telescope's MongoDB connection string
 *
 * Plus the standard marketplace env (MONGODB_URI, S3_* for MinIO).
 *
 * Usage:
 *   npx tsx apps/api/src/fix-telescope-previews.ts
 */
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { MongoClient, ObjectId } from "mongodb";
import mongoose from "mongoose";
import { config } from "./config.js";
import { MediaAsset, Product } from "./models.js";

const TELESCOPE_URI = process.env.TELESCOPE_MONGODB_URI!;
const TELESCOPE_BUCKET = process.env.TELESCOPE_S3_BUCKET!;
const TELESCOPE_REGION = process.env.TELESCOPE_S3_REGION || "us-east-1";

if (!TELESCOPE_URI || !TELESCOPE_BUCKET || !process.env.TELESCOPE_S3_ACCESS_KEY || !process.env.TELESCOPE_S3_SECRET_KEY) {
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

interface TelescopeMedia {
  type: "image" | "video";
  s3Key: string;
  thumbnail?: string;
  isPublished?: boolean;
}

async function main() {
  const telescopeClient = new MongoClient(TELESCOPE_URI);
  await telescopeClient.connect();
  const telescopeDb = telescopeClient.db("test");
  console.log("Connected to Telescope MongoDB.");

  await mongoose.connect(config.MONGODB_URI);
  console.log("Connected to marketplace MongoDB.\n");

  const products = await Product.find({ status: "published" }).lean();
  console.log(`Found ${products.length} published products to fix.\n`);

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

    const telescopeKey: string = deliveryAsset.storageKey;

    // Extract the Telescope profile ID from the storage key.
    const profileId = telescopeKey.match(/profiles\/([a-f0-9]{24})/)?.[1];
    if (!profileId) {
      console.log(`  SKIP ${product.title}: can't parse profile ID from key`);
      continue;
    }

    const profile = await telescopeDb.collection("profiles").findOne(
      { _id: new ObjectId(profileId) },
      { projection: { media: 1 } },
    );
    if (!profile?.media) {
      console.log(`  SKIP ${product.title}: Telescope profile not found`);
      continue;
    }

    const matchingMedia = (profile.media as TelescopeMedia[]).find(
      (m) => m.s3Key === telescopeKey,
    );
    const thumbnailKey = matchingMedia?.thumbnail;

    // 1. Copy the video file to marketplace MinIO (for delivery).
    const safeFileName: string = deliveryAsset.fileName.replace(/[^A-Za-z0-9._-]/g, "_");
    const marketplaceDeliveryKey = `agency/${product.agencyId}/assets/${deliveryAssetId}/${safeFileName}`;

    // Skip if this asset was already migrated (key starts with "agency/").
    if (!telescopeKey.startsWith("profiles/")) {
      console.log(`  – Already migrated: ${product.title}`);
    } else {
      try {
        const bytes = await copyObject(telescopeKey, marketplaceDeliveryKey, deliveryAsset.mimeType);
        await MediaAsset.updateOne({ _id: deliveryAssetId }, { $set: { storageKey: marketplaceDeliveryKey, bytes } });
        videosCopied++;
        console.log(`  ✓ Video copied: ${product.title} (${(bytes / 1_000_000).toFixed(1)} MB)`);
      } catch (err) {
        console.log(`  ✗ Video copy failed for ${product.title}: ${(err as Error).message}`);
        errors++;
        continue;
      }
    }

    // 2. Copy thumbnail and create preview asset (skip if product already has a preview).
    if (product.previewAssetId) {
      console.log(`  – Preview already set: ${product.title}`);
      continue;
    }

    if (thumbnailKey) {
      const previewFileName = thumbnailKey.split("/").pop() || "thumb.jpg";
      const previewAsset = await MediaAsset.create({
        agencyId: product.agencyId,
        storageKey: "pending",
        fileName: previewFileName,
        mimeType: "image/jpeg",
        bytes: 1,
        sha256: crypto.createHash("sha256").update(thumbnailKey).digest("hex"),
        purpose: "preview",
        status: "ready",
      });
      const marketplacePreviewKey = `agency/${product.agencyId}/assets/${previewAsset._id}/${previewFileName}`;
      try {
        const bytes = await copyObject(thumbnailKey, marketplacePreviewKey, "image/jpeg");
        await MediaAsset.updateOne({ _id: previewAsset._id }, { $set: { storageKey: marketplacePreviewKey, bytes } });
        await Product.updateOne({ _id: product._id }, { $set: { previewAssetId: previewAsset._id, previewMode: "blurred" } });
        previewsCreated++;
        console.log(`  ✓ Preview created: ${product.title}`);
      } catch (err) {
        await MediaAsset.deleteOne({ _id: previewAsset._id });
        console.log(`  ✗ Preview copy failed for ${product.title}: ${(err as Error).message}`);
        errors++;
      }
    } else {
      console.log(`  – No thumbnail in Telescope for ${product.title}`);
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log(`Videos copied:    ${videosCopied}`);
  console.log(`Previews created: ${previewsCreated}`);
  console.log(`Errors:           ${errors}`);
  console.log("=".repeat(50));

  await telescopeClient.close();
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Fix script failed:", err);
  process.exit(1);
});
