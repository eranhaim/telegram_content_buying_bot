import { app } from "./app.js";
import { config } from "./config.js";
import { connectDatabase, disconnectDatabase } from "./db.js";
import { startBot, stopBot } from "./telegram.js";
import { startMaintenance } from "./maintenance.js";

async function main() {
  await connectDatabase();
  startMaintenance();
  const server = app.listen(config.PORT, () => console.log(`Marketplace API listening on ${config.PORT}`));
  void startBot().catch((error) => console.error("Telegram bot startup failed", error));
  const shutdown = async () => {
    server.close();
    await stopBot();
    await disconnectDatabase();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
