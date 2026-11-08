import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";
const currentVersion = 2;
const configurationErrorCodes = new Set([
  "PAYMENT_CREDENTIAL_ENCRYPTION_KEY_MISSING",
  "PAYMENT_CREDENTIAL_ENCRYPTION_KEYRING_INVALID",
  "PAYMENT_CREDENTIAL_ENCRYPTION_KEY_ID_INVALID",
  "PAYMENT_CREDENTIAL_ENCRYPTION_KEY_UNAVAILABLE"
]);

function configurationError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function keyId() {
  const id = process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY_ID || "legacy";
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(id)) {
    throw configurationError(
      "PAYMENT_CREDENTIAL_ENCRYPTION_KEY_ID must be 1-64 letters, numbers, dots, underscores, or hyphens.",
      "PAYMENT_CREDENTIAL_ENCRYPTION_KEY_ID_INVALID"
    );
  }
  return id;
}

function configuredKey(value, id) {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") < 32) {
    throw configurationError(
      `Payment credential encryption key "${id}" must contain at least 32 bytes.`,
      "PAYMENT_CREDENTIAL_ENCRYPTION_KEY_MISSING"
    );
  }
  return createHash("sha256").update(value, "utf8").digest();
}

function keyFor(id) {
  let previousKeys = {};
  const configuredKeyring = process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEYRING;
  if (configuredKeyring) {
    try {
      previousKeys = JSON.parse(configuredKeyring);
      if (!previousKeys || Array.isArray(previousKeys) || typeof previousKeys !== "object") {
        throw new Error("Keyring must be an object.");
      }
    } catch {
      throw configurationError(
        "PAYMENT_CREDENTIAL_ENCRYPTION_KEYRING must be a JSON object of key IDs to secret values.",
        "PAYMENT_CREDENTIAL_ENCRYPTION_KEYRING_INVALID"
      );
    }
    for (const [configuredId, value] of Object.entries(previousKeys)) {
      if (!/^[A-Za-z0-9._-]{1,64}$/.test(configuredId) || typeof value !== "string" || Buffer.byteLength(value, "utf8") < 32) {
        throw configurationError(
          "Every payment credential keyring entry must have a valid key ID and a secret of at least 32 bytes.",
          "PAYMENT_CREDENTIAL_ENCRYPTION_KEYRING_INVALID"
        );
      }
    }
  }

  const activeId = keyId();
  if (id === activeId) {
    return configuredKey(process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY, activeId);
  }
  if (Object.hasOwn(previousKeys, id)) {
    return configuredKey(previousKeys[id], id);
  }
  throw configurationError(
    `Payment credential encryption key "${id}" is not available in the configured keyring.`,
    "PAYMENT_CREDENTIAL_ENCRYPTION_KEY_UNAVAILABLE"
  );
}

function associatedData(context) {
  if (!context || !context.tenantId || !context.provider || !context.field) {
    throw new TypeError("Payment credential encryption requires tenant, provider, and field context.");
  }
  return Buffer.from(JSON.stringify({
    version: currentVersion,
    tenantId: String(context.tenantId),
    provider: String(context.provider),
    field: String(context.field)
  }), "utf8");
}

export function isPaymentCredentialConfigurationError(error) {
  return configurationErrorCodes.has(error?.code);
}

export function getActivePaymentCredentialKeyId() {
  const id = keyId();
  keyFor(id);
  return id;
}

export function paymentCredentialHint(value) {
  if (typeof value !== "string") return "";
  const characters = [...value];
  return characters.length > 4 ? characters.slice(-4).join("") : "";
}

export function encryptPaymentCredential(value, context) {
  if (typeof value !== "string" || !value.length) {
    throw new TypeError("Payment credentials must be non-empty strings.");
  }
  const id = keyId();
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, keyFor(id), iv);
  cipher.setAAD(associatedData(context));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyId: id,
    version: currentVersion
  };
}

export function decryptPaymentCredential(encrypted, context) {
  const version = encrypted.version ?? 1;
  if (version !== 1 && version !== currentVersion) {
    throw new Error(`Unsupported payment credential envelope version "${version}".`);
  }
  const id = encrypted.keyId || "legacy";
  const decipher = createDecipheriv(algorithm, keyFor(id), Buffer.from(encrypted.iv, "base64"));
  if (version >= currentVersion) decipher.setAAD(associatedData(context));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
}
