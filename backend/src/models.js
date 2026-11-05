import mongoose from "mongoose";

const { Schema, model } = mongoose;

const variantAttributeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 },
    value: { type: String, required: true, trim: true, maxlength: 80 }
  },
  { _id: false }
);

const tenantSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    previousSlugs: { type: [String], default: [] },
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

const customerAccountSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, select: false, default: "" },
    googleSub: { type: String, unique: true, sparse: true, select: false },
    passwordResetTokenHash: { type: String, select: false, default: "" },
    passwordResetExpiresAt: { type: Date, select: false, default: null }
  },
  { timestamps: true }
);

const variantSchema = new Schema(
  {
    sku: { type: String, trim: true, default: "" },
    size: { type: String, trim: true, default: "" },
    color: { type: String, trim: true, default: "" },
    attributes: { type: [variantAttributeSchema], default: [] },
    stock: { type: Number, min: 0, required: true },
    price: { type: Number, min: 0, default: null },
    imageUrl: { type: String, default: "" }
  },
  { _id: true }
);

const productSectionSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, default: "", maxlength: 500 },
    imageUrl: { type: String, default: "" },
    displayOrder: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);
productSectionSchema.index({ tenantId: 1, name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });
productSectionSchema.index({ tenantId: 1, displayOrder: 1, createdAt: 1 });

const productSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    sectionId: { type: Schema.Types.ObjectId, ref: "ProductSection", default: null, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    category: { type: String, default: "General" },
    price: { type: Number, required: true, min: 0 },
    promotionalPrice: { type: Number, min: 0, default: null },
    imageUrl: { type: String, default: "" },
    images: { type: [String], default: [] },
    status: { type: String, enum: ["active", "archived"], default: "active", index: true },
    isPublished: { type: Boolean, default: true, index: true },
    variants: { type: [variantSchema], default: [] }
  },
  { timestamps: true }
);
productSchema.index({ tenantId: 1, createdAt: -1 });
productSchema.index({ tenantId: 1, sectionId: 1, status: 1, isPublished: 1 });

const orderItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    variant: { type: String, default: "" },
    variantAttributes: { type: [variantAttributeSchema], default: [] },
    sku: { type: String, default: "" },
    size: { type: String, default: "" },
    color: { type: String, default: "" },
    sectionName: { type: String, default: "" },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, min: 0 },
    imageUrl: { type: String, default: "" }
  },
  { _id: false }
);

const orderSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "CustomerAccount", default: null, index: true, select: false },
    orderNumber: { type: String, required: true, unique: true },
    idempotencyKey: { type: String, required: true },
    customer: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      email: { type: String, default: "" },
      address: { type: String, required: true },
      location: { type: String, default: "" },
      instructions: { type: String, default: "" }
    },
    item: {
      productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
      variantId: { type: Schema.Types.ObjectId, required: true },
      name: { type: String, required: true },
      variant: { type: String, default: "" },
      variantAttributes: { type: [variantAttributeSchema], default: [] },
      sku: { type: String, default: "" },
      size: { type: String, default: "" },
      color: { type: String, default: "" },
      sectionName: { type: String, default: "" },
      quantity: { type: Number, required: true, min: 1 },
      unitPrice: { type: Number, required: true, min: 0 },
      lineTotal: { type: Number, min: 0 },
      imageUrl: { type: String, default: "" }
    },
    items: { type: [orderItemSchema], default: [] },
    subtotal: { type: Number, required: true, min: 0 },
    deliveryFee: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    paymentMethod: { type: String, enum: ["pay_on_delivery", "mobile_money", "bank_transfer"], default: "pay_on_delivery" },
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
    sender: { type: String, enum: ["customer", "merchant", "platform_admin"], required: true },
    senderName: { type: String, trim: true, default: "" },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    readAt: { type: Date, default: null },
    readByCustomerAt: { type: Date, default: null },
    readByMerchantAt: { type: Date, default: null },
    readByAdminAt: { type: Date, default: null },
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
    status: { type: String, enum: ["open", "in_progress", "resolved"], default: "open", index: true },
    unreadByMerchant: { type: Boolean, default: true },
    unreadByAdmin: { type: Boolean, default: true },
    unreadByCustomer: { type: Boolean, default: false },
    messages: { type: [messageSchema], default: [] }
  },
  { timestamps: true }
);
conversationSchema.index({ tenantId: 1, unreadByMerchant: 1, updatedAt: -1 });
conversationSchema.index({ unreadByAdmin: 1, updatedAt: -1 });

const supportConversationSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    customerName: { type: String, trim: true, default: "" },
    customerEmail: { type: String, lowercase: true, trim: true, default: "" },
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
    unreadByBusiness: { type: Boolean, default: false },
    unreadByCustomer: { type: Boolean, default: false }
  },
  { timestamps: true }
);
supportConversationSchema.index({ tenantId: 1, updatedAt: -1 });
supportConversationSchema.index({ tenantId: 1, createdBy: 1, updatedAt: -1 });

const supportMessageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "SupportConversation", required: true, index: true },
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    senderId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    senderRole: { type: String, enum: ["super_admin", "business_owner", "store_customer"], required: true },
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
export const CustomerAccount = model("CustomerAccount", customerAccountSchema);
export const ProductSection = model("ProductSection", productSectionSchema);
export const Product = model("Product", productSchema);
export const Order = model("Order", orderSchema);
export const Conversation = model("Conversation", conversationSchema);
export const SupportConversation = model("SupportConversation", supportConversationSchema);
export const SupportMessage = model("SupportMessage", supportMessageSchema);
export const AuditLog = model("AuditLog", auditSchema);
export const TenantPaymentProvider = model("TenantPaymentProvider", tenantPaymentProviderSchema);
