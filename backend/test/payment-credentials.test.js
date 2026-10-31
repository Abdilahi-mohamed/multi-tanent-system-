import test from "node:test";
import assert from "node:assert/strict";
import { decryptPaymentCredential, encryptPaymentCredential } from "../src/payment-credentials.js";

test("payment credentials are encrypted and can only be decrypted with the configured key", () => {
  const originalKey = process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY;
  process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY = "test-encryption-key-with-at-least-32-bytes";

  try {
    const value = "sensitive-provider-api-key";
    const encrypted = encryptPaymentCredential(value);
    assert.notEqual(encrypted.ciphertext, Buffer.from(value).toString("base64"));
    assert.equal(decryptPaymentCredential(encrypted), value);

    process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY = "a-different-test-encryption-key-of-32-bytes";
    assert.throws(() => decryptPaymentCredential(encrypted));
  } finally {
    if (originalKey === undefined) delete process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY;
    else process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY = originalKey;
  }
});

test("payment credential encryption requires an application encryption key", () => {
  const originalKey = process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY;
  delete process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY;

  try {
    assert.throws(
      () => encryptPaymentCredential("sensitive-provider-api-key"),
      { code: "PAYMENT_CREDENTIAL_ENCRYPTION_KEY_MISSING" }
    );
  } finally {
    if (originalKey !== undefined) process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY = originalKey;
  }
});
