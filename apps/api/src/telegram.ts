import { Input, Telegraf } from "telegraf";
import { config } from "./config.js";
import { isBrowserCustomer } from "./auth.js";
import { customerBotCopy, customerLocale } from "./customer-locale.js";
import { Delivery, Entitlement, MediaAsset, Order, TelegramUser } from "./models.js";
import { signedDownloadUrl } from "./storage.js";

export const bot = config.TELEGRAM_BOT_TOKEN ? new Telegraf(config.TELEGRAM_BOT_TOKEN) : null;

export async function startBot() {
  if (!bot) return;
  await bot.telegram.setChatMenuButton({
    menuButton: {
      type: "web_app",
      text: "Open Vesper",
      web_app: { url: config.PUBLIC_APP_URL },
    },
  });
  bot.start(async (ctx) => {
    const locale = customerLocale(ctx.from.language_code);
    const user = await TelegramUser.findOneAndUpdate(
      { telegramId: String(ctx.from.id) },
      { $set: { chatId: String(ctx.chat.id), username: ctx.from.username, firstName: ctx.from.first_name, lastName: ctx.from.last_name, locale, lastSeenAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    const copy = customerBotCopy(user.localeOverride ?? user.locale);
    await bot.telegram.setChatMenuButton({
      chatId: ctx.chat.id,
      menuButton: { type: "web_app", text: copy.openCatalog, web_app: { url: config.PUBLIC_APP_URL } },
    });
    await ctx.reply(copy.welcome, {
      reply_markup: { inline_keyboard: [[{ text: copy.openCatalog, web_app: { url: config.PUBLIC_APP_URL } }]] },
    });
  });
  bot.command("purchases", async (ctx) => {
    const user = await TelegramUser.findOne({ telegramId: String(ctx.from.id) });
    const copy = customerBotCopy(user?.localeOverride ?? user?.locale ?? customerLocale(ctx.from.language_code));
    await ctx.reply(`${copy.purchases} ${new URL("/library", config.PUBLIC_APP_URL)}`);
  });
  bot.command("support", async (ctx) => {
    const user = await TelegramUser.findOne({ telegramId: String(ctx.from.id) });
    await ctx.reply(customerBotCopy(user?.localeOverride ?? user?.locale ?? customerLocale(ctx.from.language_code)).support);
  });
  await bot.launch();
}

export async function stopBot() {
  bot?.stop();
}

export async function deliverEntitlements(orderId: string) {
  const order = await Order.findById(orderId);
  if (!order || order.paymentStatus !== "paid") return;
  const user = await TelegramUser.findById(order.telegramUserId);
  if (!user || user.deliveryBlockedAt) return;
  // A browser customer has no Telegram chat. Leave the paid order downloadable
  // in the browser instead of calling the Bot API.
  if (isBrowserCustomer(user)) {
    if (order.fulfillmentStatus !== "delivered") await Order.updateOne({ _id: order._id }, { $set: { fulfillmentStatus: "delivered" } });
    return;
  }
  if (!bot) throw new Error("telegram_bot_not_configured");
  if (!user.chatId) return;
  const copy = customerBotCopy(user.localeOverride ?? user.locale);
  const entitlements = await Entitlement.find({ orderId: order._id, status: "active" });
  let failed = false;
  try {
    await bot.telegram.sendMessage(user.chatId, copy.deliveryStarting, { protect_content: true });
  } catch {
    // A status message must not prevent protected-file delivery.
  }
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
        const orderLine = order.lines.find((line: any) => String(line._id) === entitlement.orderLineId);
        const caption = [orderLine?.productTitle, orderLine?.deliveryMessage].filter(Boolean).join("\n\n").slice(0, 1024);
        const message = await bot.telegram.sendDocument(
          user.chatId,
          currentAsset?.telegramFileId ?? snapshot.telegramFileId ?? Input.fromURLStream(await signedDownloadUrl(snapshot.storageKey), snapshot.fileName),
          { protect_content: true, caption },
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
