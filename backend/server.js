import "dotenv/config";
import mongoose from "mongoose";
import app from "./src/app.js";
import { configureMongoDns } from "./src/mongodb-dns.js";
import { getActivePaymentCredentialKeyId } from "./src/payment-credentials.js";

const port = Number(process.env.PORT || 4000);
const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  throw new Error("MONGODB_URI must be configured before starting the API.");
}
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be configured with at least 32 characters.");
}
getActivePaymentCredentialKeyId();

configureMongoDns();
await mongoose.connect(mongoUri);
const server = app.listen(port, () => {
  console.log(`Aura API listening on port ${port}`);
});

const shutdown = async () => {
  server.close(async () => {
    await mongoose.disconnect();
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
