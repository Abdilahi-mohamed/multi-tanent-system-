import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const services = [
  {
    name: "backend",
    port: 4000,
    healthUrl: "http://127.0.0.1:4000/api/health",
    command: "npm run dev --prefix backend"
  },
  {
    name: "frontend",
    port: 3000,
    healthUrl: "http://127.0.0.1:3000/login",
    command: "npm run dev --prefix frontend"
  }
];

async function isHealthy(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

function isPortInUse(port) {
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

const states = await Promise.all(services.map(async (service) => ({
  ...service,
  healthy: await isHealthy(service.healthUrl)
})));

for (const service of states) {
  if (!service.healthy && await isPortInUse(service.port)) {
    console.error(`${service.name} port ${service.port} is occupied, but ${service.healthUrl} is not healthy. Stop the process using that port before starting the app.`);
    process.exitCode = 1;
    process.exit();
  }
}

for (const service of states.filter((item) => item.healthy)) {
  console.log(`${service.name} is already healthy on port ${service.port}; reusing it.`);
}

const toStart = states.filter((service) => !service.healthy);
if (!toStart.length) {
  console.log("Frontend and backend are already running. No duplicate servers started.");
} else {
  const commandRunner = path.join(rootDirectory, "node_modules", "concurrently", "dist", "bin", "concurrently.js");
  const runner = spawn(process.execPath, [
    commandRunner,
    "--kill-others-on-fail",
    "--names",
    toStart.map((service) => service.name).join(","),
    "--prefix",
    "[{name}]",
    ...toStart.map((service) => service.command)
  ], { cwd: rootDirectory, stdio: "inherit" });

  runner.once("error", (error) => {
    console.error(`Could not start development services: ${error.message}`);
    process.exitCode = 1;
  });
  runner.once("exit", (code) => {
    process.exitCode = code ?? 1;
  });
}