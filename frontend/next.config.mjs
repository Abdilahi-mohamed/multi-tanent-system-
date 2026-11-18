import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    agentUpgrade: "security"
  },
  outputFileTracingRoot: path.resolve(process.cwd(), "..")
};

export default nextConfig;
