import mongoose from "mongoose";
import { config } from "./config.js";
import { runMigrations } from "./migrations.js";

export async function connectDatabase() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(config.MONGODB_URI);
  await runMigrations();
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
