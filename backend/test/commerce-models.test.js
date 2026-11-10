import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { Conversation, CustomerAccount, Order, Product, ProductSection, Tenant } from "../src/models.js";

test("customer accounts are unique by email and keep password hashes out of normal queries", () => {
  const customer = new CustomerAccount({
    name: "Store Customer",
    email: "CUSTOMER@example.com",
    passwordHash: "bcrypt-hash"
  });

  assert.equal(customer.validateSync(), undefined);
  assert.equal(customer.email, "customer@example.com");
  assert.equal(customer.phone, "");
  assert.equal(customer.accountStatus, "active");
  assert.equal(customer.lastLoginAt, null);
  assert.equal(CustomerAccount.schema.path("email").options.unique, true);
  assert.equal(CustomerAccount.schema.path("passwordHash").options.select, false);
  assert.equal(CustomerAccount.schema.path("googleSub").options.select, false);
  assert.equal(CustomerAccount.schema.path("role"), undefined);

  customer.accountStatus = "suspended";
  assert.equal(customer.validateSync(), undefined);
  customer.accountStatus = "super_admin";
  assert.ok(customer.validateSync().errors.accountStatus);
});

test("product sections and their dynamic variants validate with tenant associations", () => {
  const tenantId = new mongoose.Types.ObjectId();
  const section = new ProductSection({ tenantId, name: "Shirts", displayOrder: 1 });
  const product = new Product({
    tenantId,
    sectionId: section._id,
    name: "Linen shirt",
    price: 25,
    images: ["https://example.com/shirt.jpg"],
    variants: [{
      size: "M",
      color: "Blue",
      attributes: [{ name: "Material", value: "Linen" }],
      sku: "LINEN-M-BLUE",
      stock: 3,
      price: 27
    }]
  });

  assert.equal(section.validateSync(), undefined);
  assert.equal(product.validateSync(), undefined);
  assert.equal(product.variants[0].price, 27);
  assert.equal(product.variants[0].stock, 3);
  assert.deepEqual(product.variants[0].attributes[0].toObject(), { name: "Material", value: "Linen" });

  product.variants[0].stock = -1;
  assert.ok(product.validateSync().errors["variants.0.stock"]);
});

test("storefront login branding is stored independently for each tenant", () => {
  const tenantA = new Tenant({
    name: "Company A",
    slug: "company-a",
    ownerName: "Owner A",
    email: "owner-a@example.com",
    loginPage: { draft: { companyName: "Company A", primaryColor: "#123456" } }
  });
  const tenantB = new Tenant({
    name: "Company B",
    slug: "company-b",
    ownerName: "Owner B",
    email: "owner-b@example.com",
    loginPage: { draft: { companyName: "Company B", primaryColor: "#654321" } }
  });

  assert.equal(tenantA.validateSync(), undefined);
  assert.equal(tenantB.validateSync(), undefined);
  assert.equal(tenantA.loginPage.draft.companyName, "Company A");
  assert.equal(tenantB.loginPage.draft.companyName, "Company B");
  assert.notEqual(tenantA.loginPage.draft.primaryColor, tenantB.loginPage.draft.primaryColor);
  assert.equal(tenantA.loginPage.isPublished, false);
});

test("orders preserve customer delivery and exact purchased variant snapshots", () => {
  const tenantId = new mongoose.Types.ObjectId();
  const productId = new mongoose.Types.ObjectId();
  const variantId = new mongoose.Types.ObjectId();
  const secondProductId = new mongoose.Types.ObjectId();
  const secondVariantId = new mongoose.Types.ObjectId();
  const customerId = new mongoose.Types.ObjectId();
  const order = new Order({
    tenantId,
    customerId,
    orderNumber: "ORD-TEST-1",
    idempotencyKey: "test-idempotency-key",
    customer: { name: "Store Customer", phone: "+123456789", email: "customer@example.com", address: "12 Main Street" },
    item: {
      productId,
      variantId,
      name: "Linen shirt",
      variant: "M / Blue",
      variantAttributes: [{ name: "Material", value: "Linen" }],
      sku: "LINEN-M-BLUE",
      size: "M",
      color: "Blue",
      sectionName: "Shirts",
      quantity: 2,
      unitPrice: 27,
      lineTotal: 54,
      imageUrl: "https://example.com/shirt-blue.jpg"
    },
    items: [
      {
        productId,
        variantId,
        name: "Linen shirt",
        variant: "M / Blue",
        variantAttributes: [{ name: "Material", value: "Linen" }],
        sku: "LINEN-M-BLUE",
        size: "M",
        color: "Blue",
        sectionName: "Shirts",
        quantity: 2,
        unitPrice: 27,
        lineTotal: 54,
        imageUrl: "https://example.com/shirt-blue.jpg"
      },
      {
        productId: secondProductId,
        variantId: secondVariantId,
        name: "Cotton socks",
        sectionName: "Accessories",
        quantity: 1,
        unitPrice: 8,
        lineTotal: 8,
        imageUrl: "https://example.com/socks.jpg"
      }
    ],
    subtotal: 62,
    deliveryFee: 4,
    total: 66
  });

  assert.equal(order.validateSync(), undefined);
  assert.equal(order.item.imageUrl, "https://example.com/shirt-blue.jpg");
  assert.equal(order.item.sku, "LINEN-M-BLUE");
  assert.equal(order.item.variantAttributes[0].name, "Material");
  assert.equal(order.items[0].variantAttributes[0].value, "Linen");
  assert.equal(order.items.length, 2);
  assert.equal(order.total, 66);
  assert.equal(order.paymentStatus, "pending");
  assert.equal(String(order.customerId), String(customerId));
  assert.equal(Order.schema.path("customerId").options.select, false);
});

test("order support conversations retain tenant/order ownership and message read state", () => {
  const tenantId = new mongoose.Types.ObjectId();
  const orderId = new mongoose.Types.ObjectId();
  const conversation = new Conversation({
    tenantId,
    orderId,
    customerName: "Store Customer",
    customerPhone: "+123456789",
    messages: [{ sender: "customer", senderName: "Store Customer", body: "Where is my order?" }]
  });

  assert.equal(conversation.validateSync(), undefined);
  assert.equal(conversation.unreadByMerchant, true);
  assert.equal(conversation.unreadByAdmin, true);
  assert.equal(conversation.messages[0].readByCustomerAt, null);
  assert.equal(conversation.messages[0].senderName, "Store Customer");
});
