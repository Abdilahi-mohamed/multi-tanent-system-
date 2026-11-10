import "dotenv/config";
import mongoose from "mongoose";
import { TenantPaymentProvider } from "../src/models.js";
import {
  decryptPaymentCredential,
  encryptPaymentCredential,
  getActivePaymentCredentialKeyId,
  paymentCredentialHint
} from "../src/payment-credentials.js";

const credentials = [
  { prefix: "apiKey", field: "secret_api_key" },
  { prefix: "merchantToken", field: "secret_merchant_token" },
  { prefix: "webhook", field: "private_webhook_secret" }
];

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  throw new Error("MONGODB_URI must be configured before rotating payment credentials.");
}

let rotated = 0;
const activeKeyId = getActivePaymentCredentialKeyId();

try {
  await mongoose.connect(mongoUri);
  const projection = credentials.flatMap(({ prefix }) => [
    `+${prefix}Ciphertext`,
    `+${prefix}Iv`,
    `+${prefix}AuthTag`,
    `+${prefix}KeyId`,
    `+${prefix}Version`
  ]).join(" ");
  const cursor = TenantPaymentProvider.find({}).select(projection).lean().cursor();

  for await (const provider of cursor) {
    for (const { prefix, field } of credentials) {
      const ciphertext = provider[`${prefix}Ciphertext`];
      if (!ciphertext) continue;

      const stored = {
        ciphertext,
        iv: provider[`${prefix}Iv`],
        authTag: provider[`${prefix}AuthTag`],
        keyId: provider[`${prefix}KeyId`] || "legacy",
        version: provider[`${prefix}Version`] ?? 1
      };
      if (stored.version === 2 && stored.keyId === activeKeyId) continue;

      const context = {
        tenantId: provider.tenantId,
        provider: provider.provider,
        field
      };
      const plaintext = decryptPaymentCredential(stored, context);
      const hint = paymentCredentialHint(plaintext);
      const update = {
        $set: {
          [`${prefix}Hint`]: hint,
          [`${prefix}HintSafe`]: Boolean(hint),
          [`${prefix}Configured`]: true
        }
      };
      if (stored.version !== 2 || stored.keyId !== activeKeyId) {
        const replacement = encryptPaymentCredential(plaintext, context);
        Object.assign(update.$set, {
          [`${prefix}Ciphertext`]: replacement.ciphertext,
          [`${prefix}Iv`]: replacement.iv,
          [`${prefix}AuthTag`]: replacement.authTag,
          [`${prefix}KeyId`]: replacement.keyId,
          [`${prefix}Version`]: replacement.version
        });
      }
      const result = await TenantPaymentProvider.updateOne(
        {
          _id: provider._id,
          [`${prefix}Ciphertext`]: stored.ciphertext,
          [`${prefix}Iv`]: stored.iv,
          [`${prefix}AuthTag`]: stored.authTag
        },
        update
      );
      if (result.matchedCount !== 1) {
        throw new Error("A credential changed during rotation; rerun the rotation after reviewing the partial progress.");
      }
      if (stored.version !== 2 || stored.keyId !== activeKeyId) rotated += 1;
    }
  }

  console.log(`Re-encrypted ${rotated} payment credential(s) with key ID "${activeKeyId}".`);
} catch (error) {
  console.error(`Payment credential rotation failed (${error.code || error.name}). Check configuration and database connectivity; no credentials were printed.`);
  process.exitCode = 1;
} finally {
  if (mongoose.connection.readyState) await mongoose.disconnect();
}
