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

test("support records require a business and an authenticated sender association", () => {
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
