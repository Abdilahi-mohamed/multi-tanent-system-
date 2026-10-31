import mongoose from "mongoose";

const { Schema, model } = mongoose;

const tenantSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    ownerName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, default: "" },
    category: { type: String, default: "Retail" },
    description: { type: String, default: "" },
    subscriptionFee: { type: Number, min: 0 },
    billingCurrency: { type: String, match: /^[A-Z]{3}$/ },
    billingFrequency: { type: String, enum: ["monthly", "yearly"] },
    status: {
      type: String,
      enum: ["pending", "active", "suspended", "rejected"],
      default: "pending",
      index: true
    },
    plan: { type: String, default: "Not configured" },
    demoRecord: { type: Boolean, default: false }
  },
  { timestamps: true }
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, sparse: true, lowercase: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["super_admin", "business_owner"], required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", default: null, index: true },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

const variantSchema = new Schema(
  {
    sku: { type: String, trim: true, default: "" },
    size: { type: String, trim: true, default: "" },
    color: { type: String, trim: true, default: "" },
    stock: { type: Number, min: 0, required: true }
  },
  { _id: true }
);

const productSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    category: { type: String, default: "General" },
    price: { type: Number, required: true, min: 0 },
    imageUrl: { type: String, default: "" },
    status: { type: String, enum: ["active", "archived"], default: "active", index: true },
    variants: { type: [variantSchema], default: [] }
  },
  { timestamps: true }
);
productSchema.index({ tenantId: 1, createdAt: -1 });

const orderSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    orderNumber: { type: String, required: true, unique: true },
    idempotencyKey: { type: String, required: true },
    customer: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      address: { type: String, required: true },
      instructions: { type: String, default: "" }
    },
    item: {
      productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
      variantId: { type: Schema.Types.ObjectId, required: true },
      name: { type: String, required: true },
      variant: { type: String, default: "" },
      quantity: { type: Number, required: true, min: 1 },
      unitPrice: { type: Number, required: true, min: 0 },
      imageUrl: { type: String, default: "" }
    },
    subtotal: { type: Number, required: true, min: 0 },
    deliveryFee: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
      index: true
    },
    fulfillmentStatus: {
      type: String,
      enum: ["new", "processing", "ready", "shipped", "delivered", "cancelled"],
      default: "new",
      index: true
    },
    inventoryRestoredAt: { type: Date, default: null }
  },
  { timestamps: true }
);
orderSchema.index({ tenantId: 1, idempotencyKey: 1 }, { unique: true });
orderSchema.index({ tenantId: 1, createdAt: -1 });

const messageSchema = new Schema(
  {
    sender: { type: String, enum: ["customer", "merchant"], required: true },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: true }
);

const conversationSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true, unique: true },
    customerName: { type: String, required: true },
    customerPhone: { type: String, required: true },
    messages: { type: [messageSchema], default: [] }
  },
  { timestamps: true }
);

const supportConversationSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    subject: { type: String, required: true, trim: true, maxlength: 120 },
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved"],
      default: "open",
      index: true
    },
    lastMessage: { type: String, required: true, maxlength: 2000 },
    lastMessageAt: { type: Date, required: true, default: Date.now },
    unreadByAdmin: { type: Boolean, default: true },
    unreadByBusiness: { type: Boolean, default: false }
  },
  { timestamps: true }
);
supportConversationSchema.index({ tenantId: 1, updatedAt: -1 });
supportConversationSchema.index({ tenantId: 1, createdBy: 1, updatedAt: -1 });

const supportMessageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "SupportConversation", required: true, index: true },
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    senderRole: { type: String, enum: ["super_admin", "business_owner"], required: true },
    senderName: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    readAt: { type: Date, default: null }
  },
  { timestamps: true }
);
supportMessageSchema.index({ conversationId: 1, createdAt: 1 });

const auditSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actorRole: { type: String, required: true },
    action: { type: String, required: true },
    targetType: { type: String, required: true },
    targetId: { type: String, required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", default: null },
    details: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);
auditSchema.index({ createdAt: -1 });

const tenantPaymentProviderSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    provider: {
      type: String,
      enum: ["zaad", "evc_plus", "edahab", "sahal", "sifalo_pay", "card", "bank_transfer"],
      required: true
    },
    apiKeyCiphertext: { type: String, required: true, select: false },
    apiKeyIv: { type: String, required: true, select: false },
    apiKeyAuthTag: { type: String, required: true, select: false },
    apiKeyHint: { type: String, required: true },
    webhookCiphertext: { type: String, default: "", select: false },
    webhookIv: { type: String, default: "", select: false },
    webhookAuthTag: { type: String, default: "", select: false },
    webhookHint: { type: String, default: "" },
    commissionRate: { type: Number, min: 0, max: 100, required: true, default: 2.5 },
    enabled: { type: Boolean, default: false },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);
tenantPaymentProviderSchema.index({ tenantId: 1, provider: 1 }, { unique: true });

export const Tenant = model("Tenant", tenantSchema);
export const User = model("User", userSchema);
export const Product = model("Product", productSchema);
export const Order = model("Order", orderSchema);
export const Conversation = model("Conversation", conversationSchema);
export const SupportConversation = model("SupportConversation", supportConversationSchema);
export const SupportMessage = model("SupportMessage", supportMessageSchema);
export const AuditLog = model("AuditLog", auditSchema);
export const TenantPaymentProvider = model("TenantPaymentProvider", tenantPaymentProviderSchema);
