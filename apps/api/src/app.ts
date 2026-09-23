import crypto from "node:crypto";
import cors from "cors";
import express, { type Request, type Response } from "express";
import { z } from "zod";
import { config } from "./config.js";
import { issueAdminSession, issueTelegramSession, requireActor } from "./auth.js";
import { Agency, Agent, AuditEvent, Cart, Creator, Delivery, Entitlement, MediaAsset, Order, Product, TelegramUser, WebhookEvent } from "./models.js";
import { applyHigherPaysEvent, createOrderForCart } from "./orders.js";
import { reconcileHigherPaysOrder, verifyHigherPaysEvent, type HigherPaysLifecycleEvent } from "./higherpays.js";
import { objectKey, signedDownloadUrl, signedUploadUrl, storedObject } from "./storage.js";
import { deliverEntitlements } from "./telegram.js";
import { rateLimit } from "./rate-limit.js";

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/);
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
      : ["telegram_auth_unavailable", "invalid_telegram_init_data", "expired_telegram_init_data", "missing_telegram_user"].includes(message) ? 401
      : ["cart_empty", "unavailable_product", "mixed_currency_cart", "mixed_agency_cart", "age_confirmation_required", "agency_checkout_not_configured"].includes(message) ? 409
        : ["higherpays_not_configured", "object_storage_not_configured"].includes(message) ? 503 : 500;
    res.status(status).json({ error: message });
  });
const actorUser = (req: Request) => req.actor?.kind === "telegram" ? req.actor.userId : null;
const previewMimeType = z.enum(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "video/quicktime"]);
const deliveryMimeType = z.string().regex(/^(image|video|audio|application)\//);
const maxAssetBytes = 50_000_000;
const catalogProduct = async (product: any, previews: Map<string, any>) => {
  const preview = product.previewAssetId ? previews.get(String(product.previewAssetId)) : undefined;
  return {
    _id: String(product._id), title: product.title, description: product.description, amountMinor: product.amountMinor,
    currency: product.currency, creatorId: String(product.creatorId), preview: preview ? {
      mimeType: preview.mimeType, url: await signedDownloadUrl(preview.storageKey),
    } : null,
  };
};
const equalSecret = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const audit = (req: Request, action: string, entityType: string, entityId?: string, metadata?: unknown) =>
  AuditEvent.create({ actorType: req.actor?.kind ?? "system", actorId: req.actor?.kind === "admin" ? req.actor.email : req.actor?.kind === "telegram" ? req.actor.telegramId : undefined, action, entityType, entityId, metadata, ip: req.ip });

const health = asyncRoute(async (_req, res) => {
  res.json({ ok: true });
});
app.get("/health", health);
app.get("/api/health", health);

app.use("/api/integrations/higherpays/events", express.raw({ type: "application/json", limit: "1mb" }));
app.post("/api/integrations/higherpays/events", asyncRoute(async (req, res) => {
  const raw = (req.body as Buffer).toString("utf8");
  const eventId = req.header("x-higherpays-event-id") ?? undefined;
  if (!verifyHigherPaysEvent(req.header("x-higherpays-timestamp") ?? undefined, eventId, req.header("x-higherpays-signature") ?? undefined, raw)) {
    return res.status(401).json({ error: "invalid_higherpays_signature" });
  }
  const event = z.object({
    eventId: z.string().uuid(), type: z.enum(["payment.approved", "payment.refunded", "payment.chargeback"]),
    occurredAt: z.string().datetime(), marketplaceOrderId: z.string().min(8), paymentLinkReference: z.string().min(1),
    paymentId: z.string().uuid().nullable(), providerTransactionId: z.string().nullable(),
    amountMinor: z.number().int().positive(), currency: z.string().length(3),
  }).parse(JSON.parse(raw)) as HigherPaysLifecycleEvent;
  if (event.eventId !== eventId) return res.status(400).json({ error: "event_id_mismatch" });
  try {
    await WebhookEvent.create({ provider: "higherpays", providerEventId: event.eventId, type: event.type, signatureValid: true, payload: event });
  } catch (error: unknown) {
    if ((error as { code?: number }).code === 11000) return res.json({ ok: true, duplicate: true });
    throw error;
  }
  try {
    await applyHigherPaysEvent(event);
    await WebhookEvent.updateOne({ providerEventId: event.eventId, type: event.type }, { $set: { processedAt: new Date() } });
    res.json({ ok: true });
  } catch (error) {
    await WebhookEvent.updateOne({ providerEventId: event.eventId, type: event.type }, { $set: { processingError: error instanceof Error ? error.message.slice(0, 500) : "processing_failed" } });
    throw error;
  }
}));
app.use(express.json({ limit: "1mb" }));

app.post("/api/auth/telegram", rateLimit(60_000, 30), asyncRoute(async (req, res) => {
  const body = z.object({ initData: z.string().min(1) }).parse(req.body);
  res.json({ token: await issueTelegramSession(body.initData) });
}));
app.post("/api/auth/admin", rateLimit(15 * 60_000, 10), asyncRoute(async (req, res) => {
  const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const passwordOk = equalSecret(body.email, config.ADMIN_EMAIL) && equalSecret(body.password, config.ADMIN_PASSWORD);
  if (!passwordOk) return res.status(401).json({ error: "invalid_credentials" });
  res.json({ token: issueAdminSession(body.email) });
}));

app.get("/api/catalog/creators", requireActor("telegram"), asyncRoute(async (_req, res) => {
  res.json({ items: await Creator.find({ status: "published" }).select("displayName slug bio avatarAssetId").sort({ displayName: 1 }) });
}));
app.get("/api/catalog/creators/:slug/products", requireActor("telegram"), asyncRoute(async (req, res) => {
  const creator = await Creator.findOne({ slug: req.params.slug, status: "published" });
  if (!creator) return res.status(404).json({ error: "creator_not_found" });
  const products = await Product.find({ creatorId: creator._id, status: "published" }).select("-mediaAssetIds").sort({ createdAt: -1 });
  const previewIds = products.flatMap((product: any) => product.previewAssetId ? [product.previewAssetId] : []);
  const previews = new Map((await MediaAsset.find({ _id: { $in: previewIds }, purpose: "preview", status: "ready" }))
    .map((asset: any) => [String(asset._id), asset]));
  res.json({ creator, items: await Promise.all(products.map((product) => catalogProduct(product, previews))) });
}));
app.get("/api/catalog/products/:id", requireActor("telegram"), asyncRoute(async (req, res) => {
  if (!objectId.safeParse(req.params.id).success) return res.status(404).json({ error: "product_not_found" });
  const product = await Product.findOne({ _id: req.params.id, status: "published" }).select("-mediaAssetIds");
  if (!product) return res.status(404).json({ error: "product_not_found" });
  const preview = product.previewAssetId ? await MediaAsset.findOne({ _id: product.previewAssetId, purpose: "preview", status: "ready" }) : null;
  res.json(await catalogProduct(product, new Map(preview ? [[String(preview._id), preview]] : [])));
}));

app.post("/api/me/age-confirmation", requireActor("telegram"), asyncRoute(async (req, res) => {
  const body = z.object({ accepted: z.literal(true), version: z.string().min(1).max(32) }).parse(req.body);
  await TelegramUser.updateOne({ _id: actorUser(req) }, { $set: { ageConfirmedAt: new Date(), ageConfirmationVersion: body.version } });
  res.status(204).end();
}));
app.get("/api/cart", requireActor("telegram"), asyncRoute(async (req, res) => {
  const userId = actorUser(req)!;
  const cart = await Cart.findOne({ telegramUserId: userId, status: "active" });
  res.json(cart ?? { items: [], currency: config.MARKETPLACE_CURRENCY });
}));
app.post("/api/cart/items", requireActor("telegram"), asyncRoute(async (req, res) => {
  const body = z.object({ productId: objectId }).parse(req.body);
  const product = await Product.findOne({ _id: body.productId, status: "published" });
  if (!product) return res.status(404).json({ error: "product_not_found" });
  const creator = await Creator.findById(product.creatorId);
  const userId = actorUser(req)!;
  const existing = await Cart.findOne({ telegramUserId: userId, currency: product.currency, status: "active" });
  if (existing?.items.length) {
    const firstProduct = await Product.findById(existing.items[0].productId).select("agencyId");
    if (firstProduct && String(firstProduct.agencyId) !== String(product.agencyId)) return res.status(409).json({ error: "mixed_agency_cart" });
  }
  const cart = await Cart.findOneAndUpdate(
    { telegramUserId: userId, currency: product.currency, status: "active" },
    { $setOnInsert: { telegramUserId: userId, currency: product.currency }, $addToSet: { items: { productId: product._id, titleSnapshot: product.title, creatorNameSnapshot: creator?.displayName ?? "Creator", priceMinorSnapshot: product.amountMinor, contentVersionSnapshot: product.contentVersion } } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  res.status(201).json(cart);
}));
app.delete("/api/cart/items/:productId", requireActor("telegram"), asyncRoute(async (req, res) => {
  await Cart.updateOne({ telegramUserId: actorUser(req), status: "active" }, { $pull: { items: { productId: req.params.productId } } });
  res.status(204).end();
}));

app.post("/api/checkout", requireActor("telegram"), rateLimit(60_000, 5), asyncRoute(async (req, res) => {
  const order = await createOrderForCart(actorUser(req)!);
  res.status(201).json({
    orderId: order.publicId,
    totalMinor: order.totalMinor,
    currency: order.currency,
    checkoutUrl: new URL(`/api/checkout/${order.publicId}?state=${order.returnNonce}`, config.PUBLIC_APP_URL).toString(),
  });
}));
app.get("/api/checkout/:publicId", rateLimit(60_000, 10), asyncRoute(async (req, res) => {
  const order = await Order.findOne({ publicId: req.params.publicId, returnNonce: req.query.state, paymentStatus: "pending" });
  if (!order || order.expiresAt < new Date() || !order.higherPaysCheckoutUrl) return res.status(410).send("This checkout session has expired.");
  res.redirect(302, order.higherPaysCheckoutUrl);
}));
app.get("/api/orders/:publicId", requireActor("telegram"), asyncRoute(async (req, res) => {
  const order = await Order.findOne({ publicId: req.params.publicId, telegramUserId: actorUser(req) }).select("-returnNonce");
  if (!order) return res.status(404).json({ error: "order_not_found" });
  res.json(order);
}));
app.get("/api/payment-return/:publicId", asyncRoute(async (req, res) => {
  const order = await Order.findOne({ publicId: req.params.publicId, returnNonce: req.query.state }).select("paymentStatus fulfillmentStatus");
  if (!order) return res.status(404).json({ error: "order_not_found" });
  res.json(order);
}));
app.post("/api/orders/:publicId/reconcile", requireActor("telegram"), asyncRoute(async (req, res) => {
  const order = await Order.findOne({ publicId: req.params.publicId, telegramUserId: actorUser(req) });
  if (!order) return res.status(404).json({ error: "order_not_found" });
  const status = await reconcileHigherPaysOrder(order.publicId);
  await applyHigherPaysEvent(status);
  res.json({ status: status.status });
}));
app.get("/api/purchases", requireActor("telegram"), asyncRoute(async (req, res) => {
  res.json({ items: await Order.find({ telegramUserId: actorUser(req), paymentStatus: "paid" }).select("publicId lines paymentStatus fulfillmentStatus paidAt currency totalMinor").sort({ paidAt: -1 }) });
}));
app.post("/api/purchases/:publicId/retry-delivery", requireActor("telegram"), asyncRoute(async (req, res) => {
  const order = await Order.findOne({ publicId: req.params.publicId, telegramUserId: actorUser(req), paymentStatus: "paid" });
  if (!order) return res.status(404).json({ error: "order_not_found" });
  await Delivery.updateMany({ entitlementId: { $in: (await Entitlement.find({ orderId: order._id }).distinct("_id")) }, status: { $in: ["failed", "retry"] } }, { $set: { status: "queued", error: null } });
  void deliverEntitlements(String(order._id));
  res.status(202).json({ ok: true });
}));

const admin = express.Router();
admin.use(requireActor("admin"));
admin.get("/agencies", asyncRoute(async (_req, res) => res.json({ items: await Agency.find().sort({ name: 1 }) })));
admin.post("/agencies", asyncRoute(async (req, res) => {
  const body = z.object({ name: z.string().min(1).max(120), higherPaysWorkspaceId: z.string().min(1).max(100) }).parse(req.body);
  const agency = await Agency.create(body); await audit(req, "agency.create", "agency", String(agency._id)); res.status(201).json(agency);
}));
admin.patch("/agencies/:id", asyncRoute(async (req, res) => {
  const body = z.object({ defaultAgentId: objectId.optional(), status: z.enum(["active", "archived"]).optional() }).parse(req.body);
  const agency = await Agency.findByIdAndUpdate(req.params.id, { $set: body }, { new: true }); if (!agency) return res.status(404).json({ error: "agency_not_found" });
  await audit(req, "agency.update", "agency", String(agency._id), body); res.json(agency);
}));
admin.post("/agents", asyncRoute(async (req, res) => {
  const body = z.object({ agencyId: objectId, name: z.string().min(1).max(120), higherPaysAgentId: z.string().min(1).max(100) }).parse(req.body);
  const agent = await Agent.create(body); await audit(req, "agent.create", "agent", String(agent._id)); res.status(201).json(agent);
}));
admin.get("/agents", asyncRoute(async (_req, res) => res.json({ items: await Agent.find().sort({ name: 1 }) })));
admin.get("/creators", asyncRoute(async (_req, res) => res.json({ items: await Creator.find().sort({ displayName: 1 }) })));
admin.post("/creators", asyncRoute(async (req, res) => {
  const body = z.object({ agencyId: objectId, displayName: z.string().min(1).max(120), slug: z.string().regex(/^[a-z0-9-]+$/), bio: z.string().max(4000).default(""), rightsAttestation: z.object({ affirmedBy: z.string().min(1), statementVersion: z.string().min(1), creatorIsAdult: z.literal(true), distributionAuthorized: z.literal(true) }) }).parse(req.body);
  const creator = await Creator.create({ ...body, rightsAttestation: { ...body.rightsAttestation, affirmedAt: new Date() } });
  await audit(req, "creator.create", "creator", String(creator._id)); res.status(201).json(creator);
}));
admin.patch("/creators/:id", asyncRoute(async (req, res) => {
  const body = z.object({ displayName: z.string().min(1).max(120).optional(), bio: z.string().max(4000).optional(), status: z.enum(["draft", "published", "archived"]).optional() }).parse(req.body);
  const creator = await Creator.findById(req.params.id); if (!creator) return res.status(404).json({ error: "creator_not_found" });
  if (body.status === "published" && (!creator.rightsAttestation?.creatorIsAdult || !creator.rightsAttestation?.distributionAuthorized)) return res.status(409).json({ error: "creator_attestation_required" });
  Object.assign(creator, body); await creator.save(); await audit(req, "creator.update", "creator", String(creator._id), body); res.json(creator);
}));
admin.post("/assets/upload-url", asyncRoute(async (req, res) => {
  const body = z.object({
    agencyId: objectId, fileName: z.string().min(1).max(240), purpose: z.enum(["delivery", "preview"]).default("delivery"),
    mimeType: z.string(), bytes: z.number().int().positive().max(maxAssetBytes), sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  }).parse(req.body);
  if (body.purpose === "preview") previewMimeType.parse(body.mimeType);
  else deliveryMimeType.parse(body.mimeType);
  const asset = await MediaAsset.create({ ...body, storageKey: "pending" });
  asset.storageKey = objectKey(body.agencyId, String(asset._id), body.fileName); await asset.save();
  res.status(201).json({ asset, uploadUrl: await signedUploadUrl(asset.storageKey, asset.mimeType) });
}));
admin.post("/assets/:id/complete", asyncRoute(async (req, res) => {
  const asset = await MediaAsset.findById(req.params.id); if (!asset) return res.status(404).json({ error: "asset_not_found" });
  const object = await storedObject(asset.storageKey);
  if (!object.bytes || object.bytes !== asset.bytes || object.bytes > maxAssetBytes || object.mimeType !== asset.mimeType) {
    await MediaAsset.updateOne({ _id: asset._id }, { $set: { status: "rejected" } });
    return res.status(409).json({ error: "uploaded_media_invalid" });
  }
  asset.status = "ready"; await asset.save();
  await audit(req, "asset.complete", "media_asset", String(asset._id)); res.json(asset);
}));
admin.get("/assets", asyncRoute(async (_req, res) => res.json({ items: await MediaAsset.find().sort({ createdAt: -1 }) })));
admin.get("/products", asyncRoute(async (_req, res) => res.json({ items: await Product.find().sort({ createdAt: -1 }) })));
admin.post("/products", asyncRoute(async (req, res) => {
  const body = z.object({ agencyId: objectId, creatorId: objectId, title: z.string().min(1).max(200), slug: z.string().regex(/^[a-z0-9-]+$/), description: z.string().max(4000).default(""), previewAssetId: objectId.optional(), mediaAssetIds: z.array(objectId).min(1), amountMinor: z.number().int().min(300), currency: z.enum(["EUR", "USD", "GBP"]) }).parse(req.body);
  const creator = await Creator.findOne({ _id: body.creatorId, agencyId: body.agencyId });
  if (!creator) return res.status(409).json({ error: "creator_agency_mismatch" });
  if (body.previewAssetId && !await MediaAsset.exists({ _id: body.previewAssetId, agencyId: body.agencyId, purpose: "preview", status: "ready" })) {
    return res.status(409).json({ error: "preview_not_ready" });
  }
  const product = await Product.create(body); await audit(req, "product.create", "product", String(product._id)); res.status(201).json(product);
}));
admin.patch("/products/:id", asyncRoute(async (req, res) => {
  const body = z.object({ title: z.string().min(1).max(200).optional(), description: z.string().max(4000).optional(), amountMinor: z.number().int().min(300).optional(), status: z.enum(["draft", "review", "published", "archived"]).optional(), mediaAssetIds: z.array(objectId).min(1).optional() }).parse(req.body);
  const product = await Product.findById(req.params.id); if (!product) return res.status(404).json({ error: "product_not_found" });
  if (body.status === "published") {
    const [creator, count] = await Promise.all([Creator.findById(product.creatorId), MediaAsset.countDocuments({ _id: { $in: body.mediaAssetIds ?? product.mediaAssetIds }, agencyId: product.agencyId, purpose: { $in: ["delivery", null] }, status: "ready" })]);
    if (!creator?.rightsAttestation?.creatorIsAdult || !creator.rightsAttestation?.distributionAuthorized || count !== (body.mediaAssetIds ?? product.mediaAssetIds).length) return res.status(409).json({ error: "product_not_ready_for_publish" });
  }
  if (body.mediaAssetIds) product.contentVersion += 1;
  Object.assign(product, body); await product.save(); await audit(req, "product.update", "product", String(product._id), body); res.json(product);
}));
admin.get("/analytics/products", asyncRoute(async (_req, res) => {
  const items = await Order.aggregate([{ $match: { paymentStatus: "paid" } }, { $unwind: "$lines" }, { $group: { _id: "$lines.productId", purchases: { $sum: 1 }, grossMinor: { $sum: "$lines.amountMinor" } } }, { $sort: { purchases: -1 } }]);
  res.json({ items });
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
