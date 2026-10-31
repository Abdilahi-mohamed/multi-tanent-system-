import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { z } from "zod";
import mongoose from "mongoose";
import { authenticate, createToken, requireRole } from "./auth.js";
import {
  AuditLog, Conversation, Order, Product, SupportConversation,
  SupportMessage, Tenant, TenantPaymentProvider, User
} from "./models.js";
import { calculateSubtotal } from "./commerce.js";
import { tenantIdFromSession, withSupportConversationScope, withTenantScope } from "./tenant-scope.js";
import { encryptPaymentCredential } from "./payment-credentials.js";

const app = express();
const api = express.Router();

app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:3000",
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"]
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
const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(254).optional(),
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9._-]+$/).optional(),
  password: z.string().min(1).max(128)
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
const supportStatusSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved"])
});
const productSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(3000).optional().default(""),
  category: z.string().trim().max(80).optional().default("General"),
  price: z.number().finite().nonnegative(),
  imageUrl: z.string().trim().url().max(1000).optional().or(z.literal("")).default(""),
  variants: z.array(
    z.object({
      sku: z.string().trim().max(80).optional().default(""),
      size: z.string().trim().max(40).optional().default(""),
      color: z.string().trim().max(40).optional().default(""),
      stock: z.number().int().nonnegative()
    })
  ).min(1).max(100)
});
const orderSchema = z.object({
  productId: z.string().regex(/^[a-f\d]{24}$/i),
  variantId: z.string().regex(/^[a-f\d]{24}$/i),
  quantity: z.number().int().min(1).max(50),
  customer: z.object({
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(5).max(40),
    address: z.string().trim().min(5).max(500),
    instructions: z.string().trim().max(500).optional().default("")
  })
});
const fulfillmentSchema = z.object({
  fulfillmentStatus: z.enum(["processing", "ready", "shipped", "delivered", "cancelled"])
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
  webhookSecret: z.string().trim().max(4096).optional(),
  commissionRate: z.coerce.number().finite().min(0).max(100),
  enabled: z.boolean()
});
const tenantPaymentProviders = ["zaad", "evc_plus", "edahab", "sahal", "sifalo_pay", "card", "bank_transfer"];

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

async function restoreStockReservation({ productId, tenantId, variantId, quantity }) {
  const result = await Product.updateOne(
    { _id: productId, tenantId, "variants._id": variantId },
    { $inc: { "variants.$.stock": quantity } }
  );
  if (result.matchedCount !== 1) {
    throw new Error("The reserved product variant could not be found during inventory restoration.");
  }
}

async function appendSupportMessage(conversation, user, body) {
  const message = await SupportMessage.create({
    conversationId: conversation._id,
    tenantId: conversation.tenantId,
    senderId: user._id,
    senderRole: user.role,
    senderName: user.name,
    body
  });
  const set = {
    lastMessage: message.body,
    lastMessageAt: message.createdAt,
    unreadByAdmin: user.role === "business_owner",
    unreadByBusiness: user.role === "super_admin"
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
      token: createToken(user),
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
      previousTenant = Object.fromEntries(Object.keys(input.business).map((field) => [field, tenant[field]]));
      Object.assign(tenant, input.business);
      await tenant.save();
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
    const tenant = await Tenant.findByIdAndUpdate(req.params.id, input, { new: true, runValidators: true });
    if (!tenant) return res.status(404).json({ error: "Business not found." });
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
      .select("provider apiKeyHint webhookHint commissionRate enabled createdAt updatedAt")
      .sort({ createdAt: 1 })
      .lean();
    res.json({ items });
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

    const query = { tenantId: tenant._id, provider: req.params.provider };
    let existing = await TenantPaymentProvider.findOne(query)
      .select("+apiKeyCiphertext +apiKeyIv +apiKeyAuthTag +webhookCiphertext +webhookIv +webhookAuthTag");
    if (!existing && !input.apiKey) {
      return res.status(400).json({ error: "Enter the provider API key to add this payment method." });
    }

    let encryptedApiKey;
    let encryptedWebhook;
    try {
      if (input.apiKey) encryptedApiKey = encryptPaymentCredential(input.apiKey);
      if (input.webhookSecret) encryptedWebhook = encryptPaymentCredential(input.webhookSecret);
    } catch (error) {
      if (error.code !== "PAYMENT_CREDENTIAL_ENCRYPTION_KEY_MISSING") throw error;
      return res.status(503).json({
        error: "Payment credential encryption is not configured. Set PAYMENT_CREDENTIAL_ENCRYPTION_KEY on the API server."
      });
    }

    const values = {
      tenantId: tenant._id,
      provider: req.params.provider,
      commissionRate: input.commissionRate,
      enabled: input.enabled,
      updatedBy: req.user._id
    };
    if (encryptedApiKey) {
      values.apiKeyCiphertext = encryptedApiKey.ciphertext;
      values.apiKeyIv = encryptedApiKey.iv;
      values.apiKeyAuthTag = encryptedApiKey.authTag;
      values.apiKeyHint = input.apiKey.slice(-4);
    }
    if (encryptedWebhook) {
      values.webhookCiphertext = encryptedWebhook.ciphertext;
      values.webhookIv = encryptedWebhook.iv;
      values.webhookAuthTag = encryptedWebhook.authTag;
      values.webhookHint = input.webhookSecret.slice(-4);
    }
    if (existing) {
      Object.assign(existing, values);
      await existing.save();
    } else {
      existing = await TenantPaymentProvider.create(values);
    }
    await writeAudit({
      actor: req.user,
      action: "tenant_payment_provider.saved",
      targetType: "payment_provider",
      targetId: existing._id,
      tenantId: tenant._id,
      details: { provider: existing.provider, enabled: existing.enabled }
    });
    res.json({
      item: {
        _id: existing._id,
        provider: existing.provider,
        apiKeyHint: existing.apiKeyHint,
        webhookHint: existing.webhookHint,
        webhookConfigured: Boolean(existing.webhookCiphertext),
        commissionRate: existing.commissionRate,
        enabled: existing.enabled,
        createdAt: existing.createdAt,
        updatedAt: existing.updatedAt
      }
    });
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
    const items = await Product.find(withTenantScope(req.user)).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean();
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

api.post("/tenant/products", authenticate, requireRole("business_owner"), async (req, res, next) => {
  try {
    const input = parseOrRespond(productSchema, req.body, res);
    if (!input) return;
    const product = await Product.create({ ...input, tenantId: tenantIdFor(req.user) });
    await writeAudit({ actor: req.user, action: "product.created", targetType: "product", targetId: product._id, tenantId: product.tenantId });
    res.status(201).json({ product });
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
          let restoration;
          try {
            restoration = await Product.updateOne(
              {
                _id: cancelledOrder.item.productId,
                tenantId,
                variants: { $elemMatch: { _id: cancelledOrder.item.variantId } }
              },
              { $inc: { "variants.$.stock": cancelledOrder.item.quantity } }
            );
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
          if (restoration.matchedCount !== 1) {
            const rollback = await Order.updateOne(
              { _id: cancelledOrder._id, inventoryRestoredAt: cancellationTime },
              { $set: { fulfillmentStatus: order.fulfillmentStatus }, $unset: { inventoryRestoredAt: 1 } }
            );
            if (rollback.matchedCount !== 1) {
              console.error("Cancellation rollback needs administrator attention.", { orderId: String(cancelledOrder._id) });
              return res.status(500).json({ error: "Inventory restoration failed and order rollback requires administrator attention." });
            }
            return res.status(500).json({ error: "Inventory could not be restored. The cancellation was rolled back." });
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
        senderRole: "business_owner",
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

api.post("/tenant/conversations/:id/messages", authenticate, requireRole("business_owner"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid conversation ID." });
    const input = parseOrRespond(z.object({ body: z.string().trim().min(1).max(2000) }), req.body, res);
    if (!input) return;
    const conversation = await Conversation.findOneAndUpdate(
      withTenantScope(req.user, { _id: req.params.id }),
      { $push: { messages: { sender: "merchant", body: input.body } } },
      { new: true }
    );
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });
    res.json({ conversation });
  } catch (error) {
    next(error);
  }
});

api.get("/store/:slug", async (req, res, next) => {
  try {
    const tenant = await Tenant.findOne({ slug: req.params.slug.toLowerCase(), status: "active" }).select("name slug description category");
    if (!tenant) return res.status(404).json({ error: "Store not found." });
    const products = await Product.find({ tenantId: tenant._id, status: "active" }).sort({ createdAt: -1 }).lean();
    res.json({ tenant, products });
  } catch (error) {
    next(error);
  }
});

api.post("/store/:slug/orders", authLimiter, async (req, res, next) => {
  let reserved = null;
  let createdOrder = null;
  let input = null;
  try {
    input = parseOrRespond(orderSchema, req.body, res);
    if (!input) return;
    const key = req.get("Idempotency-Key");
    if (!key || key.length < 12 || key.length > 100) {
      return res.status(400).json({ error: "A valid Idempotency-Key header is required." });
    }
    const tenant = await Tenant.findOne({ slug: req.params.slug.toLowerCase(), status: "active" }).select("_id");
    if (!tenant) return res.status(404).json({ error: "Store not found." });
    const existing = await Order.findOne({ tenantId: tenant._id, idempotencyKey: key });
    if (existing) return res.status(200).json({ order: existing, duplicate: true });

    reserved = await Product.findOneAndUpdate(
      {
        _id: input.productId,
        tenantId: tenant._id,
        status: "active",
        variants: { $elemMatch: { _id: input.variantId, stock: { $gte: input.quantity } } }
      },
      { $inc: { "variants.$.stock": -input.quantity } },
      { new: true }
    );
    if (!reserved) return res.status(409).json({ error: "This product option is unavailable or has insufficient stock." });
    const variant = reserved.variants.id(input.variantId);
    const subtotal = calculateSubtotal(reserved.price, input.quantity);
    const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const order = await Order.create({
      tenantId: tenant._id,
      orderNumber,
      idempotencyKey: key,
      customer: input.customer,
      item: {
        productId: reserved._id,
        variantId: variant._id,
        name: reserved.name,
        variant: [variant.size, variant.color].filter(Boolean).join(" / ") || variant.sku,
        quantity: input.quantity,
        unitPrice: reserved.price,
        imageUrl: reserved.imageUrl
      },
      subtotal,
      deliveryFee: 0,
      total: subtotal
    });
    createdOrder = order;
    await Conversation.create({
      tenantId: tenant._id,
      orderId: order._id,
      customerName: input.customer.name,
      customerPhone: input.customer.phone,
      messages: [{ sender: "customer", body: `Order ${orderNumber} placed. Payment is awaiting verification.` }]
    });
    return res.status(201).json({ order, paymentNotice: "Payment integrations are not configured. This order remains pending payment." });
  } catch (error) {
    if (error.code === 11000 && reserved) {
      const reservedTenantId = reserved.tenantId;
      try {
        await restoreStockReservation({
          productId: reserved._id,
          tenantId: reserved.tenantId,
          variantId: input.variantId,
          quantity: input.quantity
        });
      } catch (rollbackError) {
        logError("Checkout stock rollback failed.", rollbackError);
        return res.status(500).json({ error: "Checkout failed and inventory rollback requires administrator attention." });
      }
      reserved = null;
      let existing;
      try {
        existing = await Order.findOne({ tenantId: reservedTenantId, idempotencyKey: req.get("Idempotency-Key") });
      } catch (lookupError) {
        return next(lookupError);
      }
      if (existing) return res.status(200).json({ order: existing, duplicate: true });
    }
    try {
      if (createdOrder) {
        const deletion = await Order.deleteOne({ _id: createdOrder._id, tenantId: createdOrder.tenantId });
        if (deletion.deletedCount !== 1) throw new Error("The failed checkout order could not be removed.");
      }
      if (reserved && input) {
        await restoreStockReservation({
          productId: reserved._id,
          tenantId: reserved.tenantId,
          variantId: input.variantId,
          quantity: input.quantity
        });
      }
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
