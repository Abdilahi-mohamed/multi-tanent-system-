import test from "node:test";
import assert from "node:assert/strict";
import { calculateSubtotal } from "../src/commerce.js";
import { tenantIdFromSession, withSupportConversationScope, withTenantScope } from "../src/tenant-scope.js";

test("tenant filters cannot be overridden by request-supplied tenant identifiers", () => {
  const authenticatedUser = { tenantId: "tenant-owned-by-session" };
  const scopedQuery = withTenantScope(authenticatedUser, {
    _id: "resource-id",
    tenantId: "another-tenant"
  });

  assert.equal(scopedQuery.tenantId, authenticatedUser.tenantId);
  assert.throws(() => tenantIdFromSession({ role: "business_owner" }), /tenant membership/);
});

test("support conversation filters are restricted to the authenticated user and tenant", () => {
  const authenticatedUser = { _id: "authorized-user", tenantId: "authorized-tenant" };
  const scopedQuery = withSupportConversationScope(authenticatedUser, {
    tenantId: "untrusted-tenant",
    createdBy: "untrusted-user"
  });

  assert.equal(scopedQuery.tenantId, authenticatedUser.tenantId);
  assert.equal(scopedQuery.createdBy, authenticatedUser._id);
  assert.throws(() => withSupportConversationScope({ _id: "user-without-tenant" }), /tenant membership/);
});

test("order subtotal uses trusted price and quantity rather than a submitted total", () => {
  const trustedPrice = 76;
  const quantity = 3;
  const submittedTotal = 1;
  const total = calculateSubtotal(trustedPrice, quantity);

  assert.equal(total, 228);
  assert.notEqual(total, submittedTotal);
  assert.throws(() => calculateSubtotal(trustedPrice, 0), /valid product price and quantity/);
});
