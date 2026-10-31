const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const projectRoot = __dirname;
const frontendRoot = path.join(projectRoot, "frontend");
const backendRoot = path.join(projectRoot, "backend");
const nextCli = require.resolve("next/dist/bin/next", { paths: [frontendRoot] });
const browserMarker = path.join(
  os.tmpdir(),
  `aura-web-${crypto.createHash("sha256").update(projectRoot).digest("hex").slice(0, 12)}.opened`
);
const services = [];

async function isReachable(url) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(1500) });
    return true;
  } catch {
    return false;
  }
}

function startService(name, executable, args, cwd) {
  console.log(`Starting ${name}...`);
  const child = spawn(executable, args, { cwd, stdio: "inherit" });
  services.push(child);
  return child;
}

async function waitForService(name, url, child) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (await isReachable(url)) return;
    if (child.exitCode !== null) {
      throw new Error(`${name} stopped before it became available.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${name} did not become available within 120 seconds.`);
}

function openBrowser(url) {
  let command;
  let args;
  if (process.platform === "win32") {
    command = "cmd.exe";
    args = ["/c", "start", "", url];
  } else if (process.platform === "darwin") {
    command = "open";
    args = [url];
  } else {
    command = "xdg-open";
    args = [url];
  }

  const browser = spawn(command, args, { detached: true, stdio: "ignore" });
  browser.on("error", (error) => console.error(`Could not open browser: ${error.message}`));
  browser.unref();
}

function stopServices() {
  for (const service of services) service.kill();
}

process.once("SIGINT", stopServices);
process.once("SIGTERM", stopServices);

async function main() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
  const webUrl = process.env.WEB_URL || "http://localhost:3000";
  const apiHealthUrl = `${apiUrl.replace(/\/$/, "")}/health`;
  const frontendIsRunning = await isReachable(webUrl);

  if (!(await isReachable(apiHealthUrl))) {
    const backend = startService("backend", process.execPath, ["--watch", "server.js"], backendRoot);
    await waitForService("Backend API", apiHealthUrl, backend);
  }

  if (!frontendIsRunning) {
    fs.rmSync(browserMarker, { force: true });
    const frontend = startService("frontend", process.execPath, [nextCli, "dev"], frontendRoot);
    await waitForService("Frontend", webUrl, frontend);
  }

  if (process.env.WEB_OPEN_ALWAYS === "1" || !fs.existsSync(browserMarker)) {
    console.log(`Opening ${webUrl}`);
    openBrowser(webUrl);
    fs.writeFileSync(browserMarker, String(Date.now()));
  } else {
    console.log("Browser already opened for this running web server; not opening another tab.");
  }
}

main().catch((error) => {
  console.error(error.message);
  stopServices();
  process.exitCode = 1;
});