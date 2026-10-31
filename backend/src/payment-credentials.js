import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";

function encryptionKey() {
  const configuredKey = process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY;
  if (!configuredKey || Buffer.byteLength(configuredKey, "utf8") < 32) {
    const error = new Error("PAYMENT_CREDENTIAL_ENCRYPTION_KEY must contain at least 32 bytes.");
    error.code = "PAYMENT_CREDENTIAL_ENCRYPTION_KEY_MISSING";
    throw error;
  }
  return createHash("sha256").update(configuredKey, "utf8").digest();
}

export function encryptPaymentCredential(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64")
  };
}

export function decryptPaymentCredential({ ciphertext, iv, authTag }) {
  const decipher = createDecipheriv(algorithm, encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
}
