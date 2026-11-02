import mongoose from "mongoose";

const contentCatalogMigration = "001_content_catalog_v2";
const singleOperatorMigration = "002_single_operator_catalog";

async function dropIndexIfPresent(collection: { dropIndex(name: string): Promise<unknown> }, name: string) {
  try { await collection.dropIndex(name); }
  catch (error: unknown) {
    if (!(typeof error === "object" && error !== null && "codeName" in error && error.codeName === "IndexNotFound")) throw error;
  }
}

export async function runMigrations() {
  const database = mongoose.connection.db;
  if (!database) throw new Error("database_not_connected");
  const migrations = database.collection<{ _id: string; appliedAt: Date }>("schema_migrations");

  if (!await migrations.findOne({ _id: contentCatalogMigration })) {
    await database.collection("products").updateMany(
      { categoryIds: { $exists: false } },
      { $set: { categoryIds: [] } },
    );
    await database.collection("products").updateMany(
      { previewMode: { $exists: false } },
      [{ $set: { previewMode: { $cond: [{ $ifNull: ["$previewAssetId", false] }, "blurred", "none"] } } }],
    );
    await migrations.insertOne({ _id: contentCatalogMigration, appliedAt: new Date() });
  }

  if (await migrations.findOne({ _id: singleOperatorMigration })) return;

  const duplicateCategorySlugs = await database.collection("categories").aggregate([
    { $group: { _id: "$slug", count: { $sum: 1 } } },
    { $match: { _id: { $type: "string" }, count: { $gt: 1 } } },
    { $limit: 1 },
  ]).toArray();
  if (duplicateCategorySlugs.length) throw new Error("single_operator_category_slug_conflict");

  const legacyCreatorFields = {
    agencyId: "", higherPaysWorkspaceId: "", higherPaysAgentId: "", higherPaysAgentName: "",
    higherPaysAccountId: "", higherPaysAccountName: "",
  };
  const legacyOrderFields = {
    agencyId: "", agentId: "", higherPaysWorkspaceId: "", higherPaysAgentId: "", higherPaysAccountId: "",
    higherPaysPaymentLinkReference: "", higherPaysCheckoutUrl: "", higherPaysPaymentId: "",
  };

  await database.collection("orders").updateMany(
    { checkoutUrl: { $exists: false }, higherPaysCheckoutUrl: { $type: "string" } },
    [{ $set: { checkoutUrl: "$higherPaysCheckoutUrl" } }],
  );
  await Promise.all([
    database.collection("creators").updateMany({}, { $unset: legacyCreatorFields }),
    database.collection("categories").updateMany({}, { $unset: { agencyId: "" } }),
    database.collection("mediaassets").updateMany({}, { $unset: { agencyId: "" } }),
    database.collection("products").updateMany({}, { $unset: { agencyId: "" } }),
    database.collection("orders").updateMany({}, { $unset: { ...legacyOrderFields, "lines.$[].higherPaysAccountId": "" } }),
  ]);

  const categories = database.collection("categories");
  const products = database.collection("products");
  await dropIndexIfPresent(categories, "agencyId_1_slug_1");
  await dropIndexIfPresent(products, "agencyId_1_status_1_createdAt_-1");
  await categories.createIndex({ slug: 1 }, { unique: true });
  await products.createIndex({ status: 1, createdAt: -1 });

  await database.collection("agencies").drop().catch((error: unknown) => {
    if (!(typeof error === "object" && error !== null && "codeName" in error && error.codeName === "NamespaceNotFound")) throw error;
  });
  await database.collection("agents").drop().catch((error: unknown) => {
    if (!(typeof error === "object" && error !== null && "codeName" in error && error.codeName === "NamespaceNotFound")) throw error;
  });
  await migrations.insertOne({ _id: singleOperatorMigration, appliedAt: new Date() });
}
