import cors from "cors";
import express, { type Request, type Response } from "express";
import { z } from "zod";
import { config } from "./config.js";
import { BROWSER_CUSTOMER_LABEL, isBrowserCustomer, issueAdminSession, issueBrowserSession, issueTelegramSession, requireActor, saveCustomerLocale, verifyAdminPassword } from "./auth.js";
import { customerLocales } from "./customer-locale.js";
import { customerCountry } from "./customer-region.js";
import { AuditEvent, Cart, Category, Creator, Delivery, Entitlement, MediaAsset, Order, Product, TelegramUser, WebhookEvent } from "./models.js";
import { applyMantapayPayment, createOrderForCart } from "./orders.js";
import { createCheckoutForOrder, getStatusByOrder, parseWebhook, verifyWebhookSignature } from "./mantapay.js";
import { objectKey, signedDownloadUrl, signedUploadUrl, storedObject } from "./storage.js";
import { deliverEntitlements } from "./telegram.js";
import { rateLimit } from "./rate-limit.js";
import { previewIsConfigured } from "./commerce.js";
import { signedTelescopeUrl } from "./telescope-storage.js";
import { signedTelescopeAvatarUrl } from "./telescope-catalog.js";

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/);
const objectIds = z.array(objectId).refine((ids) => new Set(ids).size === ids.length, "duplicate_ids");
const nonEmptyObjectIds = z.array(objectId).min(1).refine((ids) => new Set(ids).size === ids.length, "duplicate_ids");
const euroMinor = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(cors({ origin: config.APP_ORIGIN, credentials: false }));
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  next();
});

const asyncRoute = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response) => void fn(req, res).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "server_error";
    const status = error instanceof z.ZodError ? 400
      : ["invalid_browser_session", "invalid_date_range"].includes(message) ? 400
      : ["telegram_auth_unavailable", "invalid_telegram_init_data", "expired_telegram_init_data", "missing_telegram_user"].includes(message) ? 401
      : ["cart_empty", "unavailable_product", "mixed_currency_cart", "age_confirmation_required", "telegram_delivery_required"].includes(message) ? 409
        : ["mantapay_not_configured", "object_storage_not_configured"].includes(message) ? 503 : 500;
    res.status(status).json({ error: message });
  });
const actorUser = (req: Request) => req.actor?.kind === "telegram" || req.actor?.kind === "browser" ? req.actor.userId : null;
const previewMimeType = z.enum(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "video/quicktime"]);
const deliveryMimeType = z.string().regex(/^(image|video|audio|application)\//);
const maxAssetBytes = 50_000_000;
function productSlugBase(title: string) {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "content";
}
async function nextProductSlug(title: string, creatorId: string) {
  const base = productSlugBase(title);
  let slug = base;
  let suffix = 2;
  while (await Product.exists({ creatorId, slug })) slug = `${base}-${suffix++}`;
  return slug;
}
const catalogProduct = async (product: any, previews: Map<string, any>, categories: Map<string, any>) => {
  const preview = product.previewMode !== "none" && product.previewAssetId ? previews.get(String(product.previewAssetId)) : undefined;
  return {
    _id: String(product._id), title: product.title, description: product.description, amountMinor: product.amountMinor,
    currency: product.currency, creatorId: String(product.creatorId), previewMode: product.previewMode,
    categories: (product.categoryIds ?? []).map((categoryId: unknown) => categories.get(String(categoryId))?.name).filter(Boolean),
    preview: preview ? { mimeType: preview.mimeType, url: await signedDownloadUrl(preview.storageKey) } : null,
  };
};
const catalogCreator = async (creator: any) => ({
  _id: String(creator._id),
  displayName: creator.displayName,
  slug: creator.slug,
  bio: creator.bio,
  avatarUrl:
    await signedTelescopeAvatarUrl(creator)
    ?? await signedTelescopeUrl(creator.telescopeAvatarThumbKey ?? creator.telescopeAvatarKey),
});
const audit = (req: Request, action: string, entityType: string, entityId?: string, metadata?: unknown) =>
  AuditEvent.create({ actorType: req.actor?.kind ?? "system", actorId: req.actor?.kind === "admin" ? "shared-password" : req.actor?.kind === "telegram" ? req.actor.telegramId : undefined, action, entityType, entityId, metadata, ip: req.ip });

const health = asyncRoute(async (_req, res) => { res.json({ ok: true }); });
const logReference = (value: unknown) => typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value) ? value : "invalid";
app.get("/health", health);
app.get("/api/health", health);

// --- MantaPay webhook (form-encoded POST) ---
app.post(["/api/webhooks/mantapay", "/api/webhooks/mantapay/:legacy"], express.urlencoded({ extended: false, limit: "64kb" }), asyncRoute(async (req, res) => {
  const rawPairs = Object.entries(req.body as Record<string, string>)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
  const hashKey = config.MANTAPAY_HASH_KEY;
  const signatureValid = hashKey ? verifyWebhookSignature(rawPairs, hashKey) : false;
  if (!signatureValid) { console.warn("MantaPay callback rejected", { reason: "invalid_signature", signaturePresent: Boolean(req.body?.signature ?? req.body?.Signature) }); return res.status(401).json({ error: "invalid_signature" }); }
  const payment = parseWebhook(rawPairs);
  console.info("MantaPay callback received", { reference: logReference(payment.referenceId), status: payment.status, transactionPresent: Boolean(payment.transactionId) });
  if (payment.status === "approved") {
    if (!payment.referenceId || !payment.transactionId) return res.status(400).json({ error: "invalid_payment" });
    const order = await Order.findOne({ publicId: payment.referenceId });
    if (!order) return res.status(404).json({ error: "unknown_order" });
    let status: Awaited<ReturnType<typeof getStatusByOrder>>;
    try { status = await getStatusByOrder(payment.referenceId); }
    catch { console.error("MantaPay callback verification failed", { reference: logReference(payment.referenceId), reason: "status_request_failed" }); throw new Error("payment_status_unavailable"); }
    const verified = status.ok && status.transactions.some((transaction) => transaction.status === "approved" && transaction.transId === payment.transactionId && transaction.currency === order.currency && transaction.amount != null && Math.round(transaction.amount * 100) === order.totalMinor);
    if (!verified || payment.currency !== order.currency || payment.grossAmount == null || Math.round(payment.grossAmount * 100) !== order.totalMinor) { console.warn("MantaPay callback verification failed", { reference: logReference(payment.referenceId), reason: "status_or_amount_mismatch" }); return res.status(409).json({ error: "payment_verification_failed" }); }
  }
  const eventId = payment.transactionId ?? `${payment.referenceId}-${Date.now()}`;
  try {
    await WebhookEvent.create({ provider: "mantapay", providerEventId: eventId, type: `payment.${payment.status}`, signatureValid, payload: payment.fields });
  } catch (error: unknown) {
    if ((error as { code?: number }).code === 11000) return res.json({ ok: true, duplicate: true });
    throw error;
  }
  try {
    await applyMantapayPayment(payment);
    await WebhookEvent.updateOne({ providerEventId: eventId }, { $set: { processedAt: new Date() } });
    res.json({ ok: true });
  } catch (error) {
    await WebhookEvent.updateOne({ providerEventId: eventId }, { $set: { processingError: error instanceof Error ? error.message.slice(0, 500) : "processing_failed" } });
    throw error;
  }
}));

app.use(express.json({ limit: "1mb" }));

app.post("/api/auth/telegram", rateLimit(60_000, 30), asyncRoute(async (req, res) => {
  const body = z.object({ initData: z.string().min(1) }).parse(req.body);
  res.json(await issueTelegramSession(body.initData, customerCountry(req), req.acceptsLanguages()[0]));
}));
app.post("/api/auth/browser", rateLimit(60_000, 30), asyncRoute(async (req, res) => {
  const body = z.object({ browserId: z.string().min(1) }).strict().parse(req.body);
  res.json(await issueBrowserSession(body.browserId, customerCountry(req), req.acceptsLanguages()[0]));
}));
app.post("/api/auth/admin", rateLimit(15 * 60_000, 10), asyncRoute(async (req, res) => {
  const body = z.object({ password: z.string().min(1) }).strict().parse(req.body);
  if (!verifyAdminPassword(body.password)) return res.status(401).json({ error: "invalid_credentials" });
  res.json({ token: issueAdminSession() });
}));

app.get("/api/catalog/creators", requireActor("customer"), asyncRoute(async (_req, res) => {
  const creators = await Creator.find({ status: "published" }).sort({ displayName: 1 }).lean();
  res.json({ items: await Promise.all(creators.map(catalogCreator)) });
}));
app.get("/api/catalog/creators/:slug/products", requireActor("customer"), asyncRoute(async (req, res) => {
  const creator = await Creator.findOne({ slug: req.params.slug, status: "published" });
  if (!creator) return res.status(404).json({ error: "creator_not_found" });
  const products = await Product.find({ creatorId: creator._id, status: "published" }).select("-mediaAssetIds").sort({ createdAt: -1 });
  const previewIds = products.flatMap((p: any) => p.previewAssetId ? [p.previewAssetId] : []);
  const categoryIds = products.flatMap((p: any) => p.categoryIds ?? []);
  const [previewAssets, categoryRecords] = await Promise.all([
    MediaAsset.find({ _id: { $in: previewIds }, purpose: "preview", status: "ready" }),
    Category.find({ _id: { $in: categoryIds }, status: "active" }),
  ]);
  const previews = new Map(previewAssets.map((a: any) => [String(a._id), a]));
  const cats = new Map(categoryRecords.map((c: any) => [String(c._id), c]));
  const items = await Promise.all(products.map((p) => catalogProduct(p, previews, cats)));
  const featuredProduct = [...products]
    .filter((product) => product.telescopeMediaKey)
    .sort((a, b) => (b.telescopeClicks ?? 0) - (a.telescopeClicks ?? 0))[0];
  const featuredVideo = featuredProduct
    ? {
      url: await signedTelescopeUrl(featuredProduct.telescopeMediaKey),
      posterUrl: await signedTelescopeUrl(featuredProduct.telescopeThumbnailKey),
    }
    : undefined;
  res.json({ creator: await catalogCreator(creator), items, featuredVideo });
}));
app.get("/api/catalog/products/:id", requireActor("customer"), asyncRoute(async (req, res) => {
  if (!objectId.safeParse(req.params.id).success) return res.status(404).json({ error: "product_not_found" });
  const product = await Product.findOne({ _id: req.params.id, status: "published" }).select("-mediaAssetIds");
  if (!product) return res.status(404).json({ error: "product_not_found" });
  const preview = product.previewAssetId ? await MediaAsset.findOne({ _id: product.previewAssetId, purpose: "preview", status: "ready" }) : null;
  const cats = await Category.find({ _id: { $in: product.categoryIds ?? [] }, status: "active" });
  res.json(await catalogProduct(product, new Map(preview ? [[String(preview._id), preview]] : []), new Map(cats.map((c: any) => [String(c._id), c]))));
}));

app.put("/api/me/locale", requireActor("customer"), asyncRoute(async (req, res) => {
  const body = z.object({ locale: z.enum(customerLocales) }).strict().parse(req.body);
  res.json({ locale: await saveCustomerLocale(actorUser(req)!, body.locale) });
}));
app.post("/api/me/age-confirmation", requireActor("customer"), asyncRoute(async (req, res) => {
  const user = await TelegramUser.findByIdAndUpdate(actorUser(req), { $set: { ageConfirmedAt: new Date(), ageConfirmationVersion: "2026-10" } }, { new: true });
  if (!user) return res.status(404).json({ error: "user_not_found" });
  res.json({ confirmed: true, ageConfirmedAt: user.ageConfirmedAt });
}));
app.get("/api/cart", requireActor("customer"), asyncRoute(async (req, res) => {
  const cart = await Cart.findOne({ telegramUserId: actorUser(req)!, status: "active" });
  res.json(cart ?? { items: [], currency: config.MARKETPLACE_CURRENCY });
}));
app.post("/api/cart/items", requireActor("customer"), asyncRoute(async (req, res) => {
  const body = z.object({ productId: objectId }).parse(req.body);
  const product = await Product.findOne({ _id: body.productId, status: "published" });
  if (!product) return res.status(404).json({ error: "product_not_found" });
  const creator = await Creator.findById(product.creatorId);
  const userId = actorUser(req)!;
  const existing = await Cart.findOne({ telegramUserId: userId, currency: product.currency, status: "active" });
  const cart = await Cart.findOneAndUpdate(
    { telegramUserId: userId, currency: product.currency, status: "active" },
    { $setOnInsert: { telegramUserId: userId, currency: product.currency }, $addToSet: { items: { productId: product._id, titleSnapshot: product.title, creatorNameSnapshot: creator?.displayName ?? "Creator", priceMinorSnapshot: product.amountMinor, contentVersionSnapshot: product.contentVersion } } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  res.status(201).json(cart);
}));
app.delete("/api/cart/items/:productId", requireActor("customer"), asyncRoute(async (req, res) => {
  await Cart.updateOne({ telegramUserId: actorUser(req), status: "active" }, { $pull: { items: { productId: req.params.productId } } });
  res.status(204).end();
}));

app.post("/api/checkout", requireActor("customer"), rateLimit(60_000, 5), asyncRoute(async (req, res) => {
  if (req.actor?.kind !== "telegram") return res.status(403).json({ error: "telegram_checkout_required" });
  const order = await createOrderForCart(actorUser(req)!);
  console.info("MantaPay checkout created", { reference: order.publicId, amountMinor: order.totalMinor, currency: order.currency, callbackHost: new URL(config.PUBLIC_APP_URL).host });
  res.status(201).json({
    orderId: order.publicId, totalMinor: order.totalMinor, currency: order.currency,
    checkoutUrl: new URL(`/api/checkout/${order.publicId}?state=${order.returnNonce}`, config.PUBLIC_APP_URL).toString(),
  });
}));
app.get("/api/checkout/:publicId", rateLimit(60_000, 10), asyncRoute(async (req, res) => {
  const order = await Order.findOne({ publicId: req.params.publicId, returnNonce: req.query.state, paymentStatus: "pending" });
  let url = order?.checkoutUrl;
  if (!order || order.expiresAt < new Date() || !url) return res.status(410).send("This checkout session has expired.");
  const params = new URL(url).searchParams;
  const notification = params.get("notification_url");
  const returnUrl = params.get("url_redirect");
  if (notification !== config.apiUrl("/api/webhooks/mantapay") || !returnUrl || new URL(returnUrl).origin !== new URL(config.PUBLIC_APP_URL).origin) {
    url = createCheckoutForOrder(order).checkoutUrl;
    order.checkoutUrl = url;
    await order.save();
  }
  console.info("MantaPay checkout redirect", { reference: order.publicId, providerHost: new URL(url).host });
  res.redirect(302, url);
}));
app.get("/api/orders/:publicId", requireActor("customer"), asyncRoute(async (req, res) => {
  const order = await Order.findOne({ publicId: req.params.publicId, telegramUserId: actorUser(req) }).select("-returnNonce");
  if (!order) return res.status(404).json({ error: "order_not_found" });
  res.json(order);
}));
app.get("/api/payment-return/:publicId", asyncRoute(async (req, res) => {
  const order = await Order.findOne({ publicId: req.params.publicId, returnNonce: req.query.state }).select("paymentStatus fulfillmentStatus");
  if (!order) return res.status(404).json({ error: "order_not_found" });
  res.json(order);
}));
app.get("/api/purchases", requireActor("customer"), asyncRoute(async (req, res) => {
  const orders = await Order.find({ telegramUserId: actorUser(req), paymentStatus: "paid" }).select("publicId lines paymentStatus fulfillmentStatus paidAt currency totalMinor").sort({ paidAt: -1 }).lean();
  res.json({ items: orders });
}));
app.post("/api/purchases/:publicId/retry-delivery", requireActor("customer"), asyncRoute(async (req, res) => {
  const order = await Order.findOne({ publicId: req.params.publicId, telegramUserId: actorUser(req), paymentStatus: "paid" });
  if (!order) return res.status(404).json({ error: "order_not_found" });
  await Delivery.updateMany({ entitlementId: { $in: (await Entitlement.find({ orderId: order._id }).distinct("_id")) }, status: { $in: ["failed", "retry"] } }, { $set: { status: "queued", error: null } });
  void deliverEntitlements(String(order._id));
  res.status(202).json({ ok: true });
}));

// --- Admin API ---
const admin = express.Router();
admin.use(requireActor("admin"));

admin.get("/creators", asyncRoute(async (_req, res) => res.json({ items: await Creator.find().sort({ displayName: 1 }) })));
admin.post("/creators", asyncRoute(async (req, res) => {
  const body = z.object({ displayName: z.string().min(1).max(120), slug: z.string().regex(/^[a-z0-9-]+$/), bio: z.string().max(4000).default(""), rightsAttestation: z.object({ affirmedBy: z.string().min(1) }) }).parse(req.body);
  const creator = await Creator.create({ displayName: body.displayName, slug: body.slug, bio: body.bio, rightsAttestation: { affirmedBy: body.rightsAttestation.affirmedBy, statementVersion: "2026-10", creatorIsAdult: true, distributionAuthorized: true, affirmedAt: new Date() } });
  await audit(req, "creator.create", "creator", String(creator._id)); res.status(201).json(creator);
}));
admin.patch("/creators/:id", asyncRoute(async (req, res) => {
  const body = z.object({ displayName: z.string().min(1).max(120).optional(), slug: z.string().regex(/^[a-z0-9-]+$/).optional(), bio: z.string().max(4000).optional(), status: z.enum(["draft", "published"]).optional() }).parse(req.body);
  const creator = await Creator.findById(req.params.id); if (!creator) return res.status(404).json({ error: "creator_not_found" });
  if (body.status === "published" && (!creator.rightsAttestation?.creatorIsAdult || !creator.rightsAttestation?.distributionAuthorized)) return res.status(409).json({ error: "creator_attestation_required" });
  Object.assign(creator, body); await creator.save(); await audit(req, "creator.update", "creator", String(creator._id), body); res.json(creator);
}));
admin.delete("/creators/:id", asyncRoute(async (req, res) => {
  z.object({ confirmation: z.literal("confirm") }).strict().parse(req.body);
  const creator = await Creator.findById(req.params.id);
  if (!creator) return res.status(404).json({ error: "creator_not_found" });
  if (await Product.exists({ creatorId: creator._id })) return res.status(409).json({ error: "creator_has_products" });
  await Creator.deleteOne({ _id: creator._id });
  await audit(req, "creator.delete", "creator", String(creator._id)); res.status(204).end();
}));

admin.get("/categories", asyncRoute(async (_req, res) => res.json({ items: await Category.find().sort({ name: 1 }) })));
admin.post("/categories", asyncRoute(async (req, res) => {
  const body = z.object({ name: z.string().min(1).max(80), slug: z.string().regex(/^[a-z0-9-]+$/) }).parse(req.body);
  const category = await Category.create(body); await audit(req, "category.create", "category", String(category._id), body); res.status(201).json(category);
}));
admin.patch("/categories/:id", asyncRoute(async (req, res) => {
  const body = z.object({ name: z.string().min(1).max(80).optional(), slug: z.string().regex(/^[a-z0-9-]+$/).optional(), status: z.literal("active").optional() }).parse(req.body);
  const category = await Category.findByIdAndUpdate(req.params.id, { $set: body }, { new: true });
  if (!category) return res.status(404).json({ error: "category_not_found" });
  await audit(req, "category.update", "category", String(category._id), body); res.json(category);
}));
admin.delete("/categories/:id", asyncRoute(async (req, res) => {
  z.object({ confirmation: z.literal("confirm") }).strict().parse(req.body);
  const category = await Category.findById(req.params.id);
  if (!category) return res.status(404).json({ error: "category_not_found" });
  await Product.updateMany({ categoryIds: category._id }, { $pull: { categoryIds: category._id } });
  await Category.deleteOne({ _id: category._id });
  await audit(req, "category.delete", "category", String(category._id)); res.status(204).end();
}));

admin.post("/assets/upload-url", asyncRoute(async (req, res) => {
  const body = z.object({ fileName: z.string().min(1).max(240), purpose: z.enum(["delivery", "preview"]).default("delivery"), mimeType: z.string(), bytes: z.number().int().positive().max(maxAssetBytes), sha256: z.string().regex(/^[a-f0-9]{64}$/i) }).parse(req.body);
  if (body.purpose === "preview") previewMimeType.parse(body.mimeType); else deliveryMimeType.parse(body.mimeType);
  const asset = await MediaAsset.create({ ...body, storageKey: "pending" });
  asset.storageKey = objectKey(String(asset._id), body.fileName); await asset.save();
  res.status(201).json({ asset, uploadUrl: await signedUploadUrl(asset.storageKey, asset.mimeType) });
}));
admin.post("/assets/:id/complete", asyncRoute(async (req, res) => {
  const asset = await MediaAsset.findById(req.params.id); if (!asset) return res.status(404).json({ error: "asset_not_found" });
  const object = await storedObject(asset.storageKey);
  if (!object.bytes || object.bytes !== asset.bytes || object.bytes > maxAssetBytes || object.mimeType !== asset.mimeType) { await MediaAsset.updateOne({ _id: asset._id }, { $set: { status: "rejected" } }); return res.status(409).json({ error: "uploaded_media_invalid" }); }
  asset.status = "ready"; await asset.save(); await audit(req, "asset.complete", "media_asset", String(asset._id)); res.json(asset);
}));
admin.get("/assets", asyncRoute(async (_req, res) => {
  const assets = await MediaAsset.find().sort({ createdAt: -1 }).lean();
  res.json({
    items: await Promise.all(assets.map(async (asset: any) => ({
      _id: String(asset._id),
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      purpose: asset.purpose,
      status: asset.status,
      createdAt: asset.createdAt,
      url: asset.status === "ready" ? await signedDownloadUrl(asset.storageKey).catch(() => undefined) : undefined,
    }))),
  });
}));

admin.get("/products", asyncRoute(async (_req, res) => {
  const products = await Product.find().sort({ createdAt: -1 }).lean();
  const [previews, earnings] = await Promise.all([
    MediaAsset.find({ _id: { $in: products.flatMap((product: any) => product.previewAssetId ? [product.previewAssetId] : []) }, purpose: "preview", status: "ready" }).lean(),
    Order.aggregate([{ $match: { paymentStatus: "paid" } }, { $unwind: "$lines" }, { $group: { _id: "$lines.productId", grossMinor: { $sum: "$lines.amountMinor" } } }]),
  ]);
  const byId = new Map(previews.map((asset: any) => [String(asset._id), asset]));
  const revenueById = new Map(earnings.map((entry: any) => [String(entry._id), entry.grossMinor]));
  res.json({ items: await Promise.all(products.map(async (product: any) => {
    const asset: any = byId.get(String(product.previewAssetId));
    const url = asset ? await signedDownloadUrl(asset.storageKey).catch(() => undefined) : undefined;
    return { ...product, grossMinor: revenueById.get(String(product._id)) ?? 0, preview: url ? { mimeType: asset.mimeType, url } : null };
  })) });
}));
admin.post("/products", asyncRoute(async (req, res) => {
  const body = z.object({ creatorId: objectId, title: z.string().min(1).max(200), slug: z.string().regex(/^[a-z0-9-]+$/).optional(), description: z.string().max(4000).default(""), deliveryMessage: z.string().max(1000).default(""), categoryIds: objectIds, previewAssetId: objectId.nullish().transform((value) => value ?? undefined), previewMode: z.enum(["none", "blurred", "visible"]).default("blurred"), mediaAssetIds: nonEmptyObjectIds, amountMinor: euroMinor, currency: z.literal("EUR") }).parse(req.body);
  const creator = await Creator.findById(body.creatorId);
  if (!creator) return res.status(404).json({ error: "creator_not_found" });
  if (!previewIsConfigured(body.previewMode, body.previewAssetId) || (body.previewMode !== "none" && !await MediaAsset.exists({ _id: body.previewAssetId, purpose: "preview", status: "ready" }))) return res.status(409).json({ error: "preview_not_ready" });
  const [mediaCount, categoryCount] = await Promise.all([ MediaAsset.countDocuments({ _id: { $in: body.mediaAssetIds }, purpose: "delivery", status: "ready" }), Category.countDocuments({ _id: { $in: body.categoryIds }, status: "active" }) ]);
  if (mediaCount !== body.mediaAssetIds.length) return res.status(409).json({ error: "delivery_media_not_ready" });
  if (categoryCount !== body.categoryIds.length) return res.status(409).json({ error: "category_not_available" });
  const product = await Product.create({ ...body, slug: body.slug ?? await nextProductSlug(body.title, body.creatorId) }); await audit(req, "product.create", "product", String(product._id)); res.status(201).json(product);
}));
admin.patch("/products/:id", asyncRoute(async (req, res) => {
  const body = z.object({ creatorId: objectId.optional(), title: z.string().min(1).max(200).optional(), slug: z.string().regex(/^[a-z0-9-]+$/).optional(), description: z.string().max(4000).optional(), deliveryMessage: z.string().max(1000).optional(), categoryIds: objectIds.optional(), previewAssetId: objectId.nullable().optional(), previewMode: z.enum(["none", "blurred", "visible"]).optional(), amountMinor: euroMinor.optional(), status: z.enum(["draft", "review", "published"]).optional(), mediaAssetIds: nonEmptyObjectIds.optional(), currency: z.literal("EUR").optional() }).parse(req.body);
  const product = await Product.findById(req.params.id); if (!product) return res.status(404).json({ error: "product_not_found" });
  const creatorId = body.creatorId ?? String(product.creatorId);
  const mediaAssetIds = body.mediaAssetIds ?? product.mediaAssetIds.map(String);
  const catIds = body.categoryIds ?? (product.categoryIds ?? []).map(String);
  const previewMode = body.previewMode ?? product.previewMode;
  const selectedPreview = body.previewAssetId === null ? undefined : body.previewAssetId ?? product.previewAssetId;
  const previewAssetId = selectedPreview ? String(selectedPreview) : undefined;
  const [creator, mediaCount, categoryCount, previewReady] = await Promise.all([
    Creator.findById(creatorId),
    MediaAsset.countDocuments({ _id: { $in: mediaAssetIds }, purpose: "delivery", status: "ready" }),
    Category.countDocuments({ _id: { $in: catIds }, status: "active" }),
    previewMode === "none" ? true : Boolean(previewAssetId && await MediaAsset.exists({ _id: previewAssetId, purpose: "preview", status: "ready" })),
  ]);
  if (!creator) return res.status(404).json({ error: "creator_not_found" });
  if (mediaCount !== mediaAssetIds.length) return res.status(409).json({ error: "delivery_media_not_ready" });
  if (categoryCount !== catIds.length) return res.status(409).json({ error: "category_not_available" });
  if (!previewIsConfigured(previewMode, previewAssetId) || !previewReady) return res.status(409).json({ error: "preview_not_ready" });
  if (body.status === "published" && (!creator.rightsAttestation?.creatorIsAdult || !creator.rightsAttestation?.distributionAuthorized)) return res.status(409).json({ error: "product_not_ready_for_publish" });
  if (body.mediaAssetIds) product.contentVersion += 1;
  Object.assign(product, body, { previewAssetId }); await product.save(); await audit(req, "product.update", "product", String(product._id), body); res.json(product);
}));
admin.delete("/products/:id", asyncRoute(async (req, res) => {
  z.object({ confirmation: z.literal("confirm") }).strict().parse(req.body);
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ error: "product_not_found" });
  await Cart.updateMany({ status: "active", "items.productId": product._id }, { $pull: { items: { productId: product._id } } });
  await Product.deleteOne({ _id: product._id });
  await audit(req, "product.delete", "product", String(product._id)); res.status(204).end();
}));

admin.get("/analytics/products", asyncRoute(async (_req, res) => {
  const from = typeof _req.query.from === "string" ? new Date(_req.query.from) : undefined;
  const to = typeof _req.query.to === "string" ? new Date(_req.query.to) : undefined;
  if ((from && Number.isNaN(from.valueOf())) || (to && Number.isNaN(to.valueOf()))) return res.status(400).json({ error: "invalid_date_range" });
  const dateMatch = from || to ? { paidAt: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } : {};
  const paid = [{ $match: { paymentStatus: "paid", ...dateMatch } }, { $unwind: "$lines" }];
  const [products, creators, categories, days, statuses] = await Promise.all([
    Order.aggregate([...paid, { $group: { _id: "$lines.productId", title: { $first: "$lines.productTitle" }, purchases: { $sum: 1 }, grossMinor: { $sum: "$lines.amountMinor" } } }, { $sort: { grossMinor: -1 } }]),
    Order.aggregate([...paid, { $group: { _id: "$lines.creatorId", name: { $first: "$lines.creatorName" }, purchases: { $sum: 1 }, grossMinor: { $sum: "$lines.amountMinor" } } }, { $sort: { grossMinor: -1 } }]),
    Order.aggregate([...paid, { $unwind: { path: "$lines.categoryNames", preserveNullAndEmptyArrays: true } }, { $group: { _id: { $ifNull: ["$lines.categoryNames", "Uncategorized"] }, purchases: { $sum: 1 }, grossMinor: { $sum: "$lines.amountMinor" } } }, { $sort: { grossMinor: -1 } }]),
    Order.aggregate([...paid, { $group: { _id: { $dateToString: { date: "$paidAt", format: "%Y-%m-%d", timezone: "UTC" } }, purchases: { $sum: 1 }, grossMinor: { $sum: "$lines.amountMinor" } } }, { $sort: { _id: 1 } }]),
    Order.aggregate([{ $match: dateMatch }, { $group: { _id: "$paymentStatus", orders: { $sum: 1 }, grossMinor: { $sum: "$totalMinor" } } }, { $sort: { _id: 1 } }]),
  ]);
  res.json({ products, creators, categories, days, statuses });
}));

// --- Admin: Orders list ---
function adminDateRange(query: Request["query"]) {
  const parse = (value: unknown, end: boolean) => {
    if (!value) return undefined;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("invalid_date_range");
    const date = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
    if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw new Error("invalid_date_range");
    return date;
  };
  const from = parse(query.from, false), to = parse(query.to, true);
  if (from && to && from > to) throw new Error("invalid_date_range");
  return from || to ? { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } : undefined;
}

admin.get("/orders", asyncRoute(async (req, res) => {
  const q = z.object({ status: z.enum(["pending", "paid", "expired", "failed", "refunded", "charged_back"]).optional(), customer: z.string().max(100).optional(), customerId: objectId.optional(), page: z.coerce.number().int().min(1).max(100000).default(1) }).parse(req.query);
  const range = adminDateRange(req.query);
  const filter: Record<string, unknown> = {};
  if (q.status) filter.paymentStatus = q.status;
  if (range) filter.createdAt = range;
  if (q.customerId) filter.telegramUserId = q.customerId;
  if (q.customer?.trim()) {
    const words = q.customer.trim().split(/\s+/).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const users = await TelegramUser.find({ $and: words.map((word) => ({ $or: ["firstName", "lastName", "username", "telegramId"].map((field) => ({ [field]: { $regex: word, $options: "i" } })) })) }).select("_id").lean();
    filter.telegramUserId = { $in: users.map((user) => user._id) };
  }
  const limit = 20;
  const [orders, total] = await Promise.all([Order.find(filter).sort({ createdAt: -1, _id: -1 }).skip((q.page - 1) * limit).limit(limit).lean(), Order.countDocuments(filter)]);
  const userIds = [...new Set(orders.map((o: any) => String(o.telegramUserId)))];
  const users = await TelegramUser.find({ _id: { $in: userIds } }).lean();
  const userMap = new Map(users.map((u: any) => [String(u._id), u]));
  res.json({ page: q.page, total, pages: Math.max(1, Math.ceil(total / limit)), items: orders.map((o: any) => ({ _id: o._id, publicId: o.publicId, totalMinor: o.totalMinor, currency: o.currency, paymentStatus: o.paymentStatus, fulfillmentStatus: o.fulfillmentStatus, createdAt: o.createdAt, paidAt: o.paidAt, lines: (o.lines ?? []).map((l: any) => ({ productTitle: l.productTitle, creatorName: l.creatorName, amountMinor: l.amountMinor })), telegramUser: (() => { const u = userMap.get(String(o.telegramUserId)); if (!u) return null; return isBrowserCustomer(u) ? { firstName: BROWSER_CUSTOMER_LABEL } : { username: u.username, firstName: u.firstName, lastName: u.lastName }; })() })) });
}));

admin.get("/customers", asyncRoute(async (req, res) => {
  const { search } = z.object({ search: z.string().max(100).optional() }).parse(req.query);
  const range = adminDateRange(req.query);
  const words = (search ?? "").trim().replace(/^@/, "").split(/\s+/).filter(Boolean).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const filter = { telegramId: { $not: /^browser:/ }, ...(words.length ? { $and: words.map((word) => ({ $or: ["firstName", "lastName", "username", "telegramId"].map((field) => ({ [field]: { $regex: word, $options: "i" } })) })) } : {}) };
  const [users, totals] = await Promise.all([
    TelegramUser.find(filter).select("telegramId username firstName lastName").sort({ createdAt: -1 }).lean(),
    Order.aggregate([{ $match: { paymentStatus: "paid", ...(range ? { paidAt: range } : {}) } }, { $group: { _id: "$telegramUserId", totalMinor: { $sum: "$totalMinor" }, purchases: { $sum: 1 } } }]),
  ]);
  const byUser = new Map(totals.map((total: any) => [String(total._id), total]));
  res.json({ items: users.filter((user: any) => !isBrowserCustomer(user)).map((user: any) => ({ ...user, totalMinor: byUser.get(String(user._id))?.totalMinor ?? 0, purchases: byUser.get(String(user._id))?.purchases ?? 0 })) });
}));

// --- Admin: Revenue summary ---
admin.get("/revenue", asyncRoute(async (req, res) => {
  const range = adminDateRange(req.query);
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [total, today, month, creators, statusCounts] = await Promise.all([
    Order.aggregate([{ $match: { paymentStatus: "paid" } }, { $group: { _id: null, grossMinor: { $sum: "$totalMinor" }, count: { $sum: 1 } } }]),
    Order.aggregate([{ $match: { paymentStatus: "paid", paidAt: { $gte: startOfDay } } }, { $group: { _id: null, grossMinor: { $sum: "$totalMinor" }, count: { $sum: 1 } } }]),
    Order.aggregate([{ $match: { paymentStatus: "paid", paidAt: { $gte: startOfMonth } } }, { $group: { _id: null, grossMinor: { $sum: "$totalMinor" }, count: { $sum: 1 } } }]),
    Order.aggregate([{ $match: { paymentStatus: "paid", ...(range ? { paidAt: range } : {}) } }, { $unwind: "$lines" }, { $group: { _id: "$lines.creatorId", name: { $first: "$lines.creatorName" }, purchases: { $sum: 1 }, grossMinor: { $sum: "$lines.amountMinor" } } }, { $sort: { grossMinor: -1 } }]),
    Order.aggregate([{ $group: { _id: "$paymentStatus", count: { $sum: 1 } } }]),
  ]);
  res.json({ total: total[0] ?? { grossMinor: 0, count: 0 }, today: today[0] ?? { grossMinor: 0, count: 0 }, month: month[0] ?? { grossMinor: 0, count: 0 }, creators, statusCounts: Object.fromEntries(statusCounts.map((s: any) => [s._id, s.count])) });
}));

admin.get("/deliveries/failures", asyncRoute(async (_req, res) => res.json({ items: await Delivery.find({ status: { $in: ["retry", "failed"] } }).sort({ updatedAt: 1 }) })));
admin.post("/orders/:publicId/refund-record", asyncRoute(async (req, res) => {
  const order = await Order.findOneAndUpdate({ publicId: req.params.publicId, paymentStatus: "paid" }, { $set: { paymentStatus: "refunded", fulfillmentStatus: "revoked" } }, { new: true });
  if (!order) return res.status(404).json({ error: "paid_order_not_found" });
  await Entitlement.updateMany({ orderId: order._id }, { $set: { status: "revoked" } });
  await audit(req, "order.refund_recorded", "order", String(order._id));
  res.json({ publicId: order.publicId, paymentStatus: order.paymentStatus });
}));

app.use("/api/admin", admin);

app.get("/payment-complete", (_req, res) => res.redirect(302, `${config.APP_ORIGIN}/payment-complete${_req.url.includes("?") ? _req.url.slice(_req.url.indexOf("?")) : ""}`));
app.use((_req, res) => res.status(404).json({ error: "not_found" }));

export { app };
