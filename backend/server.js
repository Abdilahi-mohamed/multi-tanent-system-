import "dotenv/config";
import mongoose from "mongoose";
import { createConnection } from "node:net";
import app from "./src/app.js";
import { ProductSection } from "./src/models.js";
import { configureMongoDns } from "./src/mongodb-dns.js";
import { getActivePaymentCredentialKeyId } from "./src/payment-credentials.js";

const port = Number(process.env.PORT || 4000);
const mongoUri = process.env.MONGODB_URI;
let server;
let shutdownPromise;

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
      socket.destroy();
      resolve(!["ECONNREFUSED", "EHOSTUNREACH"].includes(error.code));
    });
  });
}

function safeStartupError(error) {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of [
    mongoUri,
    process.env.JWT_SECRET,
    process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY,
    process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEYRING
  ]) {
    if (secret) message = message.replaceAll(secret, "[redacted]");
  }
  return message.replace(/mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi, "MongoDB URI [redacted]");
}

process.on("uncaughtExceptionMonitor", (error, origin) => {
  console.error(`Backend terminated after ${origin}: ${safeStartupError(error)}`);
});

async function startServer() {
  let phase = "environment validation";
  try {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("PORT must be an integer between 1 and 65535.");
    }

    if (await apiAlreadyHealthy()) {
      console.log(`Aura API is already healthy on port ${port}; not starting a duplicate server.`);
      return;
    }
    if (await portIsInUse()) {
      throw new Error(`Port ${port} is already occupied, but the API health check failed.`);
    }

    if (!mongoUri) {
      throw new Error("MONGODB_URI must be configured before starting the API.");
    }
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      throw new Error("JWT_SECRET must be configured with at least 32 characters.");
    }

    phase = "payment credential configuration";
    getActivePaymentCredentialKeyId();

    phase = "MongoDB DNS configuration";
    configureMongoDns();

    phase = "MongoDB connection";
    await mongoose.connect(mongoUri);

    phase = "ProductSection index initialization";
    await ProductSection.createIndexes();
    const sectionIndexes = await ProductSection.collection.indexes();
    const obsoleteSectionNameIndex = sectionIndexes.find((index) => index.name === "tenantId_1_name_1");
    if (obsoleteSectionNameIndex) {
      try {
        await ProductSection.collection.dropIndex(obsoleteSectionNameIndex.name);
      } catch (error) {
        if (error.code !== 27) throw error;
      }
    }

    phase = `HTTP listener on port ${port}`;
    server = await new Promise((resolve, reject) => {
      const listener = app.listen(port);
      const onError = (error) => {
        listener.removeListener("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        listener.removeListener("error", onError);
        resolve(listener);
      };
      listener.once("error", onError);
      listener.once("listening", onListening);
    });
    console.log(`Aura API listening on port ${port}`);
  } catch (error) {
    console.error(`Backend startup failed during ${phase}: ${safeStartupError(error)}`);
    if (mongoose.connection.readyState !== 0) {
      try {
        await mongoose.disconnect();
      } catch (disconnectError) {
        console.error(`MongoDB cleanup after startup failure failed: ${safeStartupError(disconnectError)}`);
      }
    }
    process.exitCode = 1;
  }
}

async function shutdown(signal) {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    console.log(`Aura API stopped after ${signal}.`);
  })();
  return shutdownPromise;
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    shutdown(signal).catch((error) => {
      console.error(`Backend shutdown failed: ${safeStartupError(error)}`);
      process.exitCode = 1;
    });
  });
}

await startServer();
