import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { Conversation, Order, Product, Tenant, User } from "../src/models.js";
import { configureMongoDns } from "../src/mongodb-dns.js";

if (!process.env.MONGODB_URI) throw new Error("Set MONGODB_URI before running the demo seed.");
if (!process.env.SEED_DEMO_PASSWORD || process.env.SEED_DEMO_PASSWORD.length < 12) {
  throw new Error("Set SEED_DEMO_PASSWORD to a password with at least 12 characters.");
}

configureMongoDns();
await mongoose.connect(process.env.MONGODB_URI);
try {
  const passwordHash = await bcrypt.hash(process.env.SEED_DEMO_PASSWORD, 12);
  const tenant = await Tenant.findOneAndUpdate(
    { slug: "aura-atelier" },
    {
      name: "Aura Atelier",
      slug: "aura-atelier",
      ownerName: "Hassan Noor",
      email: "owner@aura.example",
      phone: "+252 61 555 4321",
      category: "Fashion & Apparel",
      description: "Independent fashion and apparel storefront.",
      status: "active",
      demoRecord: true
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await User.findOneAndUpdate(
    { email: "owner@aura.example" },
    { name: "Hassan Noor", username: "owner", email: "owner@aura.example", passwordHash, role: "business_owner", tenantId: tenant._id, active: true },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await User.findOneAndUpdate(
    { email: "admin@aura.example" },
    { name: "Alex Vance", username: "admin", email: "admin@aura.example", passwordHash, role: "super_admin", tenantId: null, active: true },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const existingProducts = await Product.countDocuments({ tenantId: tenant._id });
  let product;
  if (!existingProducts) {
    product = await Product.create({
      tenantId: tenant._id,
      name: "Oxford Tailored Linen Shirt",
      category: "Shirts",
      description: "Lightweight tailored linen shirt.",
      price: 76,
      imageUrl: "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&w=800&q=80",
      variants: [
        { sku: "OXF-NAV-M", size: "M", color: "Navy", stock: 12 },
        { sku: "OXF-NAV-L", size: "L", color: "Navy", stock: 8 },
        { sku: "OXF-WHT-M", size: "M", color: "White", stock: 3 }
      ]
    });
  } else {
    product = await Product.findOne({ tenantId: tenant._id });
  }
  const ordersExist = await Order.countDocuments({ tenantId: tenant._id });
  if (!ordersExist && product) {
    const order = await Order.create({
      tenantId: tenant._id,
      orderNumber: "ORD-DEMO-8420",
      idempotencyKey: "seed-demo-order-key-8420",
      customer: { name: "Amina Farah", phone: "+252 61 555 4321", address: "Wadajir District, Mogadishu" },
      item: { productId: product._id, variantId: product.variants[0]._id, name: product.name, variant: "M / Navy", quantity: 1, unitPrice: product.price, imageUrl: product.imageUrl },
      subtotal: product.price,
      total: product.price,
      paymentStatus: "pending",
      fulfillmentStatus: "new"
    });
    await Conversation.create({
      tenantId: tenant._id,
      orderId: order._id,
      customerName: order.customer.name,
      customerPhone: order.customer.phone,
      messages: [
        { sender: "customer", body: "Can this be delivered before 5 PM today?" },
        { sender: "merchant", body: "We are checking the dispatch schedule now." }
      ]
    });
  }
  console.log("Demo data is ready: admin@aura.example and owner@aura.example");
} finally {
  await mongoose.disconnect();
}
