/**
 * Seed the purchasing bot from Telescope's production catalog.
 *
 * Connects to the Telescope MongoDB Atlas, reads all published profiles
 * with at least one video, and creates matching creators + products in the
 * purchasing bot's local MongoDB. Each video becomes a separate product with
 * random EUR pricing in the €5–€50 range.
 *
 * Usage:
 *   npx tsx apps/api/src/seed-telescope.ts
 */
import crypto from "node:crypto";
import { MongoClient } from "mongodb";
import mongoose from "mongoose";
import { config } from "./config.js";
import { Agency, Agent, Category, Creator, MediaAsset, Product } from "./models.js";

const TELESCOPE_URI = process.env.TELESCOPE_MONGODB_URI;
const TELESCOPE_DB = "test";

const HIGHERPAYS_WORKSPACE_ID = "42fee9ae-ffb0-4565-9084-1e1cc994fd1b";
const HIGHERPAYS_ONLY_BUY_AGENT_ID = "eec0a6d3-d33f-4bc7-b7b5-21c65b8ad0a2";
const HIGHERPAYS_MARKETPLACE_ACCOUNT_ID = "046e4641-c7c6-482d-9cf7-6eefefac8247";

function randomPrice(): number {
  const euros = 5 + Math.floor(Math.random() * 46);
  return euros * 100;
}

function slugify(name: string): string {
  return name.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    || `model-${crypto.randomBytes(3).toString("hex")}`;
}

interface TelescopeMedia {
  _id: string;
  type: "image" | "video";
  section?: "post" | "reel";
  s3Key: string;
  thumbnail?: string;
  isPublished?: boolean;
  clicks?: number;
}

interface TelescopeProfile {
  _id: string;
  name: string;
  handle: string;
  profileImage?: string;
  profileImageThumb?: string;
  media: TelescopeMedia[];
  tags?: string[];
}

async function seed() {
  if (!TELESCOPE_URI) throw new Error("TELESCOPE_MONGODB_URI is required");

  // Connect to Telescope (read-only).
  const telescopeClient = new MongoClient(TELESCOPE_URI);
  await telescopeClient.connect();
  const telescopeDb = telescopeClient.db(TELESCOPE_DB);
  console.log("Connected to Telescope MongoDB.");

  const profiles: TelescopeProfile[] = await telescopeDb
    .collection("profiles")
    .find({})
    .project({ name: 1, handle: 1, profileImage: 1, profileImageThumb: 1, media: 1, tags: 1 })
    .toArray() as TelescopeProfile[];
  console.log(`Found ${profiles.length} profiles in Telescope.`);

  // Filter to profiles with at least one video.
  const withVideos = profiles.filter((p) =>
    p.media?.some((m) => m.type === "video" && m.isPublished !== false),
  );
  console.log(`${withVideos.length} profiles have videos.\n`);

  // Connect to the purchasing bot's MongoDB.
  await mongoose.connect(config.MONGODB_URI);
  console.log("Connected to purchasing bot MongoDB.\n");

  // Agency (OnlyElite).
  let agency = await Agency.findOne({ higherPaysWorkspaceId: HIGHERPAYS_WORKSPACE_ID });
  if (!agency) {
    agency = await Agency.create({
      name: "OnlyElite",
      higherPaysWorkspaceId: HIGHERPAYS_WORKSPACE_ID,
      status: "active",
    });
    console.log("Created agency: OnlyElite");
  } else {
    console.log(`Agency exists: ${agency.name}`);
  }

  // Agent (Only Buy).
  let agent = await Agent.findOne({ agencyId: agency._id, higherPaysAgentId: HIGHERPAYS_ONLY_BUY_AGENT_ID });
  if (!agent) {
    agent = await Agent.create({
      agencyId: agency._id,
      name: "Only Buy",
      higherPaysAgentId: HIGHERPAYS_ONLY_BUY_AGENT_ID,
      active: true,
    });
    console.log("Created agent: Only Buy");
  } else {
    console.log(`Agent exists: ${agent.name}`);
  }

  // Set default agent on agency.
  if (!agency.defaultAgentId || String(agency.defaultAgentId) !== String(agent._id)) {
    agency.defaultAgentId = agent._id;
    await agency.save();
    console.log("Set Only Buy as default agent.\n");
  }

  // Category: Videos.
  let videosCategory = await Category.findOne({ agencyId: agency._id, slug: "videos" });
  if (!videosCategory) {
    videosCategory = await Category.create({
      agencyId: agency._id,
      name: "Videos",
      slug: "videos",
      status: "active",
    });
    console.log("Created category: Videos");
  }

  let totalCreators = 0;
  let totalProducts = 0;
  const pricingSummary: { creator: string; products: { title: string; price: string }[] }[] = [];

  for (const profile of withVideos) {
    const slug = slugify(profile.handle);
    const creatorSource = {
      telescopeProfileId: String(profile._id),
      telescopeAvatarKey: profile.profileImage || undefined,
      telescopeAvatarThumbKey: profile.profileImageThumb || undefined,
    };

    // Creator.
    let creator = await Creator.findOne({ slug });
    if (!creator) {
      creator = await Creator.create({
        agencyId: agency._id,
        displayName: profile.name.trim(),
        slug,
        bio: `Content by ${profile.name.trim()}`,
        ...creatorSource,
        higherPaysWorkspaceId: HIGHERPAYS_WORKSPACE_ID,
        higherPaysAccountId: HIGHERPAYS_MARKETPLACE_ACCOUNT_ID,
        status: "published",
        rightsAttestation: {
          affirmedBy: "seed-telescope",
          affirmedAt: new Date(),
          statementVersion: "2026-10",
          creatorIsAdult: true,
          distributionAuthorized: true,
        },
      });
      totalCreators++;
    } else {
      await Creator.updateOne({ _id: creator._id }, { $set: creatorSource });
    }

    const videos = profile.media.filter(
      (m) => m.type === "video" && m.isPublished !== false,
    );

    const creatorPricing: { title: string; price: string }[] = [];

    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      const videoSlug = `${slug}-video-${i + 1}`;
      const existing = await Product.findOne({ creatorId: creator._id, slug: videoSlug });
      if (existing) {
        await Product.updateOne(
          { _id: existing._id },
          {
            $set: {
              telescopeMediaId: String(video._id),
              telescopeMediaKey: video.s3Key,
              telescopeThumbnailKey: video.thumbnail,
              telescopeClicks: video.clicks || 0,
            },
          },
        );
        continue;
      }

      // Create a delivery media asset pointing to the Telescope S3 key.
      // The fix-telescope-previews script copies actual files to marketplace MinIO.
      const deliveryAsset = await MediaAsset.create({
        agencyId: agency._id,
        storageKey: video.s3Key,
        fileName: video.s3Key.split("/").pop() || "video.mp4",
        mimeType: video.s3Key.endsWith(".mov") ? "video/quicktime" : "video/mp4",
        bytes: 1_000_000,
        sha256: crypto.createHash("sha256").update(video.s3Key).digest("hex"),
        purpose: "delivery",
        status: "ready",
      });

      // Create a preview asset from the video thumbnail if available.
      let previewAssetId: unknown = undefined;
      let previewMode: "none" | "blurred" = "none";
      if (video.thumbnail) {
        const thumbFileName = video.thumbnail.split("/").pop() || "thumb.jpg";
        const previewAsset = await MediaAsset.create({
          agencyId: agency._id,
          storageKey: video.thumbnail,
          fileName: thumbFileName,
          mimeType: "image/jpeg",
          bytes: 1,
          sha256: crypto.createHash("sha256").update(video.thumbnail).digest("hex"),
          purpose: "preview",
          status: "ready",
        });
        previewAssetId = previewAsset._id;
        previewMode = "blurred";
      }

      const amountMinor = randomPrice();
      await Product.create({
        agencyId: agency._id,
        creatorId: creator._id,
        title: `${profile.name.trim()} — Video ${i + 1}`,
        slug: videoSlug,
        description: `Exclusive video content from ${profile.name.trim()}.`,
        categoryIds: videosCategory ? [videosCategory._id] : [],
        previewMode,
        previewAssetId,
        mediaAssetIds: [deliveryAsset._id],
        telescopeMediaId: String(video._id),
        telescopeMediaKey: video.s3Key,
        telescopeThumbnailKey: video.thumbnail,
        telescopeClicks: video.clicks || 0,
        amountMinor,
        currency: "EUR",
        status: "published",
      });
      totalProducts++;
      creatorPricing.push({
        title: `Video ${i + 1}`,
        price: `€${(amountMinor / 100).toFixed(2)}`,
      });
    }

    if (creatorPricing.length) {
      pricingSummary.push({ creator: profile.name.trim(), products: creatorPricing });
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`IMPORT SUMMARY`);
  console.log("=".repeat(60));
  console.log(`Creators imported: ${totalCreators}`);
  console.log(`Products created:  ${totalProducts}`);
  console.log("");
  console.log("PRICING:");
  for (const entry of pricingSummary) {
    console.log(`\n  ${entry.creator}:`);
    for (const p of entry.products) {
      console.log(`    ${p.title}: ${p.price}`);
    }
  }
  console.log("\n" + "=".repeat(60));

  await telescopeClient.close();
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
