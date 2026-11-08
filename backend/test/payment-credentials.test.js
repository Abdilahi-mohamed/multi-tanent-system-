import test from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import {
  decryptPaymentCredential,
  encryptPaymentCredential,
  getActivePaymentCredentialKeyId,
  paymentCredentialHint
} from "../src/payment-credentials.js";
import { TenantPaymentProvider } from "../src/models.js";
import { paymentProviderSummary } from "../src/app.js";

const context = {
  tenantId: "tenant-123",
  provider: "zaad",
  field: "secret_api_key"
};
const envNames = [
  "PAYMENT_CREDENTIAL_ENCRYPTION_KEY",
  "PAYMENT_CREDENTIAL_ENCRYPTION_KEY_ID",
  "PAYMENT_CREDENTIAL_ENCRYPTION_KEYRING"
];

function saveEnvironment() {
  return Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
}

function restoreEnvironment(original) {
  for (const [name, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

test("payment credentials use authenticated AES-256-GCM and tenant-bound context", () => {
  const original = saveEnvironment();
  process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY = "test-encryption-key-with-at-least-32-bytes";
  process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY_ID = "test-v1";
  delete process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEYRING;

  try {
    const value = "sensitive-provider-api-key";
    const encrypted = encryptPaymentCredential(value, context);
    assert.equal(encrypted.version, 2);
    assert.equal(encrypted.keyId, "test-v1");
    assert.notEqual(encrypted.ciphertext, Buffer.from(value).toString("base64"));
    assert.equal(decryptPaymentCredential(encrypted, context), value);
    assert.throws(() => decryptPaymentCredential(encrypted, { ...context, tenantId: "other-tenant" }));

    process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY = "a-different-test-encryption-key-of-32-bytes";
    assert.throws(() => decryptPaymentCredential(encrypted, context));
  } finally {
    restoreEnvironment(original);
  }
});

test("payment credentials remain decryptable during key rotation and can be re-encrypted", () => {
  const original = saveEnvironment();
  const previousKey = "previous-encryption-key-with-at-least-32-bytes";
  process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY = previousKey;
  process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY_ID = "old-key";
  delete process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEYRING;

  try {
    const oldEnvelope = encryptPaymentCredential("sensitive-merchant-token", {
      ...context,
      field: "secret_merchant_token"
    });
    const newKey = "new-encryption-key-with-at-least-32-bytes";
    process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY = newKey;
    process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY_ID = "new-key";
    process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEYRING = JSON.stringify({ "old-key": previousKey });

    assert.equal(getActivePaymentCredentialKeyId(), "new-key");
    const contextForToken = { ...context, field: "secret_merchant_token" };
    const plaintext = decryptPaymentCredential(oldEnvelope, contextForToken);
    const rotated = encryptPaymentCredential(plaintext, contextForToken);
    assert.equal(rotated.keyId, "new-key");
    assert.equal(decryptPaymentCredential(rotated, contextForToken), plaintext);
  } finally {
    restoreEnvironment(original);
  }
});

test("legacy unversioned payment credentials remain decryptable during migration", () => {
  const original = saveEnvironment();
  const key = "legacy-encryption-key-with-at-least-32-bytes";
  process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY = key;
  process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY_ID = "legacy";
  delete process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEYRING;

  try {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(key).digest(), iv);
    const ciphertext = Buffer.concat([
      cipher.update("legacy-provider-secret", "utf8"),
      cipher.final()
    ]);
    assert.equal(decryptPaymentCredential({
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64")
    }), "legacy-provider-secret");
  } finally {
    restoreEnvironment(original);
  }
});

test("payment credential encryption requires an application encryption key", () => {
  const original = saveEnvironment();
  delete process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY;
  process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY_ID = "test-key";

  try {
    assert.throws(
      () => encryptPaymentCredential("sensitive-provider-api-key", context),
      { code: "PAYMENT_CREDENTIAL_ENCRYPTION_KEY_MISSING" }
    );
  } finally {
    restoreEnvironment(original);
  }
});

test("credential hints never expose secrets of four characters or fewer", () => {
  assert.equal(paymentCredentialHint("1234"), "");
  assert.equal(paymentCredentialHint("a"), "");
  assert.equal(paymentCredentialHint(""), "");
  assert.equal(paymentCredentialHint("key-secret-1234"), "1234");
});

test("payment credential ciphertext paths are excluded from default MongoDB queries", () => {
  for (const prefix of ["apiKey", "merchantToken", "webhook"]) {
    for (const suffix of ["Ciphertext", "Iv", "AuthTag", "KeyId", "Version", "Hint", "HintSafe"]) {
      assert.equal(TenantPaymentProvider.schema.path(`${prefix}${suffix}`).options.select, false);
    }
  }
  assert.equal(TenantPaymentProvider.schema.path("apiKey"), undefined);
  assert.equal(TenantPaymentProvider.schema.path("merchantToken"), undefined);
  assert.equal(TenantPaymentProvider.schema.path("webhookSecret"), undefined);
});

test("payment provider API summaries never return legacy short-secret hints", () => {
  const summary = paymentProviderSummary({
    _id: "provider-1",
    provider: "zaad",
    apiKeyHint: "1234",
    apiKeyHintSafe: false,
    merchantTokenHint: "tokn",
    merchantTokenHintSafe: false,
    webhookHint: "hook",
    webhookHintSafe: false,
    commissionRate: 2.5,
    enabled: true
  });

  assert.equal(summary.apiKeyConfigured, true);
  assert.equal(summary.apiKeyHint, "");
  assert.equal(summary.merchantTokenHint, "");
  assert.equal(summary.webhookHint, "");
  assert.equal(JSON.stringify(summary).includes("1234"), false);
  assert.equal(summary.connectionStatus, "requires_attention");
});
