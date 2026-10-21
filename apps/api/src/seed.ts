/**
 * Seed the OnlyElite Vault demo catalog.
 *
 * Creates mock creators, categories, products, and placeholder media in
 * MongoDB + MinIO.  Idempotent: skips entities that already exist by slug.
 *
 * After running, map each creator to a real HigherPays account via the
 * protected admin UI (/admin → creator edit).
 *
 * Usage:
 *   npx tsx apps/api/src/seed.ts
 *   # or via npm:
 *   npm run seed -w @marketplace/api
 */
import mongoose from "mongoose";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "./config.js";
import { Agency, Agent, Category, Creator, MediaAsset, Product } from "./models.js";

// ── Placeholder media ──────────────────────────────────────────────────────

// Minimal 1×1 transparent PNG (68 bytes).
const PREVIEW_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const DELIVERY_TXT = Buffer.from(
  "OnlyElite Vault — demo delivery asset.\nReplace with real content before production.\n",
);

// ── S3 client ──────────────────────────────────────────────────────────────

function makeS3() {
  if (!config.S3_ENDPOINT || !config.S3_ACCESS_KEY_ID || !config.S3_SECRET_ACCESS_KEY) {
    return null;
  }
  return new S3Client({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    },
  });
}

async function uploadIfMissing(s3: S3Client, key: string, body: Buffer, contentType: string) {
  try {
    await s3.send(new PutObjectCommand({
      Bucket: config.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }));
  } catch (err: any) {
    console.warn(`  ⚠ upload ${key}: ${err.message}`);
  }
}

// ── Seed data ──────────────────────────────────────────────────────────────

const WORKSPACE_ID = process.env.HIGHERPAYS_WORKSPACE_ID ?? "onlyelite-demo";

const CREATORS = [
  { displayName: "Luna Bright", slug: "luna-bright", bio: "Exclusive photo sets and behind-the-scenes content." },
  { displayName: "Alex Storm", slug: "alex-storm", bio: "Premium video content and tutorials." },
  { displayName: "Mia Rose", slug: "mia-rose", bio: "Curated lifestyle and fitness content." },
];

const CATEGORIES = [
  { name: "Photos", slug: "photos" },
  { name: "Videos", slug: "videos" },
  { name: "Bundles", slug: "bundles" },
];

// Products per creator, referencing category slugs.
const PRODUCTS: Record<string, { title: string; slug: string; description: string; amountMinor: number; category: string }[]> = {
  "luna-bright": [
    { title: "Summer Photo Set", slug: "summer-photo-set", description: "12 high-res exclusive summer photos.", amountMinor: 1500, category: "photos" },
    { title: "Studio Portraits", slug: "studio-portraits", description: "Professional studio portrait collection.", amountMinor: 2500, category: "photos" },
  ],
  "alex-storm": [
    { title: "Workout Masterclass", slug: "workout-masterclass", description: "Full 45-minute workout video with commentary.", amountMinor: 3500, category: "videos" },
    { title: "Behind the Scenes", slug: "bts-alex", description: "Raw behind-the-scenes footage.", amountMinor: 1000, category: "videos" },
  ],
  "mia-rose": [
    { title: "Wellness Bundle", slug: "wellness-bundle", description: "Photos + video from the wellness retreat.", amountMinor: 4000, category: "bundles" },
    { title: "Morning Routine", slug: "morning-routine", description: "Full morning routine video.", amountMinor: 2000, category: "videos" },
    { title: "Beach Collection", slug: "beach-collection", description: "Exclusive beach day photo series.", amountMinor: 1800, category: "photos" },
  ],
};

// ── Main ───────────────────────────────────────────────────────────────────

async function seed() {
  await mongoose.connect(config.MONGODB_URI);
  console.log("Connected to MongoDB.");

  const s3 = makeS3();
  if (!s3) console.warn("S3 not configured — skipping media uploads. Products will not be publishable.");

  // Agency.
  let agency = await Agency.findOne({ higherPaysWorkspaceId: WORKSPACE_ID });
  if (!agency) {
    agency = await Agency.create({ name: "OnlyElite", higherPaysWorkspaceId: WORKSPACE_ID, status: "active" });
    console.log(`Created agency: ${agency.name}`);
  } else {
    console.log(`Agency exists: ${agency.name}`);
  }

  // Default agent (required for checkout).
  let agent = await Agent.findOne({ agencyId: agency._id });
  if (!agent) {
    agent = await Agent.create({ agencyId: agency._id, name: "Vault Bot", higherPaysAgentId: "vault-bot", active: true });
    console.log(`Created agent: ${agent.name}`);
  } else {
    console.log(`Agent exists: ${agent.name}`);
  }
  if (!agency.defaultAgentId || String(agency.defaultAgentId) !== String(agent._id)) {
    agency.defaultAgentId = agent._id;
    await agency.save();
    console.log("Set default agent on agency.");
  }

  // Categories.
  const categoryMap = new Map<string, any>();
  for (const cat of CATEGORIES) {
    let doc = await Category.findOne({ agencyId: agency._id, slug: cat.slug });
    if (!doc) {
      doc = await Category.create({ agencyId: agency._id, ...cat, status: "active" });
      console.log(`Created category: ${doc.name}`);
    }
    categoryMap.set(cat.slug, doc);
  }

  // Creators.
  const creatorMap = new Map<string, any>();
  for (const cr of CREATORS) {
    let doc = await Creator.findOne({ slug: cr.slug });
    if (!doc) {
      doc = await Creator.create({
        agencyId: agency._id,
        ...cr,
        higherPaysWorkspaceId: WORKSPACE_ID,
        status: "published",
        rightsAttestation: {
          affirmedBy: "seed-script",
          affirmedAt: new Date(),
          statementVersion: "2026-10",
          creatorIsAdult: true,
          distributionAuthorized: true,
        },
      });
      console.log(`Created creator: ${doc.displayName}`);
    } else {
      console.log(`Creator exists: ${doc.displayName}`);
    }
    creatorMap.set(cr.slug, doc);
  }

  // Products + media for each creator.
  for (const [creatorSlug, products] of Object.entries(PRODUCTS)) {
    const creator = creatorMap.get(creatorSlug);
    if (!creator) continue;

    for (const prod of products) {
      const existing = await Product.findOne({ creatorId: creator._id, slug: prod.slug });
      if (existing) {
        console.log(`Product exists: ${prod.title}`);
        continue;
      }

      const category = categoryMap.get(prod.category);

      // Create preview asset.
      const previewKey = `agency/${agency._id}/assets/seed-preview-${prod.slug}/preview.png`;
      const previewAsset = await MediaAsset.create({
        agencyId: agency._id,
        storageKey: previewKey,
        fileName: "preview.png",
        mimeType: "image/png",
        bytes: PREVIEW_PNG.length,
        sha256: "seed",
        purpose: "preview",
        status: s3 ? "ready" : "pending",
      });
      if (s3) await uploadIfMissing(s3, previewKey, PREVIEW_PNG, "image/png");

      // Create delivery asset.
      const deliveryKey = `agency/${agency._id}/assets/seed-delivery-${prod.slug}/content.txt`;
      const deliveryAsset = await MediaAsset.create({
        agencyId: agency._id,
        storageKey: deliveryKey,
        fileName: "content.txt",
        mimeType: "text/plain",
        bytes: DELIVERY_TXT.length,
        sha256: "seed",
        purpose: "delivery",
        status: s3 ? "ready" : "pending",
      });
      if (s3) await uploadIfMissing(s3, deliveryKey, DELIVERY_TXT, "text/plain");

      await Product.create({
        agencyId: agency._id,
        creatorId: creator._id,
        title: prod.title,
        slug: prod.slug,
        description: prod.description,
        categoryIds: category ? [category._id] : [],
        previewAssetId: previewAsset._id,
        previewMode: "blurred",
        mediaAssetIds: [deliveryAsset._id],
        amountMinor: prod.amountMinor,
        currency: "EUR",
        status: s3 ? "published" : "draft",
      });
      console.log(`Created product: ${prod.title} (€${(prod.amountMinor / 100).toFixed(2)})`);
    }
  }

  console.log("\n✓ Seed complete.");
  console.log("Next steps:");
  console.log("  1. Start the app and open /admin");
  console.log("  2. For each creator, map to a real HigherPays account via the creator picker");
  console.log("  3. Verify the catalog appears in the Telegram Mini App");

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
