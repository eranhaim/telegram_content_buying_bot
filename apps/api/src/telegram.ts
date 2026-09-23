import { Input, Telegraf } from "telegraf";
import { config } from "./config.js";
import { Delivery, Entitlement, MediaAsset, Order, TelegramUser } from "./models.js";
import { signedDownloadUrl } from "./storage.js";

export const bot = config.TELEGRAM_BOT_TOKEN ? new Telegraf(config.TELEGRAM_BOT_TOKEN) : null;

export async function startBot() {
  if (!bot) return;
  await bot.telegram.setChatMenuButton({
    menuButton: {
      type: "web_app",
      text: "Open catalog",
      web_app: { url: config.PUBLIC_APP_URL },
    },
  });
  bot.start(async (ctx) => {
    await TelegramUser.findOneAndUpdate(
      { telegramId: String(ctx.from.id) },
      { $set: { chatId: String(ctx.chat.id), username: ctx.from.username, firstName: ctx.from.first_name, lastName: ctx.from.last_name, lastSeenAt: new Date() } },
      { upsert: true, setDefaultsOnInsert: true },
    );
    await ctx.reply("Welcome. Open the catalog to browse available content.", {
      reply_markup: { inline_keyboard: [[{ text: "Open catalog", web_app: { url: config.PUBLIC_APP_URL } }]] },
    });
  });
  bot.command("purchases", async (ctx) => {
    await ctx.reply(`Open your purchased content: ${new URL("/library", config.PUBLIC_APP_URL)}`);
  });
  bot.command("support", (ctx) => ctx.reply("For payment or delivery support, contact the marketplace administrator."));
  await bot.launch();
}

export async function stopBot() {
  bot?.stop();
}

export async function deliverEntitlements(orderId: string) {
  if (!bot) throw new Error("telegram_bot_not_configured");
  const order = await Order.findById(orderId);
  if (!order || order.paymentStatus !== "paid") return;
  const user = await TelegramUser.findById(order.telegramUserId);
  if (!user?.chatId || user.deliveryBlockedAt) return;
  const entitlements = await Entitlement.find({ orderId: order._id, status: "active" });
  let failed = false;
  for (const entitlement of entitlements) {
    for (const snapshot of entitlement.assets) {
      const assetId = String(snapshot.assetId);
      const existing = await Delivery.findOne({ entitlementId: entitlement._id, assetId });
      if (existing?.status === "sent") continue;
      const delivery = await Delivery.findOneAndUpdate(
        { entitlementId: entitlement._id, assetId },
        { $setOnInsert: { entitlementId: entitlement._id, assetId }, $set: { status: "sending" }, $inc: { attempts: 1 } },
        { upsert: true, new: true },
      );
      try {
        const currentAsset = await MediaAsset.findById(assetId);
        const message = await bot.telegram.sendDocument(
          user.chatId,
          currentAsset?.telegramFileId ?? snapshot.telegramFileId ?? Input.fromURLStream(await signedDownloadUrl(snapshot.storageKey), snapshot.fileName),
          { protect_content: true, caption: order.lines.find((line: any) => String(line._id) === entitlement.orderLineId)?.productTitle },
        );
        const fileId = message.document?.file_id;
        if (fileId && currentAsset && !currentAsset.telegramFileId) await MediaAsset.updateOne({ _id: currentAsset._id }, { $set: { telegramFileId: fileId } });
        await Delivery.updateOne({ _id: delivery._id }, { $set: { status: "sent", sentAt: new Date(), telegramMessageId: message.message_id, error: null } });
      } catch (error) {
        failed = true;
        await Delivery.updateOne({ _id: delivery._id }, { $set: { status: "retry", error: error instanceof Error ? error.message.slice(0, 500) : "delivery_failed" } });
      }
    }
  }
  const queued = await Delivery.exists({ entitlementId: { $in: entitlements.map((entry) => entry._id) }, status: { $in: ["queued", "sending", "retry"] } });
  await Order.updateOne({ _id: order._id }, { $set: { fulfillmentStatus: queued ? (failed ? "partial" : "queued") : "delivered" } });
}
