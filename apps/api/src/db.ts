import mongoose from "mongoose";
import { config } from "./config.js";

export async function connectDatabase() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(config.MONGODB_URI);
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
