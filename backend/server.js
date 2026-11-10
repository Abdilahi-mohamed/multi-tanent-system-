import "dotenv/config";
import mongoose from "mongoose";
import { createConnection } from "node:net";
import app from "./src/app.js";
import { configureMongoDns } from "./src/mongodb-dns.js";
import { getActivePaymentCredentialKeyId } from "./src/payment-credentials.js";

const port = Number(process.env.PORT || 4000);
const mongoUri = process.env.MONGODB_URI;

async function apiAlreadyHealthy() {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(2000)
    });
    if (!response.ok) return false;
    return (await response.json()).status === "healthy";
  } catch {
    return false;
  }
}

function portIsInUse() {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(1000);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", (error) => {
      resolve(!["ECONNREFUSED", "EHOSTUNREACH"].includes(error.code));
    });
  });
}

if (await apiAlreadyHealthy()) {
  console.log(`Aura API is already healthy on port ${port}; not starting a duplicate server.`);
  process.exit(0);
}
if (await portIsInUse()) {
  console.error(`Backend port ${port} is already occupied, but the API health check failed.`);
  process.exit(1);
}

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
