import dns from "node:dns";

export function configureMongoDns() {
  const configuredServers = process.env.MONGODB_DNS_SERVERS;
  if (configuredServers === undefined) return;

  const servers = configuredServers.split(",").map((server) => server.trim());
  if (servers.some((server) => !server)) {
    throw new Error("MONGODB_DNS_SERVERS must contain comma-separated DNS server IP addresses.");
  }

  dns.setServers(servers);
}
