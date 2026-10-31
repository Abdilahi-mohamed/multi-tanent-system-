export function tenantIdFromSession(user) {
  if (!user?.tenantId) {
    throw new Error("An authenticated tenant membership is required.");
  }
  return user.tenantId;
}

export function withTenantScope(user, filter = {}) {
  return { ...filter, tenantId: tenantIdFromSession(user) };
}

export function withSupportConversationScope(user, filter = {}) {
  return {
    ...filter,
    tenantId: tenantIdFromSession(user),
    createdBy: user._id
  };
}
