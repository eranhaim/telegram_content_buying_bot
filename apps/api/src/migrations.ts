import mongoose from "mongoose";

const migrationId = "001_content_catalog_v2";

export async function runMigrations() {
  const database = mongoose.connection.db;
  if (!database) throw new Error("database_not_connected");
  const migrations = database.collection<{ _id: string; appliedAt: Date }>("schema_migrations");
  if (await migrations.findOne({ _id: migrationId })) return;

  await database.collection("products").updateMany(
    { categoryIds: { $exists: false } },
    { $set: { categoryIds: [] } },
  );
  await database.collection("products").updateMany(
    { previewMode: { $exists: false } },
    [{ $set: { previewMode: { $cond: [{ $ifNull: ["$previewAssetId", false] }, "blurred", "none"] } } }],
  );
  await migrations.insertOne({ _id: migrationId, appliedAt: new Date() });
}
