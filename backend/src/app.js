import express from "express";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { OAuth2Client } from "google-auth-library";
import { z } from "zod";
import mongoose from "mongoose";
import { authenticate, createToken, requireRole } from "./auth.js";
import {
  AuditLog, Conversation, CustomerAccount, Order, Product, ProductSection, SupportConversation,
  SupportMessage, Tenant, TenantPaymentProvider, User
} from "./models.js";
import { calculateSubtotal } from "./commerce.js";
import { tenantIdFromSession, withSupportConversationScope, withTenantScope } from "./tenant-scope.js";
import {
  encryptPaymentCredential,
  isPaymentCredentialConfigurationError,
  paymentCredentialHint
} from "./payment-credentials.js";

const app = express();
const api = express.Router();

function preventPaymentCredentialCaching(_req, res, next) {
  res.set("Cache-Control", "no-store");
  next();
}

api.use("/tenant/payment-gateways", preventPaymentCredentialCaching);
api.use("/admin/payment-management/companies", preventPaymentCredentialCaching);

app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:3000",
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
    credentials: true
  })
);
app.use(express.json({ limit: "1mb" }));
app.use("/api", api);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Try again later." }
});
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many registration attempts. Try again later." }
});
const customerAccessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many order verification attempts. Try again later." }
});
const customerMessageLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many messages were sent. Wait a moment and try again." }
});
const customerAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many account requests. Try again later." }
});
const customerResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many password reset requests. Try again later." }
});
const storeSupportRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many support requests were sent. Try again later." }
});
const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(254).optional(),
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9._-]+$/).optional(),
  password: z.string().min(1).max(128),
  rememberMe: z.boolean().optional().default(false)
}).refine((input) => input.identifier || input.username, {
  path: ["identifier"],
  message: "Enter your username or email address."
});
const bootstrapAdminSchema = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9._-]+$/).transform((username) => username.toLowerCase()),
  password: z.string().min(6).max(128),
  confirmPassword: z.string().min(6).max(128)
}).refine((input) => input.password === input.confirmPassword, {
  path: ["confirmPassword"],
  message: "Passwords do not match."
});
const userPasswordSchema = z.object({
  password: z.string().min(12).max(128),
  confirmPassword: z.string().min(12).max(128)
}).refine((input) => input.password === input.confirmPassword, {
  path: ["confirmPassword"],
  message: "Passwords do not match."
});
const customerPasswordSchema = z.string().min(12).max(72).refine(
  (password) => Buffer.byteLength(password, "utf8") <= 72,
  "Passwords must not exceed 72 UTF-8 bytes."
);
const customerRegistrationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: customerPasswordSchema,
  rememberMe: z.boolean().optional().default(true)
});
const customerLoginSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(72).refine((password) => Buffer.byteLength(password, "utf8") <= 72),
  rememberMe: z.boolean().optional().default(true)
});
const customerForgotPasswordSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  returnTo: z.string().max(1000).optional()
});
const customerResetPasswordSchema = z.object({
  token: z.string().min(32).max(256),
  password: customerPasswordSchema,
  confirmPassword: customerPasswordSchema
}).refine((input) => input.password === input.confirmPassword, {
  path: ["confirmPassword"],
  message: "Passwords do not match."
});
const customerStatusSchema = z.object({
  accountStatus: z.enum(["active", "suspended"])
});
const companySchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(2).max(60),
  ownerName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  phone: z.string().trim().max(40).optional().default(""),
  category: z.string().trim().min(2).max(80).optional().default("Retail"),
  description: z.string().trim().max(1000).optional().default(""),
  subscriptionFee: z.number().finite().min(0).max(1_000_000_000_000),
  billingCurrency: z.string().trim().regex(/^[A-Za-z]{3}$/).transform((currency) => currency.toUpperCase()),
  billingFrequency: z.enum(["monthly", "yearly"])
});
const companyAccountSchema = companySchema.extend({
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9._-]+$/).transform((username) => username.toLowerCase()),
  password: z.string().min(12).max(128),
  confirmPassword: z.string().min(12).max(128),
  status: z.enum(["active", "pending", "suspended"]).default("active")
}).refine((input) => input.password === input.confirmPassword, {
  path: ["confirmPassword"],
  message: "Passwords do not match."
});
const adminUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9._-]+$/).transform((username) => username.toLowerCase()),
  password: z.string().min(12).max(128),
  confirmPassword: z.string().min(12).max(128),
  role: z.enum(["super_admin", "business_owner"]),
  tenantId: z.string().regex(/^[a-f\d]{24}$/i).optional()
}).refine((input) => input.password === input.confirmPassword, {
  path: ["confirmPassword"],
  message: "Passwords do not match."
});
const userUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9._-]+$/).transform((username) => username.toLowerCase()).optional(),
  role: z.enum(["super_admin", "business_owner"]).optional(),
  tenantId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
  business: companySchema.partial().optional()
}).refine((input) => Object.keys(input).length > 0, {
  message: "Provide at least one account or business field to update."
});
const supportMessageSchema = z.object({
  body: z.string().trim().min(1).max(2000)
});
const supportConversationSchema = z.object({
  subject: z.string().trim().min(2).max(120),
  body: z.string().trim().min(1).max(2000)
});
const storeSupportRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  body: z.string().trim().min(1).max(2000)
});
const supportStatusSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved"])
});
const productSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(3000).optional().default(""),
  category: z.string().trim().max(80).optional().default("General"),
  sectionId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional().default(null),
  price: z.number().finite().nonnegative(),
  promotionalPrice: z.number().finite().nonnegative().nullable().optional().default(null),
  imageUrl: z.string().trim().url().max(1000).optional().or(z.literal("")).default(""),
  images: z.array(z.string().trim().url().max(1000)).max(12).optional().default([]),
  isPublished: z.boolean().optional().default(true),
  variants: z.array(
    z.object({
      _id: z.string().regex(/^[a-f\d]{24}$/i).optional(),
      sku: z.string().trim().max(80).optional().default(""),
      size: z.string().trim().max(40).optional().default(""),
      color: z.string().trim().max(40).optional().default(""),
      attributes: z.array(z.object({
        name: z.string().trim().min(1).max(40),
        value: z.string().trim().min(1).max(80)
      })).max(20).optional().default([]).refine(
        (attributes) => new Set(attributes.map(({ name }) => name.toLowerCase())).size === attributes.length,
        "Variant attribute names must be unique."
      ),
      stock: z.number().int().nonnegative(),
      price: z.number().finite().nonnegative().nullable().optional().default(null),
      imageUrl: z.string().trim().url().max(1000).optional().or(z.literal("")).default("")
    })
  ).min(1).max(100)
});
const productSectionSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional().default(""),
  imageUrl: z.string().trim().url().max(1000).optional().or(z.literal("")).default(""),
  displayOrder: z.number().int().min(0).max(10000).optional().default(0),
  active: z.boolean().optional().default(true)
});
const productUpdateSchema = productSchema.partial().refine((input) => Object.keys(input).length > 0, {
  message: "Provide at least one product field to update."
});
const orderLineSchema = z.object({
  productId: z.string().regex(/^[a-f\d]{24}$/i),
  variantId: z.string().regex(/^[a-f\d]{24}$/i),
  quantity: z.number().int().min(1).max(50)
});
const orderSchema = z.object({
  items: z.array(orderLineSchema).min(1).max(25).optional(),
  productId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  variantId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  quantity: z.number().int().min(1).max(50).optional(),
  paymentMethod: z.enum(["pay_on_delivery", "mobile_money", "bank_transfer"]).optional().default("pay_on_delivery"),
  customer: z.object({
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(5).max(40),
    email: z.string().trim().email().max(254).optional().or(z.literal("")).default(""),
    address: z.string().trim().min(5).max(500),
    location: z.string().trim().max(250).optional().default(""),
    instructions: z.string().trim().max(500).optional().default("")
  })
}).refine((input) => input.items?.length || (input.productId && input.variantId && input.quantity), {
  message: "Add at least one valid product option to your order."
}).refine((input) => {
  const lines = input.items || [{ productId: input.productId, variantId: input.variantId }];
  const uniqueLines = new Set(lines.map((line) => `${line.productId}:${line.variantId}`));
  return uniqueLines.size === lines.length;
}, { message: "Each product option can appear only once in the order; update its quantity instead." });
const orderChatAccessSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(5).max(40)
});
const orderChatMessageSchema = z.object({
  body: z.string().trim().min(1).max(2000)
});
const orderChatStatusSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved"])
});
const fulfillmentSchema = z.object({
  fulfillmentStatus: z.enum(["processing", "ready", "shipped", "delivered", "cancelled"])
});
const orderDeliveryUpdateSchema = z.object({
  phone: z.string().trim().min(5).max(40).optional(),
  email: z.string().trim().email().max(254).optional().or(z.literal("")),
  address: z.string().trim().min(5).max(500).optional(),
  location: z.string().trim().max(250).optional(),
  instructions: z.string().trim().max(500).optional(),
  deliveryFee: z.number().finite().min(0).max(1_000_000_000_000).optional()
}).refine((input) => Object.keys(input).length > 0, {
  message: "Provide at least one delivery field to update."
});
const paymentActivityQuerySchema = z.object({
  status: z.enum(["all", "pending", "paid", "failed", "refunded"]).optional(),
  search: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
});
const paymentSetupQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
});
const tenantPaymentProviderSchema = z.object({
  apiKey: z.string().trim().min(1).max(4096).optional(),
  merchantToken: z.string().trim().min(1).max(4096).optional(),
  webhookSecret: z.string().trim().max(4096).optional(),
  commissionRate: z.coerce.number().finite().min(0).max(100),
  enabled: z.boolean()
});
const tenantPaymentProviders = ["zaad", "evc_plus", "edahab", "sahal", "sifalo_pay", "card", "bank_transfer"];
const defaultLoginPageSettings = {
  logo: "",
  backgroundColor: "#111827",
  backgroundImage: "",
  primaryColor: "#2563EB",
  secondaryColor: "#1F2937",
  heading: "Welcome back",
  welcomeMessage: "Sign in to continue to our store.",
  companyName: "",
  layout: "centered",
  formStyle: "card",
  googleButtonStyle: "light"
};
const loginPageImageSchema = z.string().max(350000).refine((value) => {
  if (!value) return true;
  const match = value.match(/^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  return Boolean(match && Buffer.from(match[1], "base64").length <= 256 * 1024);
}, "Use a PNG, JPEG, or WebP image smaller than 256 KB.");
const tenantLoginPageSettingsSchema = z.object({
  logo: loginPageImageSchema,
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  backgroundImage: loginPageImageSchema,
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  heading: z.string().trim().min(1).max(100),
  welcomeMessage: z.string().trim().max(240),
  companyName: z.string().trim().max(100),
  layout: z.enum(["centered", "split"]),
  formStyle: z.enum(["card", "minimal"]),
  googleButtonStyle: z.enum(["light", "dark"])
}).strict();

async function getPaymentMetrics(filter = {}) {
  const grouped = await Order.aggregate([
    { $match: filter },
    { $group: { _id: "$paymentStatus", count: { $sum: 1 }, amount: { $sum: "$total" } } }
  ]);
  const metrics = { total: 0, pending: 0, paid: 0, failed: 0, refunded: 0, paidVolume: 0 };
  for (const row of grouped) {
    metrics.total += row.count;
    if (Object.hasOwn(metrics, row._id)) metrics[row._id] = row.count;
    if (row._id === "paid") metrics.paidVolume = row.amount;
  }
  return metrics;
}

function parseOrRespond(schema, value, res) {
  const result = schema.safeParse(value);
  if (!result.success) {
    res.status(400).json({ error: "Please check the submitted information.", details: result.error.flatten() });
    return null;
  }
  return result.data;
}

function logError(message, error) {
  console.error(message, { name: error?.name, code: error?.code });
}

function tenantIdFor(user) {
  return tenantIdFromSession(user);
}

async function findActiveTenantBySlug(slug) {
  const normalizedSlug = slug.toLowerCase();
  const currentTenant = await Tenant.findOne({ slug: normalizedSlug, status: "active" }).select("_id name slug description category loginPage");
  if (currentTenant) return currentTenant;
  return Tenant.findOne({ previousSlugs: normalizedSlug, status: "active" }).select("_id name slug description category loginPage");
}

async function updateTenantDetails(tenant, updates) {
  if (updates.slug && updates.slug !== tenant.slug) {
    const conflictingTenant = await Tenant.exists({
      _id: { $ne: tenant._id },
      $or: [{ slug: updates.slug }, { previousSlugs: updates.slug }]
    });
    if (conflictingTenant) return false;
    tenant.previousSlugs = [...new Set([...(tenant.previousSlugs || []), tenant.slug])];
  }
  Object.assign(tenant, updates);
  await tenant.save();
  return true;
}

function normalizeCustomerName(value) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function normalizePhone(value) {
  return value.replace(/\D/g, "");
}

function roundCurrency(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

const customerSessionCookie = "vendora_customer";
const googleStateCookie = "vendora_google_state";
const customerSessionMaxAge = 30 * 24 * 60 * 60 * 1000;

function customerCookieOptions(path, maxAge) {
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path
  };
  if (maxAge !== undefined) options.maxAge = maxAge;
  return options;
}

function cookieValue(req, name) {
  const cookie = (req.get("cookie") || "").split(";").map((part) => part.trim());
  const entry = cookie.find((part) => part.startsWith(`${name}=`));
  return entry?.slice(name.length + 1) || "";
}

function setCustomerSession(res, customer, rememberMe = true) {
  const token = jwt.sign({
    sub: customer._id.toString(),
    purpose: "customer_session"
  }, process.env.JWT_SECRET, { expiresIn: rememberMe ? "30d" : "8h" });
  res.cookie(customerSessionCookie, token, customerCookieOptions("/api/customer", rememberMe ? customerSessionMaxAge : undefined));
}

function clearCustomerSession(res) {
  res.clearCookie(customerSessionCookie, customerCookieOptions("/api/customer"));
}

async function customerFromRequest(req) {
  const token = cookieValue(req, customerSessionCookie);
  if (!token) return null;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.purpose !== "customer_session" || !mongoose.isValidObjectId(payload.sub)) return null;
    const customer = await CustomerAccount.findById(payload.sub).lean();
    return customer?.accountStatus === "suspended" ? null : customer;
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") return null;
    throw error;
  }
}

async function authenticateCustomer(req, res, next) {
  try {
    const customer = await customerFromRequest(req);
    if (!customer) return res.status(401).json({ error: "Sign in with your customer account to continue." });
    req.customer = customer;
    return next();
  } catch (error) {
    return next(error);
  }
}

function hashResetToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function customerReturnPath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  return value;
}

function customerReturnUrl(path, key, value) {
  const url = new URL(customerReturnPath(path), process.env.CLIENT_ORIGIN || "http://localhost:3000");
  url.searchParams.set(key, value);
  return url.toString();
}

function googleOAuthSettings() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI
  };
}

function customerMailer() {
  const { SMTP_HOST: host, SMTP_USER: user, SMTP_PASSWORD: pass } = process.env;
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP_PORT must be a valid port number.");
  }
  return nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true",
    auth: { user, pass }
  });
}

async function findOrCreateGoogleCustomer(claims) {
  const email = claims.email.toLowerCase();
  const [byEmail, byGoogleId] = await Promise.all([
    CustomerAccount.findOne({ email }).select("+googleSub"),
    CustomerAccount.findOne({ googleSub: claims.sub }).select("+googleSub")
  ]);
  if (byGoogleId && byGoogleId.email !== email) {
    throw new Error("This Google account is already linked to a different customer email.");
  }
  if (byEmail && byGoogleId && !byEmail._id.equals(byGoogleId._id)) {
    throw new Error("This email is already linked to a different Google account.");
  }
  const customer = byEmail || byGoogleId;
  if (customer) {
    if (customer.googleSub && customer.googleSub !== claims.sub) {
      throw new Error("This email is already linked to a different Google account.");
    }
    if (!customer.googleSub) {
      customer.googleSub = claims.sub;
      await customer.save();
    }
    if (customer.name === "Google customer" && claims.name) {
      customer.name = claims.name.slice(0, 120);
      await customer.save();
    }
    return customer;
  }
  return CustomerAccount.create({
    name: claims.name?.trim().slice(0, 120) || "Google customer",
    email,
    googleSub: claims.sub
  });
}

function createOrderChatToken(conversation, customerId = null) {
  return jwt.sign({
    purpose: "order_chat",
    conversationId: conversation._id.toString(),
    orderId: conversation.orderId.toString(),
    tenantId: conversation.tenantId.toString(),
    ...(customerId ? { customerId: customerId.toString() } : {})
  }, process.env.JWT_SECRET, { expiresIn: "30d" });
}

function createStoreSupportToken(conversation) {
  return jwt.sign({
    purpose: "store_support",
    conversationId: conversation._id.toString(),
    tenantId: conversation.tenantId.toString()
  }, process.env.JWT_SECRET, { expiresIn: "30d" });
}

async function authenticateStoreSupportCustomer(req, res, next) {
  const authorization = req.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Start a support conversation to continue." });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.purpose !== "store_support"
      || !mongoose.isValidObjectId(payload.conversationId)
      || !mongoose.isValidObjectId(payload.tenantId)) {
      return res.status(401).json({ error: "Store support access is invalid. Start a new conversation." });
    }
    const [conversation, tenant] = await Promise.all([
      SupportConversation.findOne({
        _id: payload.conversationId,
        tenantId: payload.tenantId,
        createdBy: null
      }),
      Tenant.exists({ _id: payload.tenantId, status: "active" })
    ]);
    if (!conversation) return res.status(404).json({ error: "Store support conversation not found." });
    if (!tenant) return res.status(403).json({ error: "This store is currently unavailable." });
    req.storeSupportConversation = conversation;
    return next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Store support access expired. Start a new conversation." });
    }
    return next(error);
  }
}

async function authenticateOrderCustomer(req, res, next) {
  const authorization = req.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Verify your order details to access this conversation." });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.purpose !== "order_chat" || !mongoose.isValidObjectId(payload.conversationId) || !mongoose.isValidObjectId(payload.orderId) || !mongoose.isValidObjectId(payload.tenantId)) {
      return res.status(401).json({ error: "Order chat access is invalid. Verify your order again." });
    }
    if (payload.customerId) {
      const customer = await customerFromRequest(req);
      if (!customer || !customer._id.equals(payload.customerId)) {
        return res.status(401).json({ error: "Sign in to the customer account that placed this order." });
      }
    }
    const conversation = await Conversation.findOne({
      _id: payload.conversationId,
      orderId: payload.orderId,
      tenantId: payload.tenantId
    });
    if (!conversation) return res.status(404).json({ error: "Order conversation not found." });
    const order = await Order.findOne({ _id: payload.orderId, tenantId: payload.tenantId }).lean();
    if (!order) return res.status(404).json({ error: "Order conversation not found." });
    req.orderConversation = conversation;
    req.customerOrder = order;
    return next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Order chat access expired. Verify your order details again." });
    }
    return next(error);
  }
}

async function writeAudit({ actor, action, targetType, targetId, tenantId = null, details = {} }) {
  await AuditLog.create({
    actorId: actor._id,
    actorRole: actor.role,
    action,
    targetType,
    targetId: String(targetId),
    tenantId,
    details
  });
}

async function saveTenantPaymentProvider({ tenantId, provider, input, actor }) {
  let existing = await TenantPaymentProvider.findOne({ tenantId, provider })
    .select("+apiKeyHint +merchantTokenHint +webhookHint +apiKeyHintSafe +merchantTokenHintSafe +webhookHintSafe");
  if (!existing && !input.apiKey) {
    return { error: "Enter the provider API key to add this payment method.", status: 400 };
  }

  const credentials = [
    { inputName: "apiKey", prefix: "apiKey", field: "secret_api_key" },
    { inputName: "merchantToken", prefix: "merchantToken", field: "secret_merchant_token" },
    { inputName: "webhookSecret", prefix: "webhook", field: "private_webhook_secret" }
  ];
  const encryptedCredentials = new Map();
  try {
    for (const credential of credentials) {
      const value = input[credential.inputName];
      if (value) {
        encryptedCredentials.set(credential.inputName, encryptPaymentCredential(value, {
          tenantId,
          provider,
          field: credential.field
        }));
      }
    }
  } catch (error) {
    if (!isPaymentCredentialConfigurationError(error)) throw error;
    return {
      error: "Payment credential encryption is not configured correctly on the API server.",
      status: 503
    };
  }

  const values = {
    tenantId,
    provider,
    commissionRate: input.commissionRate,
    enabled: input.enabled,
    updatedBy: actor._id
  };
  for (const credential of credentials) {
    const encrypted = encryptedCredentials.get(credential.inputName);
    if (encrypted) {
      values[`${credential.prefix}Ciphertext`] = encrypted.ciphertext;
      values[`${credential.prefix}Iv`] = encrypted.iv;
      values[`${credential.prefix}AuthTag`] = encrypted.authTag;
      values[`${credential.prefix}KeyId`] = encrypted.keyId;
      values[`${credential.prefix}Version`] = encrypted.version;
      const hint = paymentCredentialHint(input[credential.inputName]);
      values[`${credential.prefix}Hint`] = hint;
      values[`${credential.prefix}HintSafe`] = Boolean(hint);
      values[`${credential.prefix}Configured`] = true;
    } else if (existing && (existing[`${credential.prefix}Configured`] || existing[`${credential.prefix}Hint`])) {
      values[`${credential.prefix}Configured`] = true;
      if (!existing[`${credential.prefix}HintSafe`]) {
        values[`${credential.prefix}Hint`] = "";
        values[`${credential.prefix}HintSafe`] = false;
      }
    }
  }
  if (existing) {
    Object.assign(existing, values);
    await existing.save();
  } else {
    existing = await TenantPaymentProvider.create(values);
  }
  await writeAudit({
    actor,
    action: "tenant_payment_provider.saved",
    targetType: "payment_provider",
    targetId: existing._id,
    tenantId,
    details: { provider: existing.provider, enabled: existing.enabled }
  });
  return { item: paymentProviderSummary(existing) };
}

export function paymentProviderSummary(item) {
  const apiKeyConfigured = Boolean(item.apiKeyConfigured || item.apiKeyHint);
  const merchantTokenConfigured = Boolean(item.merchantTokenConfigured || item.merchantTokenHint);
  const webhookSecretConfigured = Boolean(item.webhookConfigured || item.webhookHint);
  return {
    _id: item._id,
    provider: item.provider,
    apiKeyHint: item.apiKeyHintSafe ? item.apiKeyHint : "",
    merchantTokenHint: item.merchantTokenHintSafe ? item.merchantTokenHint : "",
    webhookHint: item.webhookHintSafe ? item.webhookHint : "",
    apiKeyStatus: apiKeyConfigured ? "configured" : "not_configured",
    merchantTokenStatus: merchantTokenConfigured ? "configured" : "not_configured",
    webhookSecretStatus: webhookSecretConfigured ? "configured" : "not_configured",
    apiKeyConfigured,
    merchantTokenConfigured,
    webhookConfigured: webhookSecretConfigured,
    commissionRate: item.commissionRate,
    enabled: item.enabled,
    connectionStatus: apiKeyConfigured ? "requires_attention" : "not_configured",
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

async function restoreStockReservation({ productId, tenantId, variantId, quantity }) {
  const result = await Product.updateOne(
    { _id: productId, tenantId, "variants._id": variantId },
    { $inc: { "variants.$.stock": quantity } }
  );
  if (result.matchedCount !== 1) {
    throw new Error("The reserved product variant could not be found during inventory restoration.");
  }
}

async function restoreReservations(reservations) {
  const restored = [];
  try {
    for (const reservation of reservations) {
      await restoreStockReservation(reservation);
      restored.push(reservation);
    }
  } catch (error) {
    for (const reservation of restored.reverse()) {
      const rollback = await Product.updateOne(
        {
          _id: reservation.productId,
          tenantId: reservation.tenantId,
          variants: { $elemMatch: { _id: reservation.variantId, stock: { $gte: reservation.quantity } } }
        },
        { $inc: { "variants.$.stock": -reservation.quantity } }
      );
      if (rollback.matchedCount !== 1) {
        throw new Error("Partial stock restoration could not be rolled back safely.", { cause: error });
      }
    }
    throw error;
  }
}

async function appendSupportMessage(conversation, user, body) {
  const message = await SupportMessage.create({
    conversationId: conversation._id,
    tenantId: conversation.tenantId,
    senderId: user._id || null,
    senderRole: user.role,
    senderName: user.name,
    body
  });
  const set = {
    lastMessage: message.body,
    lastMessageAt: message.createdAt,
    unreadByAdmin: user.role === "business_owner" || user.role === "store_customer",
    unreadByBusiness: user.role === "super_admin" && Boolean(conversation.createdBy),
    unreadByCustomer: user.role === "super_admin" && !conversation.createdBy
  };
  if (conversation.status === "resolved") {
    set.status = user.role === "super_admin" ? "in_progress" : "open";
  }
  try {
    const updated = await SupportConversation.findOneAndUpdate(
      { _id: conversation._id, tenantId: conversation.tenantId },
      { $set: set },
      { new: true }
    );
    if (updated) return { conversation: updated, message };
    await SupportMessage.deleteOne({ _id: message._id });
    return null;
  } catch (error) {
    try {
      await SupportMessage.deleteOne({ _id: message._id });
    } catch (rollbackError) {
      logError("Support message rollback failed.", rollbackError);
      throw new Error("The support reply could not be saved and requires administrator attention.", { cause: error });
    }
    throw error;
  }
}

api.get("/health", (_req, res) => {
  const dbState = mongoose.connection.readyState;
  const database = dbState === 1 ? "healthy" : dbState === 2 ? "degraded" : "unavailable";
  res.status(dbState === 1 ? 200 : 503).json({
    status: dbState === 1 ? "healthy" : "unavailable",
    checks: { api: "healthy", database }
  });
});

api.get("/auth/bootstrap-status", (_req, res) => {
  res.json({ open: true });
});

api.post("/auth/register", registrationLimiter, async (req, res, next) => {
  try {
    const input = parseOrRespond(bootstrapAdminSchema, req.body, res);
    if (!input) return;

    const user = await User.create({
      name: input.username,
      username: input.username,
      email: `${input.username}@users.invalid`,
      passwordHash: await bcrypt.hash(input.password, 12),
      role: "super_admin",
      tenantId: null,
      active: true
    });
    res.status(201).json({
      message: "Super Admin account created. Sign in to manage your platform.",
      user: { username: user.username }
    });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "That username is already in use." });
    return next(error);
  }
});

api.post("/auth/login", authLimiter, async (req, res, next) => {
  try {
    const input = parseOrRespond(loginSchema, req.body, res);
    if (!input) return;
    const identifier = (input.identifier || input.username).toLowerCase();
    let user = identifier.includes("@")
      ? await User.findOne({ email: identifier }).select("+passwordHash")
      : await User.findOne({ username: identifier }).select("+passwordHash");
    if (!user && !identifier.includes("@")) {
      const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      user = await User.findOne({
        username: { $exists: false },
        email: new RegExp(`^${escaped}@`, "i")
      }).select("+passwordHash");
    }
    if (!user || !user.active || !(await bcrypt.compare(input.password, user.passwordHash))) {
      return res.status(401).json({ error: "Username/email or password is incorrect." });
    }
    if (user.role === "business_owner") {
      const tenant = await Tenant.findById(user.tenantId).select("status");
      if (!tenant || tenant.status !== "active") {
        return res.status(403).json({ error: "This business account is not active." });
      }
    }
    return res.json({
      token: createToken(user, input.rememberMe),
      user: { id: user._id, name: user.name, username: user.username || user.email.split("@")[0], role: user.role, tenantId: user.tenantId }
    });
  } catch (error) {
    return next(error);
  }
});

api.get("/auth/me", authenticate, async (req, res) => {
  const tenant = req.user.tenantId ? await Tenant.findById(req.user.tenantId).select("name slug status plan category ownerName") : null;
  res.json({
    user: {
      id: req.user._id,
      name: req.user.name,
      username: req.user.username || req.user.email.split("@")[0],
      role: req.user.role,
      tenantId: req.user.tenantId
    },
    tenant
  });
});

api.post("/customer/auth/register", registrationLimiter, async (req, res, next) => {
  try {
    const input = parseOrRespond(customerRegistrationSchema, req.body, res);
    if (!input) return;
    const customer = await CustomerAccount.create({
      name: input.name,
      email: input.email,
      passwordHash: await bcrypt.hash(input.password, 12),
      lastLoginAt: new Date()
    });
    setCustomerSession(res, customer, input.rememberMe);
    return res.status(201).json({
      customer: { id: customer._id, name: customer.name, email: customer.email }
    });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "An account with this email already exists. Sign in instead." });
    return next(error);
  }
});

api.post("/customer/auth/login", customerAuthLimiter, async (req, res, next) => {
  try {
    const input = parseOrRespond(customerLoginSchema, req.body, res);
    if (!input) return;
    const customer = await CustomerAccount.findOne({ email: input.email }).select("+passwordHash");
    if (!customer?.passwordHash || !(await bcrypt.compare(input.password, customer.passwordHash))) {
      return res.status(401).json({ error: "Email or password is incorrect." });
    }
    if (customer.accountStatus === "suspended") return res.status(403).json({ error: "This customer account is unavailable." });
    customer.lastLoginAt = new Date();
    await customer.save();
    setCustomerSession(res, customer, input.rememberMe);
    return res.json({
      customer: { id: customer._id, name: customer.name, email: customer.email }
    });
  } catch (error) {
    return next(error);
  }
});

api.post("/customer/auth/logout", (_req, res) => {
  clearCustomerSession(res);
  res.json({ message: "Signed out." });
});

api.get("/customer/auth/me", authenticateCustomer, (req, res) => {
  res.json({
    customer: { id: req.customer._id, name: req.customer.name, email: req.customer.email }
  });
});

api.post("/customer/auth/forgot-password", customerResetLimiter, async (req, res, next) => {
  try {
    const input = parseOrRespond(customerForgotPasswordSchema, req.body, res);
    if (!input) return;
    const mailer = customerMailer();
    if (!mailer) {
      return res.status(503).json({ error: "Password reset email is not configured. Contact the store administrator." });
    }
    const customer = await CustomerAccount.findOne({ email: input.email });
    if (customer) {
      const token = randomBytes(32).toString("base64url");
      customer.passwordResetTokenHash = hashResetToken(token);
      customer.passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await customer.save();
      const resetUrl = new URL("/customer/reset-password", process.env.CLIENT_ORIGIN || "http://localhost:3000");
      resetUrl.searchParams.set("token", token);
      resetUrl.searchParams.set("returnTo", customerReturnPath(input.returnTo));
      try {
        await mailer.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: customer.email,
          subject: "Reset your Vendora customer password",
          text: `Use this link within one hour to reset your password:\n\n${resetUrl.toString()}\n\nIf you did not request this, you can ignore this message.`
        });
      } catch (error) {
        customer.passwordResetTokenHash = "";
        customer.passwordResetExpiresAt = null;
        await customer.save();
        return next(error);
      }
    }
    return res.json({ message: "If an account exists for that email, a password reset link has been sent." });
  } catch (error) {
    return next(error);
  }
});

api.post("/customer/auth/reset-password", customerResetLimiter, async (req, res, next) => {
  try {
    const input = parseOrRespond(customerResetPasswordSchema, req.body, res);
    if (!input) return;
    const customer = await CustomerAccount.findOne({
      passwordResetTokenHash: hashResetToken(input.token),
      passwordResetExpiresAt: { $gt: new Date() }
    }).select("+passwordHash +passwordResetTokenHash +passwordResetExpiresAt");
    if (!customer) return res.status(400).json({ error: "This password reset link is invalid or has expired." });
    customer.passwordHash = await bcrypt.hash(input.password, 12);
    customer.passwordResetTokenHash = "";
    customer.passwordResetExpiresAt = null;
    await customer.save();
    clearCustomerSession(res);
    return res.json({ message: "Your password was reset. Sign in with your new password." });
  } catch (error) {
    return next(error);
  }
});

api.get("/customer/auth/google", (req, res) => {
  const returnTo = customerReturnPath(req.query.returnTo);
  const { clientId, clientSecret, redirectUri } = googleOAuthSettings();
  if (!clientId || !clientSecret || !redirectUri) {
    return res.redirect(customerReturnUrl(returnTo, "customerAuthError", "google_not_configured"));
  }
  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const rememberMe = req.query.rememberMe !== "false";
  const stateToken = jwt.sign({
    purpose: "customer_google_state",
    state,
    nonce,
    returnTo,
    rememberMe
  }, process.env.JWT_SECRET, { expiresIn: "10m" });
  res.cookie(googleStateCookie, stateToken, customerCookieOptions("/api/customer/auth/google", 10 * 60 * 1000));
  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    prompt: "select_account"
  }).toString();
  return res.redirect(authorizationUrl.toString());
});

api.get("/customer/auth/google/callback", async (req, res, next) => {
  const stateToken = cookieValue(req, googleStateCookie);
  res.clearCookie(googleStateCookie, customerCookieOptions("/api/customer/auth/google"));
  let statePayload;
  try {
    statePayload = jwt.verify(stateToken, process.env.JWT_SECRET);
  } catch {
    return res.status(400).json({ error: "Google sign-in expired or could not be verified. Please try again." });
  }
  const suppliedState = typeof req.query.state === "string" ? req.query.state : "";
  if (statePayload.purpose !== "customer_google_state"
    || !suppliedState
    || Buffer.byteLength(suppliedState) !== Buffer.byteLength(statePayload.state)
    || !timingSafeEqual(Buffer.from(suppliedState), Buffer.from(statePayload.state))) {
    return res.status(400).json({ error: "Google sign-in state could not be verified. Please try again." });
  }
  const returnTo = customerReturnPath(statePayload.returnTo);
  const { clientId, clientSecret, redirectUri } = googleOAuthSettings();
  if (typeof req.query.code !== "string" || !clientId || !clientSecret || !redirectUri) {
    return res.redirect(customerReturnUrl(returnTo, "customerAuthError", "google_failed"));
  }
  try {
    const oauthClient = new OAuth2Client(clientId, clientSecret, redirectUri);
    const { tokens } = await oauthClient.getToken(req.query.code);
    if (typeof tokens.id_token !== "string") {
      return res.redirect(customerReturnUrl(returnTo, "customerAuthError", "google_failed"));
    }
    const ticket = await oauthClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: clientId
    });
    const claims = ticket.getPayload();
    if (!claims) return res.redirect(customerReturnUrl(returnTo, "customerAuthError", "google_failed"));
    const issuedAt = Number(claims.iat);
    const expiresAt = Number(claims.exp);
    if (claims.aud !== clientId
      || !["accounts.google.com", "https://accounts.google.com"].includes(claims.iss)
      || !(claims.email_verified === true || claims.email_verified === "true")
      || typeof claims.sub !== "string"
      || typeof claims.email !== "string"
      || claims.nonce !== statePayload.nonce
      || !Number.isFinite(issuedAt)
      || !Number.isFinite(expiresAt)
      || issuedAt > Date.now() / 1000 + 60
      || expiresAt <= Date.now() / 1000) {
      return res.redirect(customerReturnUrl(returnTo, "customerAuthError", "google_failed"));
    }
    let customer;
    try {
      customer = await findOrCreateGoogleCustomer(claims);
    } catch (error) {
      if (error.code === 11000 || error.message.includes("already linked")) {
        return res.redirect(customerReturnUrl(returnTo, "customerAuthError", "google_account_conflict"));
      }
      throw error;
    }
    if (customer.accountStatus === "suspended") {
      return res.redirect(customerReturnUrl(returnTo, "customerAuthError", "customer_unavailable"));
    }
    customer.lastLoginAt = new Date();
    await customer.save();
    setCustomerSession(res, customer, statePayload.rememberMe !== false);
    const destination = returnTo === "/" ? "/customer/orders" : returnTo;
    return res.redirect(new URL(destination, process.env.CLIENT_ORIGIN || "http://localhost:3000").toString());
  } catch (error) {
    return next(error);
  }
});

api.get("/customer/orders", authenticateCustomer, async (req, res, next) => {
  try {
    const orders = await Order.find({ customerId: req.customer._id })
      .sort({ createdAt: -1 })
      .populate("tenantId", "name slug")
      .lean();
    return res.json({ orders });
  } catch (error) {
    return next(error);
  }
});

api.get("/customer/orders/:orderId", authenticateCustomer, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.orderId)) return res.status(400).json({ error: "Invalid order ID." });
    const order = await Order.findOne({
      _id: req.params.orderId,
      customerId: req.customer._id
    }).populate("tenantId", "name slug").lean();
    if (!order) return res.status(404).json({ error: "Order not found." });
    return res.json({ order });
  } catch (error) {
    return next(error);
  }
});

api.get("/admin/overview", authenticate, requireRole("super_admin"), async (_req, res, next) => {
  try {
    const [totalBusinesses, activeBusinesses, pendingBusinesses, suspendedBusinesses, users, orders, paid] =
      await Promise.all([
        Tenant.countDocuments(),
        Tenant.countDocuments({ status: "active" }),
        Tenant.countDocuments({ status: "pending" }),
        Tenant.countDocuments({ status: "suspended" }),
        User.countDocuments(),
        Order.countDocuments(),
        Order.aggregate([{ $match: { paymentStatus: "paid" } }, { $group: { _id: null, total: { $sum: "$total" } } }])
      ]);
    const recentBusinesses = await Tenant.find().sort({ createdAt: -1 }).limit(5).lean();
    const recentOrders = await Order.find().sort({ createdAt: -1 }).limit(5).populate("tenantId", "name").lean();
    const audit = await AuditLog.find().sort({ createdAt: -1 }).limit(6).lean();
    res.json({
      metrics: {
        totalBusinesses,
        activeBusinesses,
        pendingBusinesses,
        suspendedBusinesses,
        registeredUsers: users,
        totalOrders: orders,
        recordedPaidOrderVolume: paid[0]?.total || 0
      },
      recentBusinesses,
      recentOrders,
      activity: audit
    });
  } catch (error) {
    next(error);
  }
});

api.get("/admin/businesses", authenticate, requireRole("super_admin"), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const filter = {};
    if (["pending", "active", "suspended", "rejected"].includes(req.query.status)) filter.status = req.query.status;
    if (typeof req.query.search === "string" && req.query.search.trim()) {
      const escaped = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [{ name: new RegExp(escaped, "i") }, { email: new RegExp(escaped, "i") }, { slug: new RegExp(escaped, "i") }];
    }
    const [items, total] = await Promise.all([
      Tenant.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Tenant.countDocuments(filter)
    ]);
    res.json({ items, page, pages: Math.ceil(total / limit), total });
  } catch (error) {
    next(error);
  }
});

api.post("/admin/businesses", authenticate, requireRole("super_admin"), async (req, res, next) => {
  let tenant = null;
  try {
    const input = parseOrRespond(companyAccountSchema, req.body, res);
    if (!input) return;
    if (await Tenant.exists({ previousSlugs: input.slug })) {
      return res.status(409).json({ error: "That store address is already in use." });
    }
    tenant = await Tenant.create({
      name: input.name,
      slug: input.slug,
      ownerName: input.ownerName,
      email: input.email,
      phone: input.phone,
      category: input.category,
      description: input.description,
      subscriptionFee: input.subscriptionFee,
      billingCurrency: input.billingCurrency,
      billingFrequency: input.billingFrequency,
      status: input.status
    });
    const user = await User.create({
      name: input.ownerName,
      username: input.username,
      email: `${input.username}@users.invalid`,
      passwordHash: await bcrypt.hash(input.password, 12),
      role: "business_owner",
      tenantId: tenant._id,
      active: true
    });
    await writeAudit({
      actor: req.user,
      action: "business.created",
      targetType: "tenant",
      targetId: tenant._id,
      tenantId: tenant._id,
      details: { name: tenant.name, adminUsername: user.username }
    });
    res.status(201).json({
      business: tenant,
      user: { id: user._id, username: user.username, role: user.role, tenantId: user.tenantId }
    });
  } catch (error) {
    if (tenant && error.code !== 11000) {
      try {
        await User.deleteOne({ tenantId: tenant._id, role: "business_owner" });
        await Tenant.deleteOne({ _id: tenant._id });
      } catch (rollbackError) {
        logError("Company creation rollback failed.", rollbackError);
        return res.status(500).json({ error: "Company creation failed and requires administrator attention." });
      }
    } else if (tenant) {
      await Tenant.deleteOne({ _id: tenant._id });
    }
    if (error.code === 11000) return res.status(409).json({ error: "The store address or username is already in use." });
    return next(error);
  }
});

api.patch("/admin/users/:id", authenticate, requireRole("super_admin"), async (req, res, next) => {
  let tenant = null;
  let previousTenant = null;
  let userSaved = false;
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid user ID." });
    const input = parseOrRespond(userUpdateSchema, req.body, res);
    if (!input) return;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found." });
    const nextRole = input.role || user.role;
    let nextTenantId = user.tenantId;
    if (nextRole === "business_owner") {
      if (user.role === "super_admin") {
        if (!input.tenantId) return res.status(400).json({ error: "Select a business for this user." });
        const targetTenant = await Tenant.findById(input.tenantId).select("_id");
        if (!targetTenant) return res.status(404).json({ error: "Business not found." });
        const activeAdmins = await User.countDocuments({ role: "super_admin", active: true });
        if (user.active && activeAdmins <= 1) {
          return res.status(409).json({ error: "The last active platform administrator cannot be changed to a business role." });
        }
        nextTenantId = targetTenant._id;
      } else if (input.tenantId && String(input.tenantId) !== String(user.tenantId)) {
        return res.status(400).json({ error: "Reassigning an existing business owner's tenant is not supported." });
      }
    } else {
      if (input.tenantId) return res.status(400).json({ error: "Platform administrators cannot be assigned to a business." });
      if (user.role === "business_owner") {
        const activeOwners = await User.countDocuments({
          role: "business_owner",
          tenantId: user.tenantId,
          active: true,
          _id: { $ne: user._id }
        });
        if (activeOwners === 0) {
          return res.status(409).json({ error: "Add another active owner to this business before changing this user's role." });
        }
        nextTenantId = null;
      }
    }
    if (input.business && (nextRole !== "business_owner" || !nextTenantId)) {
      return res.status(400).json({ error: "Business information can only be updated for a business owner." });
    }
    if (input.business) {
      tenant = await Tenant.findById(nextTenantId);
      if (!tenant) return res.status(404).json({ error: "The user's business could not be found." });
      previousTenant = Object.fromEntries([...Object.keys(input.business), "previousSlugs"].map((field) => [field, tenant[field]]));
      const updated = await updateTenantDetails(tenant, input.business);
      if (!updated) return res.status(409).json({ error: "That store address is already in use." });
    }
    if (input.name !== undefined) user.name = input.name;
    if (input.username !== undefined) {
      user.username = input.username;
      user.email = `${input.username}@users.invalid`;
    }
    user.role = nextRole;
    user.tenantId = nextTenantId;
    await user.save();
    userSaved = true;
    await writeAudit({
      actor: req.user,
      action: "user.updated",
      targetType: "user",
      targetId: user._id,
      tenantId: user.tenantId,
      details: {
        userFields: ["name", "username", "role"].filter((field) => input[field] !== undefined),
        businessFields: Object.keys(input.business || {})
      }
    });
    res.json({
      user: { id: user._id, name: user.name, username: user.username, role: user.role, tenantId: user.tenantId },
      business: tenant
    });
  } catch (error) {
    if (tenant && previousTenant && !userSaved) {
      try {
        Object.assign(tenant, previousTenant);
        await tenant.save();
      } catch (rollbackError) {
        logError("User update rollback failed.", rollbackError);
        return res.status(500).json({ error: "The account update failed and requires administrator attention." });
      }
    }
    if (error.code === 11000) return res.status(409).json({ error: "That username or store address is already in use." });
    return next(error);
  }
});

api.patch("/admin/businesses/:id", authenticate, requireRole("super_admin"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid business ID." });
    const input = parseOrRespond(companySchema.partial().refine((value) => Object.keys(value).length > 0), req.body, res);
    if (!input) return;
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ error: "Business not found." });
    if (!await updateTenantDetails(tenant, input)) {
      return res.status(409).json({ error: "That store address is already in use." });
    }
    await writeAudit({
      actor: req.user,
      action: "business.updated",
      targetType: "tenant",
      targetId: tenant._id,
      tenantId: tenant._id,
      details: { fields: Object.keys(input) }
    });
    res.json({ business: tenant });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "That store address is already in use." });
    return next(error);
  }
});

api.get("/admin/customers", authenticate, requireRole("super_admin"), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const filter = {};
    if (typeof req.query.search === "string" && req.query.search.trim()) {
      const escaped = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [{ name: new RegExp(escaped, "i") }, { email: new RegExp(escaped, "i") }, { phone: new RegExp(escaped, "i") }];
    }
    if (req.query.status === "active") filter.accountStatus = { $ne: "suspended" };
    else if (req.query.status === "suspended") filter.accountStatus = "suspended";
    const [customers, total] = await Promise.all([
      CustomerAccount.find(filter).select("name email phone accountStatus createdAt lastLoginAt")
        .sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      CustomerAccount.countDocuments(filter)
    ]);
    const customerIds = customers.map((customer) => customer._id);
    const [orderCounts, recentOrders] = await Promise.all([
      Order.aggregate([
        { $match: { customerId: { $in: customerIds } } },
        { $group: { _id: "$customerId", orderCount: { $sum: 1 }, lastOrderAt: { $max: "$createdAt" } } }
      ]),
      Order.find({ customerId: { $in: customerIds } })
        .select("+customerId orderNumber total createdAt tenantId")
        .sort({ createdAt: -1 }).limit(1000).populate("tenantId", "name slug").lean()
    ]);
    const countsByCustomer = new Map(orderCounts.map((entry) => [String(entry._id), entry]));
    const ordersByCustomer = new Map();
    for (const order of recentOrders) {
      const key = String(order.customerId);
      const history = ordersByCustomer.get(key) || [];
      if (history.length < 5) history.push(order);
      ordersByCustomer.set(key, history);
    }
    const items = customers.map((customer) => ({
      ...customer,
      accountStatus: customer.accountStatus || "active",
      orderCount: countsByCustomer.get(String(customer._id))?.orderCount || 0,
      lastOrderAt: countsByCustomer.get(String(customer._id))?.lastOrderAt || null,
      orders: ordersByCustomer.get(String(customer._id)) || []
    }));
    res.json({ items, page, pages: Math.ceil(total / limit), total });
  } catch (error) {
    next(error);
  }
});

api.patch("/admin/customers/:id/status", authenticate, requireRole("super_admin"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid customer ID." });
    const input = parseOrRespond(customerStatusSchema, req.body, res);
    if (!input) return;
    const customer = await CustomerAccount.findByIdAndUpdate(req.params.id, input, { new: true, runValidators: true })
      .select("name email phone accountStatus createdAt lastLoginAt").lean();
    if (!customer) return res.status(404).json({ error: "Customer account not found." });
    await writeAudit({ actor: req.user, action: "customer.account_status_updated", targetType: "customer", targetId: customer._id, details: { accountStatus: customer.accountStatus } });
    res.json({ customer });
  } catch (error) {
    next(error);
  }
});

api.get("/admin/users", authenticate, requireRole("super_admin"), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const filter = {};
    if (["super_admin", "business_owner"].includes(req.query.role)) filter.role = req.query.role;
    if (typeof req.query.search === "string" && req.query.search.trim()) {
      const escaped = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const ownerFilter = { name: new RegExp(escaped, "i") };
      const businessIds = req.query.role === "business_owner"
        ? await Tenant.find({ $or: [{ name: new RegExp(escaped, "i") }, { ownerName: new RegExp(escaped, "i") }, { email: new RegExp(escaped, "i") }, { slug: new RegExp(escaped, "i") }] }).distinct("_id")
        : [];
      filter.$or = [
        ownerFilter,
        { username: new RegExp(escaped, "i") },
        { email: new RegExp(escaped, "i") },
        ...(businessIds.length ? [{ tenantId: { $in: businessIds } }] : [])
      ];
    }
    const [items, total] = await Promise.all([
      User.find(filter)
        .select("name username email role tenantId active createdAt")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("tenantId", "name slug ownerName email phone category description subscriptionFee billingCurrency billingFrequency status createdAt")
        .lean(),
      User.countDocuments(filter)
    ]);
    res.json({ items, page, pages: Math.ceil(total / limit), total });
  } catch (error) {
    next(error);
  }
});

api.post("/admin/users", authenticate, requireRole("super_admin"), async (req, res, next) => {
  try {
    const input = parseOrRespond(adminUserSchema, req.body, res);
    if (!input) return;
    if (input.role === "business_owner" && !input.tenantId) {
      return res.status(400).json({ error: "Select a business for this user." });
    }
    if (input.role === "super_admin" && input.tenantId) {
      return res.status(400).json({ error: "Platform administrators cannot be assigned to a business." });
    }
    let tenant = null;
    if (input.role === "business_owner") {
      tenant = await Tenant.findById(input.tenantId).select("name");
      if (!tenant) return res.status(404).json({ error: "Business not found." });
    }
    const user = await User.create({
      username: input.username,
      email: `${input.username}@users.invalid`,
      name: input.name,
      passwordHash: await bcrypt.hash(input.password, 12),
      role: input.role,
      tenantId: tenant?._id || null,
      active: true
    });
    await writeAudit({
      actor: req.user,
      action: "user.created",
      targetType: "user",
      targetId: user._id,
      tenantId: tenant?._id || null,
      details: { username: user.username, role: user.role }
    });
    res.status(201).json({
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        role: user.role,
        tenantId: tenant ? { _id: tenant._id, name: tenant.name } : null,
        active: user.active,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "That username is already in use." });
    return next(error);
  }
});

api.patch("/admin/users/:id/status", authenticate, requireRole("super_admin"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid user ID." });
    const input = parseOrRespond(z.object({ active: z.boolean() }), req.body, res);
    if (!input) return;
    if (String(req.user._id) === req.params.id && !input.active) {
      return res.status(400).json({ error: "You cannot disable your own account." });
    }
    const target = await User.findById(req.params.id).select("username role tenantId active");
    if (!target) return res.status(404).json({ error: "User not found." });
    if (target.role === "super_admin" && !input.active && target.active) {
      const activeAdmins = await User.countDocuments({ role: "super_admin", active: true });
      if (activeAdmins <= 1) return res.status(409).json({ error: "The last active platform administrator cannot be disabled." });
    }
    target.active = input.active;
    await target.save();
    await writeAudit({
      actor: req.user,
      action: input.active ? "user.activated" : "user.disabled",
      targetType: "user",
      targetId: target._id,
      tenantId: target.tenantId,
      details: { username: target.username, role: target.role }
    });
    res.json({ user: { id: target._id, username: target.username, role: target.role, active: target.active } });
  } catch (error) {
    return next(error);
  }
});

api.patch("/admin/users/:id/password", authenticate, requireRole("super_admin"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid user ID." });
    const input = parseOrRespond(userPasswordSchema, req.body, res);
    if (!input) return;
    const user = await User.findById(req.params.id).select("username role tenantId");
    if (!user) return res.status(404).json({ error: "User not found." });
    user.passwordHash = await bcrypt.hash(input.password, 12);
    await user.save();
    await writeAudit({
      actor: req.user,
      action: "user.password_reset",
      targetType: "user",
      targetId: user._id,
      tenantId: user.tenantId,
      details: { username: user.username, role: user.role }
    });
    res.json({ message: "Password reset successfully." });
  } catch (error) {
    return next(error);
  }
});

api.patch("/admin/businesses/:id/status", authenticate, requireRole("super_admin"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid business ID." });
    const input = parseOrRespond(z.object({ status: z.enum(["active", "suspended", "rejected"]) }), req.body, res);
    if (!input) return;
    const tenant = await Tenant.findByIdAndUpdate(req.params.id, { status: input.status }, { new: true, runValidators: true });
    if (!tenant) return res.status(404).json({ error: "Business not found." });
    await writeAudit({
      actor: req.user,
      action: `business.${input.status}`,
      targetType: "tenant",
      targetId: tenant._id,
      tenantId: tenant._id,
      details: { status: input.status }
    });
    res.json({ business: tenant });
  } catch (error) {
    next(error);
  }
});

api.get("/admin/audit", authenticate, requireRole("super_admin"), async (_req, res, next) => {
  try {
    const items = await AuditLog.find().sort({ createdAt: -1 }).limit(100).populate("actorId", "name email").lean();
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

api.get("/admin/payments", authenticate, requireRole("super_admin"), async (req, res, next) => {
  try {
    const query = parseOrRespond(paymentActivityQuerySchema, req.query, res);
    if (!query) return;
    const page = query.page || 1;
    const limit = query.limit || 50;
    const filter = {};
    if (query.status && query.status !== "all") filter.paymentStatus = query.status;
    if (query.search) {
      const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const matchingTenants = await Tenant.find({ name: new RegExp(escaped, "i") }).select("_id").lean();
      filter.$or = [
        { orderNumber: new RegExp(escaped, "i") },
        { tenantId: { $in: matchingTenants.map((tenant) => tenant._id) } }
      ];
    }
    const [items, total, metrics] = await Promise.all([
      Order.find(filter)
        .select("orderNumber tenantId item.name item.variant item.quantity total paymentStatus createdAt updatedAt")
        .populate("tenantId", "name slug")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Order.countDocuments(filter),
      getPaymentMetrics()
    ]);
    res.json({ items, page, pages: Math.ceil(total / limit), total, metrics });
  } catch (error) {
    next(error);
  }
});

api.get("/admin/payment-management", authenticate, requireRole("super_admin"), async (req, res, next) => {
  try {
    const query = parseOrRespond(paymentSetupQuerySchema, req.query, res);
    if (!query) return;
    const page = query.page || 1;
    const limit = query.limit || 50;
    const [companies, total] = await Promise.all([
      Tenant.find()
        .select("name slug ownerName email phone category description status plan createdAt")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Tenant.countDocuments()
    ]);
    const tenantIds = companies.map((company) => company._id);
    const users = await User.find({ role: "business_owner", tenantId: { $in: tenantIds } })
      .select("username email active createdAt tenantId")
      .lean();
    const usersByTenant = new Map();
    for (const user of users) {
      const tenantKey = String(user.tenantId);
      const accounts = usersByTenant.get(tenantKey) || [];
      accounts.push(user);
      usersByTenant.set(tenantKey, accounts);
    }
    res.json({
      companies: companies.map((company) => ({
        ...company,
        accounts: usersByTenant.get(String(company._id)) || []
      })),
      page,
      pages: Math.ceil(total / limit),
      total
    });
  } catch (error) {
    next(error);
  }
});

api.get("/admin/payment-management/companies/:tenantId/providers", authenticate, requireRole("super_admin"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.tenantId)) return res.status(400).json({ error: "Invalid company ID." });
    const tenant = await Tenant.findById(req.params.tenantId).select("_id").lean();
    if (!tenant) return res.status(404).json({ error: "Company not found." });
    const items = await TenantPaymentProvider.find({ tenantId: tenant._id })
      .select("provider apiKeyConfigured merchantTokenConfigured webhookConfigured +apiKeyHint +merchantTokenHint +webhookHint +apiKeyHintSafe +merchantTokenHintSafe +webhookHintSafe commissionRate enabled createdAt updatedAt")
      .sort({ createdAt: 1 })
      .lean();
    res.json({ items: items.map(paymentProviderSummary) });
  } catch (error) {
    next(error);
  }
});

api.patch("/admin/payment-management/companies/:tenantId/providers/:provider", authenticate, requireRole("super_admin"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.tenantId)) return res.status(400).json({ error: "Invalid company ID." });
    if (!tenantPaymentProviders.includes(req.params.provider)) {
      return res.status(404).json({ error: "Payment provider not found." });
    }
    const input = parseOrRespond(tenantPaymentProviderSchema, req.body, res);
    if (!input) return;
    const tenant = await Tenant.findById(req.params.tenantId).select("_id");
    if (!tenant) return res.status(404).json({ error: "Company not found." });
    const result = await saveTenantPaymentProvider({
      tenantId: tenant._id,
      provider: req.params.provider,
      input,
      actor: req.user
    });
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ item: result.item });
  } catch (error) {
    next(error);
  }
});

api.delete("/admin/payment-management/companies/:tenantId/providers/:provider", authenticate, requireRole("super_admin"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.tenantId)) return res.status(400).json({ error: "Invalid company ID." });
    if (!tenantPaymentProviders.includes(req.params.provider)) {
      return res.status(404).json({ error: "Payment provider not found." });
    }
    const credential = await TenantPaymentProvider.findOneAndDelete({
      tenantId: req.params.tenantId,
      provider: req.params.provider
    }).select("provider");
    if (!credential) return res.status(404).json({ error: "Company payment provider not found." });
    await writeAudit({
      actor: req.user,
      action: "tenant_payment_provider.deleted",
      targetType: "payment_provider",
      targetId: credential._id,
      tenantId: req.params.tenantId,
      details: { provider: credential.provider }
    });
    res.json({ message: "Company payment provider removed." });
  } catch (error) {
    next(error);
  }
});

api.get("/tenant/overview", authenticate, requireRole("business_owner"), async (req, res, next) => {
  try {
    const tenantId = tenantIdFor(req.user);
    const [products, activeProducts, lowStock, orders, newOrders, pendingPayments, paidOrders] = await Promise.all([
      Product.countDocuments({ tenantId }),
      Product.countDocuments({ tenantId, status: "active" }),
      Product.countDocuments({ tenantId, status: "active", "variants.stock": { $lte: 5 } }),
      Order.countDocuments({ tenantId }),
      Order.countDocuments({ tenantId, fulfillmentStatus: "new" }),
      Order.countDocuments({ tenantId, paymentStatus: "pending" }),
      Order.find({ tenantId, paymentStatus: "paid" }).select("total createdAt").lean()
    ]);
    const recordedPaidSales = paidOrders.reduce((sum, order) => sum + order.total, 0);
    const recentOrders = await Order.find({ tenantId }).sort({ createdAt: -1 }).limit(5).lean();
    const conversations = await Conversation.find({ tenantId }).sort({ updatedAt: -1 }).limit(5).lean();
    res.json({
      metrics: { products, activeProducts, lowStock, orders, newOrders, pendingPayments, recordedPaidSales },
      recentOrders,
      conversations
    });
  } catch (error) {
    next(error);
  }
});

api.get("/tenant/products", authenticate, requireRole("business_owner"), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const filter = withTenantScope(req.user);
    if (req.query.sectionId) {
      if (!mongoose.isValidObjectId(req.query.sectionId)) return res.status(400).json({ error: "Invalid product section ID." });
      filter.sectionId = req.query.sectionId;
    }
    const items = await Product.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate("sectionId", "name").lean();
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

api.get("/tenant/sections", authenticate, requireRole("business_owner"), async (req, res, next) => {
  try {
    const items = await ProductSection.find(withTenantScope(req.user)).sort({ displayOrder: 1, createdAt: 1 }).lean();
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

api.post("/tenant/sections", authenticate, requireRole("business_owner"), async (req, res, next) => {
  try {
    const input = parseOrRespond(productSectionSchema, req.body, res);
    if (!input) return;
    const tenantId = tenantIdFor(req.user);
    const duplicate = await ProductSection.findOne({ tenantId, name: input.name }).collation({ locale: "en", strength: 2 }).lean();
    if (duplicate) return res.status(409).json({ error: "A section with that name already exists." });
    const section = await ProductSection.create({ ...input, tenantId });
    await writeAudit({ actor: req.user, action: "product_section.created", targetType: "product_section", targetId: section._id, tenantId });
    res.status(201).json({ section });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "A section with that name already exists." });
    next(error);
  }
});

api.patch("/tenant/sections/:id", authenticate, requireRole("business_owner"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid product section ID." });
    const input = parseOrRespond(productSectionSchema.partial().refine((value) => Object.keys(value).length > 0), req.body, res);
    if (!input) return;
    const tenantId = tenantIdFor(req.user);
    if (input.name) {
      const duplicate = await ProductSection.findOne({ tenantId, _id: { $ne: req.params.id }, name: input.name }).collation({ locale: "en", strength: 2 }).lean();
      if (duplicate) return res.status(409).json({ error: "A section with that name already exists." });
    }
    const section = await ProductSection.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { $set: input },
      { new: true, runValidators: true }
    );
    if (!section) return res.status(404).json({ error: "Product section not found." });
    await writeAudit({ actor: req.user, action: "product_section.updated", targetType: "product_section", targetId: section._id, tenantId });
    res.json({ section });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "A section with that name already exists." });
    next(error);
  }
});

api.delete("/tenant/sections/:id", authenticate, requireRole("business_owner"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid product section ID." });
    const tenantId = tenantIdFor(req.user);
    const section = await ProductSection.findOne({ _id: req.params.id, tenantId });
    if (!section) return res.status(404).json({ error: "Product section not found." });
    if (await Product.exists({ tenantId, sectionId: section._id })) {
      return res.status(409).json({ error: "Move or archive this section’s products before deleting the section." });
    }
    await section.deleteOne();
    await writeAudit({ actor: req.user, action: "product_section.deleted", targetType: "product_section", targetId: section._id, tenantId });
    res.json({ message: "Product section deleted." });
  } catch (error) {
    next(error);
  }
});

api.post("/tenant/products", authenticate, requireRole("business_owner"), async (req, res, next) => {
  try {
    const input = parseOrRespond(productSchema, req.body, res);
    if (!input) return;
    if (input.promotionalPrice !== null && input.promotionalPrice >= input.price) {
      return res.status(400).json({ error: "Promotional price must be lower than the regular price." });
    }
    const tenantId = tenantIdFor(req.user);
    if (input.sectionId && !await ProductSection.exists({ _id: input.sectionId, tenantId, active: true })) {
      return res.status(400).json({ error: "Choose an active product section belonging to your business." });
    }
    const product = await Product.create({
      ...input,
      variants: input.variants.map(({ _id, ...variant }) => variant),
      imageUrl: input.imageUrl || input.images[0] || "",
      tenantId
    });
    await writeAudit({ actor: req.user, action: "product.created", targetType: "product", targetId: product._id, tenantId: product.tenantId });
    res.status(201).json({ product });
  } catch (error) {
    next(error);
  }
});

api.patch("/tenant/products/:id", authenticate, requireRole("business_owner"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid product ID." });
    const input = parseOrRespond(productUpdateSchema, req.body, res);
    if (!input) return;
    const tenantId = tenantIdFor(req.user);
    const existing = await Product.findOne({ _id: req.params.id, tenantId }).select("sectionId price promotionalPrice variants");
    if (!existing) return res.status(404).json({ error: "Product not found." });
    const regularPrice = input.price ?? existing.price;
    const promotionalPrice = Object.hasOwn(input, "promotionalPrice") ? input.promotionalPrice : existing.promotionalPrice;
    if (promotionalPrice != null && promotionalPrice >= regularPrice) {
      return res.status(400).json({ error: "Promotional price must be lower than the regular price." });
    }
    const sectionId = Object.hasOwn(input, "sectionId") ? input.sectionId : existing.sectionId;
    const requiresActiveSection = input.isPublished === true || (Object.hasOwn(input, "sectionId") && Boolean(input.sectionId));
    if (sectionId && requiresActiveSection && !await ProductSection.exists({ _id: sectionId, tenantId, active: true })) {
      return res.status(400).json({ error: "Choose an active product section belonging to your business." });
    }
    if (input.variants) {
      const currentIds = new Set(existing.variants.map((variant) => String(variant._id)));
      const incomingIds = new Set();
      for (const variant of input.variants) {
        if (variant._id && !currentIds.has(variant._id)) {
          return res.status(400).json({ error: "A product variant does not belong to this product." });
        }
        if (variant._id && incomingIds.has(variant._id)) {
          return res.status(400).json({ error: "A product variant cannot be included more than once." });
        }
        if (variant._id) incomingIds.add(variant._id);
      }
      if (existing.variants.some((variant) => !incomingIds.has(String(variant._id)))) {
        return res.status(409).json({ error: "Saved variants cannot be removed because orders reference them. Set stock to zero or archive the product instead." });
      }
    }
    if (input.images && !Object.hasOwn(input, "imageUrl")) input.imageUrl = input.images[0] || "";
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { $set: input },
      { new: true, runValidators: true }
    );
    if (!product) return res.status(404).json({ error: "Product not found." });
    await writeAudit({ actor: req.user, action: "product.updated", targetType: "product", targetId: product._id, tenantId });
    res.json({ product });
  } catch (error) {
    next(error);
  }
});
api.patch("/tenant/products/:id/archive", authenticate, requireRole("business_owner"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid product ID." });
    const product = await Product.findOneAndUpdate(
      withTenantScope(req.user, { _id: req.params.id }),
      { status: "archived" },
      { new: true }
    );
    if (!product) return res.status(404).json({ error: "Product not found." });
    await writeAudit({ actor: req.user, action: "product.archived", targetType: "product", targetId: product._id, tenantId: product.tenantId });
    res.json({ product });
  } catch (error) {
    next(error);
  }
});

api.get("/tenant/customers", authenticate, requireRole("business_owner"), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const escapedSearch = typeof req.query.search === "string" && req.query.search.trim()
      ? req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      : "";
    const accountFilters = {};
    if (escapedSearch) accountFilters.$or = [
      { "customer.name": new RegExp(escapedSearch, "i") },
      { "customer.email": new RegExp(escapedSearch, "i") },
      { "customer.phone": new RegExp(escapedSearch, "i") }
    ];
    if (req.query.status === "active") accountFilters["customer.accountStatus"] = { $ne: "suspended" };
    else if (req.query.status === "suspended") accountFilters["customer.accountStatus"] = "suspended";
    const tenantId = tenantIdFromSession(req.user);
    const [result] = await Order.aggregate([
      { $match: { tenantId, customerId: { $ne: null } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$customerId", orderCount: { $sum: 1 }, lastOrderAt: { $first: "$createdAt" }, recentPhone: { $first: "$customer.phone" } } },
      { $lookup: { from: CustomerAccount.collection.name, localField: "_id", foreignField: "_id", as: "customer" } },
      { $unwind: "$customer" },
      { $match: accountFilters },
      { $sort: { lastOrderAt: -1 } },
      { $facet: {
        items: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
          { $project: {
            _id: "$customer._id",
            name: "$customer.name",
            email: "$customer.email",
            phone: { $cond: [{ $eq: ["$customer.phone", ""] }, "$recentPhone", "$customer.phone"] },
            accountStatus: { $ifNull: ["$customer.accountStatus", "active"] },
            createdAt: "$customer.createdAt",
            lastLoginAt: "$customer.lastLoginAt",
            orderCount: 1,
            lastOrderAt: 1
          } }
        ],
        total: [{ $count: "count" }]
      } }
    ]);
    const customers = result?.items || [];
    const customerIds = customers.map((customer) => customer._id);
    const orders = customerIds.length ? await Order.find({ tenantId, customerId: { $in: customerIds } })
      .select("+customerId orderNumber total createdAt")
      .sort({ createdAt: -1 }).limit(1000).lean() : [];
    const ordersByCustomer = new Map();
    for (const order of orders) {
      const key = String(order.customerId);
      const history = ordersByCustomer.get(key) || [];
      if (history.length < 5) history.push(order);
      ordersByCustomer.set(key, history);
    }
    const items = customers.map((customer) => ({
      ...customer,
      orders: ordersByCustomer.get(String(customer._id)) || []
    }));
    const total = result?.total?.[0]?.count || 0;
    res.json({ items, page, pages: Math.ceil(total / limit), total });
  } catch (error) {
    next(error);
  }
});

api.get("/tenant/orders", authenticate, requireRole("business_owner"), async (req, res, next) => {
  try {
    const filter = withTenantScope(req.user);
    if (req.query.status === "pending_payment") filter.paymentStatus = "pending";
    else if (["new", "processing", "ready", "shipped", "delivered", "cancelled"].includes(req.query.status)) {
      filter.fulfillmentStatus = req.query.status;
    }
    const items = await Order.find(filter).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

api.get("/tenant/storefront-login", authenticate, requireRole("business_owner"), async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(tenantIdFromSession(req.user)).select("loginPage").lean();
    if (!tenant) return res.status(404).json({ error: "Company not found." });
    res.json({
      draft: { ...defaultLoginPageSettings, ...(tenant.loginPage?.draft || {}) },
      isPublished: Boolean(tenant.loginPage?.isPublished)
    });
  } catch (error) {
    next(error);
  }
});

api.patch("/tenant/storefront-login", authenticate, requireRole("business_owner"), async (req, res, next) => {
  try {
    const input = parseOrRespond(tenantLoginPageSettingsSchema, req.body, res);
    if (!input) return;
    const tenant = await Tenant.findById(tenantIdFromSession(req.user));
    if (!tenant) return res.status(404).json({ error: "Company not found." });
    tenant.loginPage.draft = input;
    tenant.markModified("loginPage");
    await tenant.save();
    await writeAudit({
      actor: req.user,
      action: "storefront_login.draft_saved",
      targetType: "storefront_login",
      targetId: tenant._id,
      tenantId: tenant._id
    });
    res.json({ draft: input, isPublished: tenant.loginPage.isPublished });
  } catch (error) {
    next(error);
  }
});

api.post("/tenant/storefront-login/publish", authenticate, requireRole("business_owner"), async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(tenantIdFromSession(req.user));
    if (!tenant) return res.status(404).json({ error: "Company not found." });
    tenant.loginPage.published = tenant.loginPage.draft.toObject();
    tenant.loginPage.isPublished = true;
    tenant.markModified("loginPage");
    await tenant.save();
    await writeAudit({
      actor: req.user,
      action: "storefront_login.published",
      targetType: "storefront_login",
      targetId: tenant._id,
      tenantId: tenant._id
    });
    res.json({ message: "Your customer login page is published." });
  } catch (error) {
    next(error);
  }
});

api.post("/tenant/storefront-login/reset", authenticate, requireRole("business_owner"), async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(tenantIdFromSession(req.user));
    if (!tenant) return res.status(404).json({ error: "Company not found." });
    tenant.loginPage.draft = defaultLoginPageSettings;
    tenant.loginPage.published = defaultLoginPageSettings;
    tenant.loginPage.isPublished = false;
    tenant.markModified("loginPage");
    await tenant.save();
    await writeAudit({
      actor: req.user,
      action: "storefront_login.reset",
      targetType: "storefront_login",
      targetId: tenant._id,
      tenantId: tenant._id
    });
    res.json({ draft: defaultLoginPageSettings, isPublished: false });
  } catch (error) {
    next(error);
  }
});

api.get("/tenant/payment-gateways", authenticate, requireRole("business_owner"), async (req, res, next) => {
  try {
    const tenantId = tenantIdFromSession(req.user);
    const items = await TenantPaymentProvider.find({ tenantId })
      .select("provider apiKeyConfigured merchantTokenConfigured webhookConfigured +apiKeyHint +merchantTokenHint +webhookHint +apiKeyHintSafe +merchantTokenHintSafe +webhookHintSafe commissionRate enabled createdAt updatedAt")
      .sort({ createdAt: 1 })
      .lean();
    res.json({ items: items.map(paymentProviderSummary) });
  } catch (error) {
    next(error);
  }
});

api.patch("/tenant/payment-gateways/:provider", authenticate, requireRole("business_owner"), async (req, res, next) => {
  try {
    if (!tenantPaymentProviders.includes(req.params.provider)) {
      return res.status(404).json({ error: "Payment provider not found." });
    }
    const input = parseOrRespond(tenantPaymentProviderSchema, req.body, res);
    if (!input) return;
    const tenantId = tenantIdFromSession(req.user);
    const result = await saveTenantPaymentProvider({
      tenantId,
      provider: req.params.provider,
      input,
      actor: req.user
    });
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ item: result.item });
  } catch (error) {
    next(error);
  }
});

api.delete("/tenant/payment-gateways/:provider", authenticate, requireRole("business_owner"), async (req, res, next) => {
  try {
    if (!tenantPaymentProviders.includes(req.params.provider)) {
      return res.status(404).json({ error: "Payment provider not found." });
    }
    const tenantId = tenantIdFromSession(req.user);
    const credential = await TenantPaymentProvider.findOneAndDelete({
      tenantId,
      provider: req.params.provider
    }).select("provider");
    if (!credential) return res.status(404).json({ error: "Company payment provider not found." });
    await writeAudit({
      actor: req.user,
      action: "tenant_payment_provider.deleted",
      targetType: "payment_provider",
      targetId: credential._id,
      tenantId,
      details: { provider: credential.provider }
    });
    res.json({ message: "Payment gateway credentials removed." });
  } catch (error) {
    next(error);
  }
});

api.get("/tenant/payments", authenticate, requireRole("business_owner"), async (req, res, next) => {
  try {
    const query = parseOrRespond(paymentActivityQuerySchema, req.query, res);
    if (!query) return;
    const tenantFilter = withTenantScope(req.user);
    const filter = { ...tenantFilter };
    if (query.status && query.status !== "all") filter.paymentStatus = query.status;
    if (query.search) {
      const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { orderNumber: new RegExp(escaped, "i") },
        { "item.name": new RegExp(escaped, "i") }
      ];
    }
    const page = query.page || 1;
    const limit = query.limit || 50;
    const [items, total, metrics] = await Promise.all([
      Order.find(filter)
        .select("orderNumber item.name item.variant item.quantity total paymentStatus createdAt updatedAt")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Order.countDocuments(filter),
      getPaymentMetrics(tenantFilter)
    ]);
    res.json({ items, page, pages: Math.ceil(total / limit), total, metrics });
  } catch (error) {
    next(error);
  }
});

api.patch("/tenant/orders/:id/fulfillment", authenticate, requireRole("business_owner"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid order ID." });
    const input = parseOrRespond(fulfillmentSchema, req.body, res);
    if (!input) return;
    const tenantId = tenantIdFor(req.user);
    let order = await Order.findOne(withTenantScope(req.user, { _id: req.params.id }));
    if (!order) return res.status(404).json({ error: "Order not found." });
    if (["cancelled", "delivered"].includes(order.fulfillmentStatus) && input.fulfillmentStatus !== order.fulfillmentStatus) {
      return res.status(409).json({ error: "Cancelled or delivered orders cannot be reopened or changed." });
    }
    if (input.fulfillmentStatus === "cancelled") {
      if (["shipped", "delivered"].includes(order.fulfillmentStatus)) {
        return res.status(409).json({ error: "Shipped or delivered orders cannot be cancelled here." });
      }
      if (order.fulfillmentStatus !== "cancelled") {
        const cancellationTime = new Date();
        const cancelledOrder = await Order.findOneAndUpdate(
          {
            _id: order._id,
            tenantId: tenantIdFor(req.user),
            fulfillmentStatus: { $in: ["new", "processing", "ready"] },
            inventoryRestoredAt: null
          },
          { $set: { fulfillmentStatus: "cancelled", inventoryRestoredAt: cancellationTime } },
          { new: true }
        );
        if (cancelledOrder) {
          try {
            const orderItems = cancelledOrder.items?.length ? cancelledOrder.items : [cancelledOrder.item];
            await restoreReservations(orderItems.map((item) => ({
              productId: item.productId,
              tenantId,
              variantId: item.variantId,
              quantity: item.quantity
            })));
          } catch (error) {
            const rollback = await Order.updateOne(
              { _id: cancelledOrder._id, inventoryRestoredAt: cancellationTime },
              { $set: { fulfillmentStatus: order.fulfillmentStatus }, $unset: { inventoryRestoredAt: 1 } }
            );
            if (rollback.matchedCount !== 1) {
              logError("Cancellation rollback needs administrator attention.", error);
              return res.status(500).json({ error: "Inventory restoration failed and order rollback requires administrator attention." });
            }
            return next(error);
          }
          order = cancelledOrder;
        } else {
          order = await Order.findOne(withTenantScope(req.user, { _id: order._id }));
          if (!order || order.fulfillmentStatus !== "cancelled") {
            return res.status(409).json({ error: "The order status changed; refresh and try again." });
          }
        }
      }
    } else {
      order = await Order.findOneAndUpdate(
        withTenantScope(req.user, { _id: req.params.id }),
        { fulfillmentStatus: input.fulfillmentStatus },
        { new: true, runValidators: true }
      );
    }
    await writeAudit({ actor: req.user, action: "order.fulfillment_updated", targetType: "order", targetId: order._id, tenantId: order.tenantId, details: input });
    res.json({ order });
  } catch (error) {
    next(error);
  }
});

api.patch("/tenant/orders/:id/delivery", authenticate, requireRole("business_owner"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid order ID." });
    const input = parseOrRespond(orderDeliveryUpdateSchema, req.body, res);
    if (!input) return;
    const filter = withTenantScope(req.user, { _id: req.params.id });
    const order = await Order.findOne(filter);
    if (!order) return res.status(404).json({ error: "Order not found." });
    if (["shipped", "delivered", "cancelled"].includes(order.fulfillmentStatus)) {
      return res.status(409).json({ error: "Delivery details cannot be changed after shipment, delivery, or cancellation." });
    }
    for (const field of ["phone", "email", "address", "location", "instructions"]) {
      if (Object.hasOwn(input, field)) order.customer[field] = input[field];
    }
    if (Object.hasOwn(input, "deliveryFee")) {
      order.deliveryFee = input.deliveryFee;
      order.total = Math.max(0, roundCurrency(order.subtotal + order.deliveryFee - order.discount));
    }
    await order.save();
    await writeAudit({
      actor: req.user,
      action: "order.delivery_updated",
      targetType: "order",
      targetId: order._id,
      tenantId: order.tenantId,
      details: { fields: Object.keys(input) }
    });
    res.json({ order });
  } catch (error) {
    next(error);
  }
});

api.get("/admin/support/conversations", authenticate, requireRole("super_admin"), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const filter = {};
    if (["open", "in_progress", "resolved"].includes(req.query.status)) filter.status = req.query.status;
    const [items, total] = await Promise.all([
      SupportConversation.find(filter)
        .sort({ unreadByAdmin: -1, lastMessageAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("tenantId", "name")
        .populate("createdBy", "name username email")
        .lean(),
      SupportConversation.countDocuments(filter)
    ]);
    res.json({ items, page, pages: Math.ceil(total / limit), total });
  } catch (error) {
    next(error);
  }
});

api.get("/admin/support/conversations/:id", authenticate, requireRole("super_admin"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid support conversation ID." });
    const conversation = await SupportConversation.findOneAndUpdate(
      { _id: req.params.id },
      { $set: { unreadByAdmin: false } },
      { new: true }
    ).populate("tenantId", "name").populate("createdBy", "name username email").lean();
    if (!conversation) return res.status(404).json({ error: "Support conversation not found." });
    const tenantId = conversation.tenantId?._id || conversation.tenantId;
    await SupportMessage.updateMany(
      {
        conversationId: conversation._id,
        tenantId,
        senderRole: { $in: ["business_owner", "store_customer"] },
        readAt: null
      },
      { $set: { readAt: new Date() } }
    );
    const messages = await SupportMessage.find({ conversationId: conversation._id, tenantId })
      .sort({ createdAt: 1 }).lean();
    res.json({ conversation, messages });
  } catch (error) {
    next(error);
  }
});

api.post("/admin/support/conversations/:id/messages", authenticate, requireRole("super_admin"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid support conversation ID." });
    const input = parseOrRespond(supportMessageSchema, req.body, res);
    if (!input) return;
    const conversation = await SupportConversation.findById(req.params.id);
    if (!conversation) return res.status(404).json({ error: "Support conversation not found." });
    const result = await appendSupportMessage(conversation, req.user, input.body);
    if (!result) return res.status(404).json({ error: "Support conversation not found." });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

api.patch("/admin/support/conversations/:id/status", authenticate, requireRole("super_admin"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid support conversation ID." });
    const input = parseOrRespond(supportStatusSchema, req.body, res);
    if (!input) return;
    const conversation = await SupportConversation.findByIdAndUpdate(
      req.params.id,
      { $set: { status: input.status } },
      { new: true, runValidators: true }
    );
    if (!conversation) return res.status(404).json({ error: "Support conversation not found." });
    await writeAudit({
      actor: req.user,
      action: "support.status_updated",
      targetType: "support_conversation",
      targetId: conversation._id,
      tenantId: conversation.tenantId,
      details: { status: conversation.status }
    });
    res.json({ conversation });
  } catch (error) {
    next(error);
  }
});

api.get("/tenant/support/conversations", authenticate, requireRole("business_owner"), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const filter = withSupportConversationScope(req.user);
    if (["open", "in_progress", "resolved"].includes(req.query.status)) filter.status = req.query.status;
    const [items, total] = await Promise.all([
      SupportConversation.find(filter)
        .sort({ unreadByBusiness: -1, lastMessageAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("tenantId", "name")
        .populate("createdBy", "name username email")
        .lean(),
      SupportConversation.countDocuments(filter)
    ]);
    res.json({ items, page, pages: Math.ceil(total / limit), total });
  } catch (error) {
    next(error);
  }
});

api.post("/tenant/support/conversations", authenticate, requireRole("business_owner"), async (req, res, next) => {
  try {
    const input = parseOrRespond(supportConversationSchema, req.body, res);
    if (!input) return;
    const tenantId = tenantIdFor(req.user);
    const conversation = await SupportConversation.create({
      tenantId,
      createdBy: req.user._id,
      subject: input.subject,
      lastMessage: input.body,
      unreadByAdmin: true,
      unreadByBusiness: false
    });
    try {
      const message = await SupportMessage.create({
        conversationId: conversation._id,
        tenantId,
        senderId: req.user._id,
        senderRole: req.user.role,
        senderName: req.user.name,
        body: input.body
      });
      await writeAudit({
        actor: req.user,
        action: "support.conversation_created",
        targetType: "support_conversation",
        targetId: conversation._id,
        tenantId,
        details: { subject: conversation.subject }
      });
      res.status(201).json({ conversation, message });
    } catch (error) {
      try {
        await SupportMessage.deleteMany({ conversationId: conversation._id, tenantId });
        await SupportConversation.deleteOne({ _id: conversation._id, tenantId });
      } catch (rollbackError) {
        logError("Support conversation creation rollback failed.", rollbackError);
        return res.status(500).json({ error: "The support request failed and requires administrator attention." });
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

api.get("/tenant/support/conversations/:id", authenticate, requireRole("business_owner"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid support conversation ID." });
    const conversation = await SupportConversation.findOneAndUpdate(
      withSupportConversationScope(req.user, { _id: req.params.id }),
      { $set: { unreadByBusiness: false } },
      { new: true }
    ).populate("tenantId", "name").populate("createdBy", "name username email").lean();
    if (!conversation) return res.status(404).json({ error: "Support conversation not found." });
    await SupportMessage.updateMany(
      {
        conversationId: conversation._id,
        tenantId: tenantIdFor(req.user),
        senderRole: "super_admin",
        readAt: null
      },
      { $set: { readAt: new Date() } }
    );
    const messages = await SupportMessage.find({
      conversationId: conversation._id,
      tenantId: tenantIdFor(req.user)
    }).sort({ createdAt: 1 }).lean();
    res.json({ conversation, messages });
  } catch (error) {
    next(error);
  }
});

api.post("/tenant/support/conversations/:id/messages", authenticate, requireRole("business_owner"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid support conversation ID." });
    const input = parseOrRespond(supportMessageSchema, req.body, res);
    if (!input) return;
    const conversation = await SupportConversation.findOne(withSupportConversationScope(req.user, { _id: req.params.id }));
    if (!conversation) return res.status(404).json({ error: "Support conversation not found." });
    const result = await appendSupportMessage(conversation, req.user, input.body);
    if (!result) return res.status(404).json({ error: "Support conversation not found." });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

api.get("/tenant/conversations", authenticate, requireRole("business_owner"), async (req, res, next) => {
  try {
    const items = await Conversation.find(withTenantScope(req.user))
      .sort({ updatedAt: -1 }).limit(100).populate("orderId").lean();
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

api.get("/tenant/conversations/:id", authenticate, requireRole("business_owner"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid conversation ID." });
    const conversation = await Conversation.findOneAndUpdate(
      withTenantScope(req.user, { _id: req.params.id }),
      { $set: { unreadByMerchant: false } },
      { new: true }
    ).populate("orderId").lean();
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });
    await Conversation.updateOne(
      { _id: conversation._id, tenantId: tenantIdFor(req.user) },
      { $set: { "messages.$[message].readByMerchantAt": new Date() } },
      { arrayFilters: [{ "message.sender": "customer", "message.readByMerchantAt": null }] }
    );
    const updated = await Conversation.findOne(withTenantScope(req.user, { _id: req.params.id })).populate("orderId").lean();
    res.json({ conversation: updated });
  } catch (error) {
    next(error);
  }
});

api.post("/tenant/conversations/:id/messages", authenticate, requireRole("business_owner"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid conversation ID." });
    const input = parseOrRespond(orderChatMessageSchema, req.body, res);
    if (!input) return;
    const conversation = await Conversation.findOneAndUpdate(
      withTenantScope(req.user, { _id: req.params.id }),
      {
        $push: { messages: { sender: "merchant", senderName: req.user.name, body: input.body } },
        $set: { unreadByCustomer: true, unreadByMerchant: false, unreadByAdmin: true }
      },
      { new: true }
    );
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });
    res.json({ conversation });
  } catch (error) {
    next(error);
  }
});

api.patch("/tenant/conversations/:id/status", authenticate, requireRole("business_owner"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid conversation ID." });
    const input = parseOrRespond(orderChatStatusSchema, req.body, res);
    if (!input) return;
    const conversation = await Conversation.findOneAndUpdate(
      withTenantScope(req.user, { _id: req.params.id }),
      { $set: { status: input.status } },
      { new: true, runValidators: true }
    );
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });
    res.json({ conversation });
  } catch (error) {
    next(error);
  }
});

api.get("/admin/order-conversations", authenticate, requireRole("super_admin"), async (req, res, next) => {
  try {
    const filter = {};
    if (["open", "in_progress", "resolved"].includes(req.query.status)) filter.status = req.query.status;
    const items = await Conversation.find(filter)
      .sort({ unreadByAdmin: -1, updatedAt: -1 })
      .limit(100)
      .populate("tenantId", "name slug")
      .populate("orderId")
      .lean();
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

api.get("/admin/order-conversations/:id", authenticate, requireRole("super_admin"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid conversation ID." });
    const conversation = await Conversation.findByIdAndUpdate(
      req.params.id,
      { $set: { unreadByAdmin: false } },
      { new: true }
    ).populate("tenantId", "name slug").populate("orderId").lean();
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });
    const messages = await Conversation.updateOne(
      { _id: conversation._id },
      { $set: { "messages.$[message].readByAdminAt": new Date() } },
      { arrayFilters: [{ "message.sender": "customer", "message.readByAdminAt": null }] }
    );
    const thread = await Conversation.findById(conversation._id).populate("tenantId", "name slug").populate("orderId").lean();
    res.json({ conversation: thread, read: messages.modifiedCount > 0 });
  } catch (error) {
    next(error);
  }
});

api.post("/admin/order-conversations/:id/messages", authenticate, requireRole("super_admin"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid conversation ID." });
    const input = parseOrRespond(orderChatMessageSchema, req.body, res);
    if (!input) return;
    const conversation = await Conversation.findOneAndUpdate(
      { _id: req.params.id },
      {
        $push: { messages: { sender: "platform_admin", senderName: req.user.name, body: input.body } },
        $set: { unreadByCustomer: true, unreadByMerchant: true, unreadByAdmin: false }
      },
      { new: true }
    ).populate("tenantId", "name slug").populate("orderId");
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });
    await writeAudit({
      actor: req.user,
      action: "order_support.platform_reply",
      targetType: "order_conversation",
      targetId: conversation._id,
      tenantId: conversation.tenantId?._id || conversation.tenantId,
      details: { orderId: conversation.orderId?._id || conversation.orderId }
    });
    res.status(201).json({ conversation });
  } catch (error) {
    next(error);
  }
});

api.patch("/admin/order-conversations/:id/status", authenticate, requireRole("super_admin"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid conversation ID." });
    const input = parseOrRespond(orderChatStatusSchema, req.body, res);
    if (!input) return;
    const conversation = await Conversation.findByIdAndUpdate(
      req.params.id,
      { $set: { status: input.status } },
      { new: true, runValidators: true }
    );
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });
    await writeAudit({
      actor: req.user,
      action: "order_support.status_updated",
      targetType: "order_conversation",
      targetId: conversation._id,
      tenantId: conversation.tenantId,
      details: { status: conversation.status }
    });
    res.json({ conversation });
  } catch (error) {
    next(error);
  }
});

api.get("/store/:slug", async (req, res, next) => {
  try {
    const tenant = await findActiveTenantBySlug(req.params.slug);
    if (!tenant) return res.status(404).json({ error: "Store not found." });
    const sections = await ProductSection.find({ tenantId: tenant._id, active: true }).sort({ displayOrder: 1, createdAt: 1 }).lean();
    const activeSectionIds = sections.map((section) => section._id);
    const products = await Product.find({
      tenantId: tenant._id,
      status: "active",
      isPublished: { $ne: false },
      $or: [{ sectionId: null }, { sectionId: { $in: activeSectionIds } }]
    }).sort({ createdAt: -1 }).lean();
    const loginPage = tenant.loginPage?.isPublished
      ? { ...defaultLoginPageSettings, ...(tenant.loginPage.published || {}) }
      : { ...defaultLoginPageSettings, companyName: tenant.name };
    res.json({
      tenant: {
        _id: tenant._id,
        name: tenant.name,
        slug: tenant.slug,
        category: tenant.category,
        description: tenant.description,
        loginPage
      },
      canonicalSlug: tenant.slug,
      sections,
      products
    });
  } catch (error) {
    next(error);
  }
});

api.get("/store/:slug/login-page", async (req, res, next) => {
  try {
    const tenant = await findActiveTenantBySlug(req.params.slug);
    if (!tenant) return res.status(404).json({ error: "Store not found." });
    const loginPage = tenant.loginPage?.isPublished
      ? { ...defaultLoginPageSettings, ...(tenant.loginPage.published || {}) }
      : { ...defaultLoginPageSettings, companyName: tenant.name };
    res.json({
      tenant: { name: tenant.name, slug: tenant.slug },
      loginPage,
      isPublished: Boolean(tenant.loginPage?.isPublished)
    });
  } catch (error) {
    next(error);
  }
});

api.post("/store/:slug/support/conversations", storeSupportRequestLimiter, async (req, res, next) => {
  try {
    const input = parseOrRespond(storeSupportRequestSchema, req.body, res);
    if (!input) return;
    const tenant = await findActiveTenantBySlug(req.params.slug);
    if (!tenant) return res.status(404).json({ error: "Store not found." });
    const conversation = await SupportConversation.create({
      tenantId: tenant._id,
      customerName: input.name,
      customerEmail: input.email,
      subject: "Store customer support",
      status: "open",
      lastMessage: input.body,
      lastMessageAt: new Date(),
      unreadByAdmin: true
    });
    try {
      const result = await appendSupportMessage(conversation, {
        role: "store_customer",
        name: input.name
      }, input.body);
      if (!result) throw new Error("Store support conversation could not be saved.");
      res.status(201).json({
        ...result,
        accessToken: createStoreSupportToken(conversation)
      });
    } catch (error) {
      try {
        await SupportMessage.deleteMany({ conversationId: conversation._id, tenantId: tenant._id });
        await SupportConversation.deleteOne({ _id: conversation._id, tenantId: tenant._id });
      } catch (rollbackError) {
        logError("Store support request rollback failed.", rollbackError);
        return res.status(500).json({ error: "The support request failed and requires administrator attention." });
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

api.get("/customer/store-support", authenticateStoreSupportCustomer, async (req, res, next) => {
  try {
    const { _id, tenantId } = req.storeSupportConversation;
    const conversation = await SupportConversation.findOneAndUpdate(
      { _id, tenantId, createdBy: null },
      { $set: { unreadByCustomer: false } },
      { new: true }
    ).populate("tenantId", "name").lean();
    if (!conversation) return res.status(404).json({ error: "Store support conversation not found." });
    await SupportMessage.updateMany(
      { conversationId: _id, tenantId, senderRole: "super_admin", readAt: null },
      { $set: { readAt: new Date() } }
    );
    const messages = await SupportMessage.find({ conversationId: _id, tenantId }).sort({ createdAt: 1 }).lean();
    res.json({ conversation, messages });
  } catch (error) {
    next(error);
  }
});

api.get("/customer/store-support/notifications", authenticateStoreSupportCustomer, (req, res) => {
  const { unreadByCustomer, lastMessage, lastMessageAt, customerName } = req.storeSupportConversation;
  res.json({ unread: unreadByCustomer, lastMessage, lastMessageAt, customerName });
});

api.post("/customer/store-support/messages", customerMessageLimiter, authenticateStoreSupportCustomer, async (req, res, next) => {
  try {
    const input = parseOrRespond(supportMessageSchema, req.body, res);
    if (!input) return;
    const result = await appendSupportMessage(req.storeSupportConversation, {
      role: "store_customer",
      name: req.storeSupportConversation.customerName
    }, input.body);
    if (!result) return res.status(404).json({ error: "Store support conversation not found." });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

api.post("/store/:slug/orders/:orderNumber/chat/access", customerAccessLimiter, async (req, res, next) => {
  try {
    const input = parseOrRespond(orderChatAccessSchema, req.body, res);
    if (!input) return;
    const tenant = await findActiveTenantBySlug(req.params.slug);
    if (!tenant) return res.status(404).json({ error: "Store or order not found." });
    const order = await Order.findOne({
      tenantId: tenant._id,
      orderNumber: req.params.orderNumber.trim().toUpperCase()
    }).select("_id +customerId customer.name customer.phone orderNumber total fulfillmentStatus paymentStatus createdAt");
    if (!order
      || normalizeCustomerName(order.customer.name) !== normalizeCustomerName(input.name)
      || normalizePhone(order.customer.phone) !== normalizePhone(input.phone)) {
      return res.status(404).json({ error: "Order not found. Check the order number, name, and phone number." });
    }
    if (order.customerId) {
      const customer = await customerFromRequest(req);
      if (!customer || !customer._id.equals(order.customerId)) {
        return res.status(401).json({ error: "Sign in to the customer account that placed this order." });
      }
    }
    const conversation = await Conversation.findOne({ tenantId: tenant._id, orderId: order._id });
    if (!conversation) return res.status(404).json({ error: "Customer support is unavailable for this order." });
    res.json({ accessToken: createOrderChatToken(conversation, order.customerId), order });
  } catch (error) {
    next(error);
  }
});

api.get("/customer/order-chat", authenticateOrderCustomer, async (req, res, next) => {
  try {
    const tenant = await Tenant.exists({ _id: req.customerOrder.tenantId, status: "active" });
    if (!tenant) return res.status(403).json({ error: "This store is currently unavailable." });
    const conversation = await Conversation.findOneAndUpdate(
      { _id: req.orderConversation._id, orderId: req.customerOrder._id, tenantId: req.customerOrder.tenantId },
      {
        $set: {
          unreadByCustomer: false,
          "messages.$[message].readByCustomerAt": new Date()
        }
      },
      { new: true, arrayFilters: [{ "message.sender": { $ne: "customer" }, "message.readByCustomerAt": null }] }
    );
    if (!conversation) return res.status(404).json({ error: "Order conversation not found." });
    res.json({ conversation, order: req.customerOrder });
  } catch (error) {
    next(error);
  }
});

api.post("/customer/order-chat/messages", customerMessageLimiter, authenticateOrderCustomer, async (req, res, next) => {
  try {
    const input = parseOrRespond(orderChatMessageSchema, req.body, res);
    if (!input) return;
    const conversation = await Conversation.findOneAndUpdate(
      { _id: req.orderConversation._id, orderId: req.customerOrder._id, tenantId: req.customerOrder.tenantId },
      {
        $push: { messages: { sender: "customer", senderName: req.customerOrder.customer.name, body: input.body } },
        $set: { unreadByMerchant: true, unreadByAdmin: true, unreadByCustomer: false, status: "open" }
      },
      { new: true }
    );
    if (!conversation) return res.status(404).json({ error: "Order conversation not found." });
    res.status(201).json({ conversation });
  } catch (error) {
    next(error);
  }
});

api.post("/store/:slug/orders", authLimiter, authenticateCustomer, async (req, res, next) => {
  const reservedItems = [];
  let createdOrder = null;
  let input = null;
  async function rollbackReservations() {
    if (!reservedItems.length) return;
    const reservations = reservedItems.splice(0, reservedItems.length);
    await restoreReservations(reservations);
  }
  try {
    input = parseOrRespond(orderSchema, req.body, res);
    if (!input) return;
    const orderLines = input.items || [{ productId: input.productId, variantId: input.variantId, quantity: input.quantity }];
    const key = req.get("Idempotency-Key");
    if (!key || key.length < 12 || key.length > 100) {
      return res.status(400).json({ error: "A valid Idempotency-Key header is required." });
    }
    const tenant = await findActiveTenantBySlug(req.params.slug);
    if (!tenant) return res.status(404).json({ error: "Store not found." });
    const existing = await Order.findOne({ tenantId: tenant._id, idempotencyKey: key }).select("+customerId");
    if (existing) {
      if (!existing.customerId?.equals(req.customer._id)) {
        return res.status(409).json({ error: "This checkout key belongs to a different customer order." });
      }
      if (normalizeCustomerName(existing.customer.name) !== normalizeCustomerName(input.customer.name)
        || normalizePhone(existing.customer.phone) !== normalizePhone(input.customer.phone)) {
        return res.status(409).json({ error: "This checkout key belongs to a different customer order." });
      }
      const conversation = await Conversation.findOne({ tenantId: tenant._id, orderId: existing._id });
      return res.status(200).json({
        order: existing,
        duplicate: true,
        accessToken: conversation ? createOrderChatToken(conversation, req.customer._id) : null
      });
    }

    const productIds = [...new Set(orderLines.map((line) => line.productId))];
    const selectedProducts = await Product.find({
      _id: { $in: productIds },
      tenantId: tenant._id,
      status: "active",
      isPublished: { $ne: false }
    }).lean();
    const productById = new Map(selectedProducts.map((product) => [String(product._id), product]));
    if (selectedProducts.length !== productIds.length) return res.status(409).json({ error: "One or more products are no longer available." });
    const sectionIds = [...new Set(selectedProducts.map((product) => product.sectionId).filter(Boolean).map(String))];
    const activeSections = sectionIds.length
      ? await ProductSection.find({ _id: { $in: sectionIds }, tenantId: tenant._id, active: true }).select("_id name").lean()
      : [];
    const sectionById = new Map(activeSections.map((section) => [String(section._id), section]));
    for (const product of selectedProducts) {
      if (product.sectionId && !sectionById.has(String(product.sectionId))) {
        return res.status(409).json({ error: "One or more product sections are no longer available." });
      }
    }
    for (const line of orderLines) {
      const product = productById.get(line.productId);
      if (!product?.variants.some((variant) => String(variant._id) === line.variantId)) {
        return res.status(409).json({ error: "One or more product options are no longer available." });
      }
    }

    const snapshots = [];
    for (const line of orderLines) {
      const selectedProduct = productById.get(line.productId);
      const reserved = await Product.findOneAndUpdate(
        {
          _id: line.productId,
          tenantId: tenant._id,
          status: "active",
          isPublished: { $ne: false },
          sectionId: selectedProduct.sectionId || null,
          variants: { $elemMatch: { _id: line.variantId, stock: { $gte: line.quantity } } }
        },
        { $inc: { "variants.$.stock": -line.quantity } },
        { new: true }
      );
      if (!reserved) {
        await rollbackReservations();
        return res.status(409).json({ error: "A selected product option is unavailable or has insufficient stock." });
      }
      const variant = reserved.variants.id(line.variantId);
      const section = reserved.sectionId ? sectionById.get(String(reserved.sectionId)) : null;
      if (reserved.sectionId && (!section || !await ProductSection.exists({
        _id: reserved.sectionId,
        tenantId: tenant._id,
        active: true
      }))) {
        reservedItems.push({ productId: reserved._id, tenantId: tenant._id, variantId: variant._id, quantity: line.quantity });
        await rollbackReservations();
        return res.status(409).json({ error: "A selected product section is no longer available." });
      }
      const regularPrice = variant.price ?? reserved.price;
      const unitPrice = reserved.promotionalPrice == null ? regularPrice : Math.min(regularPrice, reserved.promotionalPrice);
      const itemSubtotal = calculateSubtotal(unitPrice, line.quantity);
      snapshots.push({
        productId: reserved._id,
        variantId: variant._id,
        name: reserved.name,
        variant: [
          variant.size,
          variant.color,
          ...(variant.attributes || []).map(({ name, value }) => `${name}: ${value}`)
        ].filter(Boolean).join(" / ") || variant.sku,
        sku: variant.sku,
        size: variant.size,
        color: variant.color,
        variantAttributes: variant.attributes || [],
        sectionName: section?.name || reserved.category,
        quantity: line.quantity,
        unitPrice,
        imageUrl: variant.imageUrl || reserved.imageUrl || reserved.images[0] || "",
        lineTotal: itemSubtotal
      });
      reservedItems.push({ productId: reserved._id, tenantId: tenant._id, variantId: variant._id, quantity: line.quantity });
    }

    const subtotal = roundCurrency(snapshots.reduce((sum, item) => sum + item.lineTotal, 0));
    const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const order = await Order.create({
      tenantId: tenant._id,
      customerId: req.customer._id,
      orderNumber,
      idempotencyKey: key,
      customer: { ...input.customer, email: req.customer.email },
      item: snapshots[0],
      items: snapshots,
      subtotal,
      deliveryFee: 0,
      paymentMethod: input.paymentMethod,
      total: subtotal
    });
    createdOrder = order;
    await CustomerAccount.updateOne({ _id: req.customer._id }, { $set: { phone: input.customer.phone } });
    const conversation = await Conversation.create({
      tenantId: tenant._id,
      orderId: order._id,
      customerName: input.customer.name,
      customerPhone: input.customer.phone,
      unreadByMerchant: true,
      unreadByAdmin: true,
      messages: [{
        sender: "customer",
        senderName: input.customer.name,
        body: `Order ${orderNumber} placed. Payment is awaiting verification.`
      }]
    });
    return res.status(201).json({
      order,
      accessToken: createOrderChatToken(conversation, req.customer._id),
      paymentNotice: "Payment integrations are not configured. This order remains pending payment."
    });
  } catch (error) {
    if (error.code === 11000 && reservedItems.length) {
      const reservedTenantId = reservedItems[0].tenantId;
      try {
        await rollbackReservations();
      } catch (rollbackError) {
        logError("Checkout stock rollback failed.", rollbackError);
        return res.status(500).json({ error: "Checkout failed and inventory rollback requires administrator attention." });
      }
      let existing;
      try {
        existing = await Order.findOne({ tenantId: reservedTenantId, idempotencyKey: req.get("Idempotency-Key") }).select("+customerId");
      } catch (lookupError) {
        return next(lookupError);
      }
      if (existing) {
        if (!existing.customerId?.equals(req.customer._id)) {
          return res.status(409).json({ error: "This checkout key belongs to a different customer order." });
        }
        if (normalizeCustomerName(existing.customer.name) !== normalizeCustomerName(input.customer.name)
          || normalizePhone(existing.customer.phone) !== normalizePhone(input.customer.phone)) {
          return res.status(409).json({ error: "This checkout key belongs to a different customer order." });
        }
        const conversation = await Conversation.findOne({ tenantId: reservedTenantId, orderId: existing._id });
        return res.status(200).json({ order: existing, duplicate: true, accessToken: conversation ? createOrderChatToken(conversation, req.customer._id) : null });
      }
    }
    try {
      if (createdOrder) {
        const deletion = await Order.deleteOne({ _id: createdOrder._id, tenantId: createdOrder.tenantId });
        if (deletion.deletedCount !== 1) throw new Error("The failed checkout order could not be removed.");
      }
      await rollbackReservations();
    } catch (rollbackError) {
      logError("Checkout record or inventory rollback failed.", rollbackError);
      return res.status(500).json({ error: "Checkout failed and inventory rollback requires administrator attention." });
    }
    return next(error);
  }
});

app.use((req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` }));
app.use((error, _req, res, _next) => {
  logError("API request failed.", error);
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Request body must contain valid JSON." });
  }
  if (error.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body is too large." });
  }
  if (error.name === "ValidationError" || error.name === "CastError") {
    return res.status(400).json({ error: "The submitted data is invalid." });
  }
  return res.status(500).json({ error: "An unexpected server error occurred." });
});

export default app;
