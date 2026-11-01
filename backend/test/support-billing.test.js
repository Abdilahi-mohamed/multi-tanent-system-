import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { SupportConversation, SupportMessage, Tenant } from "../src/models.js";

test("business billing terms validate and reject malformed currency codes", () => {
  const tenant = new Tenant({
    name: "Example Store",
    slug: "example-store",
    ownerName: "Example Owner",
    email: "owner@example.com",
    subscriptionFee: 49.95,
    billingCurrency: "USD",
    billingFrequency: "monthly"
  });

  assert.equal(tenant.validateSync(), undefined);
  assert.equal(tenant.subscriptionFee, 49.95);

  tenant.billingCurrency = "US";
  assert.ok(tenant.validateSync().errors.billingCurrency);
});

test("business support records retain their authenticated sender association", () => {
  const tenantId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const conversation = new SupportConversation({
    tenantId,
    createdBy: userId,
    subject: "Unable to update products",
    lastMessage: "Please help resolve this issue."
  });
  const message = new SupportMessage({
    conversationId: conversation._id,
    tenantId,
    senderId: userId,
    senderRole: "business_owner",
    senderName: "Example Owner",
    body: "Please help resolve this issue."
  });

  assert.equal(conversation.validateSync(), undefined);
  assert.equal(message.validateSync(), undefined);
  assert.equal(message.readAt, null);

  conversation.status = "closed";
  assert.ok(conversation.validateSync().errors.status);
  message.senderRole = "anonymous";
  assert.ok(message.validateSync().errors.senderRole);
});

test("storefront customer support records can be replied to by Super Admins", () => {
  const tenantId = new mongoose.Types.ObjectId();
  const conversation = new SupportConversation({
    tenantId,
    customerName: "Store Customer",
    customerEmail: "customer@example.com",
    subject: "Store customer support",
    lastMessage: "I have a question about this store."
  });
  const message = new SupportMessage({
    conversationId: conversation._id,
    tenantId,
    senderRole: "store_customer",
    senderName: "Store Customer",
    body: "I have a question about this store."
  });

  assert.equal(conversation.validateSync(), undefined);
  assert.equal(conversation.createdBy, null);
  assert.equal(conversation.customerEmail, "customer@example.com");
  assert.equal(message.validateSync(), undefined);
  assert.equal(message.senderId, null);
});
