import { Schema, model, models, type InferSchemaType } from "mongoose";

const timestamps = { timestamps: true };
const money = { amountMinor: { type: Number, required: true, min: 1 }, currency: { type: String, required: true, uppercase: true } };
const assetSnapshot = new Schema({
  assetId: { type: String, required: true },
  storageKey: { type: String, required: true },
  fileName: { type: String, required: true },
  mimeType: { type: String, required: true },
  telegramFileId: String,
}, { _id: false });

const agencySchema = new Schema({
  name: { type: String, required: true, trim: true },
  higherPaysWorkspaceId: { type: String, required: true, unique: true },
  defaultAgentId: { type: Schema.Types.ObjectId, ref: "Agent" },
  status: { type: String, enum: ["active", "archived"], default: "active" },
}, timestamps);

const agentSchema = new Schema({
  agencyId: { type: Schema.Types.ObjectId, ref: "Agency", required: true, index: true },
  name: { type: String, required: true, trim: true },
  higherPaysAgentId: { type: String, required: true },
  active: { type: Boolean, default: true },
}, timestamps);
agentSchema.index({ agencyId: 1, higherPaysAgentId: 1 }, { unique: true });

const creatorSchema = new Schema({
  agencyId: { type: Schema.Types.ObjectId, ref: "Agency", required: true, index: true },
  displayName: { type: String, required: true, trim: true },
  slug: { type: String, required: true, lowercase: true, trim: true, unique: true },
  bio: { type: String, default: "" },
  avatarAssetId: String,
  status: { type: String, enum: ["draft", "published", "archived"], default: "draft" },
  rightsAttestation: {
    affirmedBy: String,
    affirmedAt: Date,
    statementVersion: String,
    creatorIsAdult: Boolean,
    distributionAuthorized: Boolean,
  },
}, timestamps);

const mediaAssetSchema = new Schema({
  agencyId: { type: Schema.Types.ObjectId, ref: "Agency", required: true, index: true },
  storageKey: { type: String, required: true, unique: true },
  fileName: { type: String, required: true },
  mimeType: { type: String, required: true },
  bytes: { type: Number, required: true, min: 1 },
  sha256: { type: String, required: true },
  status: { type: String, enum: ["pending", "ready", "rejected"], default: "pending" },
  telegramFileId: String,
}, timestamps);

const productSchema = new Schema({
  agencyId: { type: Schema.Types.ObjectId, ref: "Agency", required: true, index: true },
  creatorId: { type: Schema.Types.ObjectId, ref: "Creator", required: true, index: true },
  title: { type: String, required: true, trim: true },
  slug: { type: String, required: true, trim: true, lowercase: true },
  description: { type: String, default: "" },
  previewAssetId: String,
  mediaAssetIds: [{ type: Schema.Types.ObjectId, ref: "MediaAsset", required: true }],
  ...money,
  contentVersion: { type: Number, default: 1, min: 1 },
  status: { type: String, enum: ["draft", "review", "published", "archived"], default: "draft" },
  purchasesCount: { type: Number, default: 0, min: 0 },
}, timestamps);
productSchema.index({ creatorId: 1, slug: 1 }, { unique: true });
productSchema.index({ agencyId: 1, status: 1, createdAt: -1 });

const telegramUserSchema = new Schema({
  telegramId: { type: String, required: true, unique: true },
  chatId: String,
  username: String,
  firstName: String,
  lastName: String,
  ageConfirmedAt: Date,
  ageConfirmationVersion: String,
  deliveryBlockedAt: Date,
  lastSeenAt: { type: Date, default: Date.now },
}, timestamps);

const cartItemSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
  quantity: { type: Number, default: 1, min: 1, max: 1 },
  titleSnapshot: { type: String, required: true },
  creatorNameSnapshot: { type: String, required: true },
  priceMinorSnapshot: { type: Number, required: true },
  contentVersionSnapshot: { type: Number, required: true },
}, { _id: false });
const cartSchema = new Schema({
  telegramUserId: { type: Schema.Types.ObjectId, ref: "TelegramUser", required: true },
  currency: { type: String, required: true, uppercase: true },
  items: { type: [cartItemSchema], default: [] },
  status: { type: String, enum: ["active", "checked_out", "abandoned"], default: "active" },
}, timestamps);
cartSchema.index({ telegramUserId: 1, currency: 1, status: 1 }, { unique: true, partialFilterExpression: { status: "active" } });

const orderLineSchema = new Schema({
  productId: { type: String, required: true },
  creatorId: { type: String, required: true },
  productTitle: { type: String, required: true },
  creatorName: { type: String, required: true },
  contentVersion: { type: Number, required: true },
  ...money,
  assets: { type: [assetSnapshot], default: [] },
}, { _id: true });
const orderSchema = new Schema({
  publicId: { type: String, required: true, unique: true },
  agencyId: { type: Schema.Types.ObjectId, ref: "Agency", required: true, index: true },
  agentId: { type: Schema.Types.ObjectId, ref: "Agent", required: true, index: true },
  higherPaysWorkspaceId: { type: String, required: true },
  higherPaysAgentId: { type: String, required: true },
  telegramUserId: { type: Schema.Types.ObjectId, ref: "TelegramUser", required: true, index: true },
  cartId: { type: Schema.Types.ObjectId, ref: "Cart", required: true, unique: true },
  lines: { type: [orderLineSchema], required: true, validate: [(value: unknown[]) => value.length > 0, "order_needs_lines"] },
  subtotalMinor: { type: Number, required: true },
  checkoutFeeMinor: { type: Number, required: true, default: 0 },
  totalMinor: { type: Number, required: true },
  currency: { type: String, required: true, uppercase: true },
  paymentStatus: { type: String, enum: ["pending", "paid", "failed", "expired", "refunded", "charged_back"], default: "pending", index: true },
  fulfillmentStatus: { type: String, enum: ["not_ready", "queued", "partial", "delivered", "failed", "revoked"], default: "not_ready" },
  mantaPayOrderRef: { type: String, required: true, unique: true },
  providerTransactionId: String,
  returnNonce: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  paidAt: Date,
  higherPaysExportedAt: Date,
}, timestamps);

const paymentAttemptSchema = new Schema({
  orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true, index: true },
  provider: { type: String, enum: ["mantapay"], default: "mantapay" },
  providerEventId: { type: String, sparse: true, unique: true },
  providerTransactionId: { type: String, sparse: true, unique: true },
  status: { type: String, enum: ["created", "pending", "approved", "declined", "chargeback"], default: "created" },
  replyCode: String,
  grossMinor: Number,
  rawPayload: Schema.Types.Mixed,
}, timestamps);

const entitlementSchema = new Schema({
  telegramUserId: { type: Schema.Types.ObjectId, ref: "TelegramUser", required: true },
  orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
  orderLineId: { type: String, required: true },
  assets: { type: [assetSnapshot], default: [] },
  status: { type: String, enum: ["active", "revoked"], default: "active" },
}, timestamps);
entitlementSchema.index({ telegramUserId: 1, orderLineId: 1 }, { unique: true });

const deliverySchema = new Schema({
  entitlementId: { type: Schema.Types.ObjectId, ref: "Entitlement", required: true },
  assetId: { type: String, required: true },
  status: { type: String, enum: ["queued", "sending", "sent", "retry", "failed"], default: "queued", index: true },
  attempts: { type: Number, default: 0 },
  telegramMessageId: Number,
  error: String,
  sentAt: Date,
}, timestamps);
deliverySchema.index({ entitlementId: 1, assetId: 1 }, { unique: true });

const webhookEventSchema = new Schema({
  provider: { type: String, default: "mantapay" },
  providerEventId: { type: String, required: true },
  type: { type: String, required: true },
  signatureValid: { type: Boolean, required: true },
  processedAt: Date,
  processingError: String,
  payload: Schema.Types.Mixed,
}, timestamps);
webhookEventSchema.index({ provider: 1, providerEventId: 1, type: 1 }, { unique: true });

const auditEventSchema = new Schema({
  actorType: { type: String, required: true },
  actorId: String,
  action: { type: String, required: true },
  entityType: { type: String, required: true },
  entityId: String,
  metadata: Schema.Types.Mixed,
  ip: String,
}, timestamps);

export const Agency = models.Agency || model("Agency", agencySchema);
export const Agent = models.Agent || model("Agent", agentSchema);
export const Creator = models.Creator || model("Creator", creatorSchema);
export const MediaAsset = models.MediaAsset || model("MediaAsset", mediaAssetSchema);
export const Product = models.Product || model("Product", productSchema);
export const TelegramUser = models.TelegramUser || model("TelegramUser", telegramUserSchema);
export const Cart = models.Cart || model("Cart", cartSchema);
export const Order = models.Order || model("Order", orderSchema);
export const PaymentAttempt = models.PaymentAttempt || model("PaymentAttempt", paymentAttemptSchema);
export const Entitlement = models.Entitlement || model("Entitlement", entitlementSchema);
export const Delivery = models.Delivery || model("Delivery", deliverySchema);
export const WebhookEvent = models.WebhookEvent || model("WebhookEvent", webhookEventSchema);
export const AuditEvent = models.AuditEvent || model("AuditEvent", auditEventSchema);

export type OrderDocument = InferSchemaType<typeof orderSchema>;
