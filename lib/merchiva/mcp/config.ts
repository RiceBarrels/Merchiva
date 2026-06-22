import type { McpHeaderConfig, McpServerConfig, McpServerPublicInfo } from "./types";

const MAX_SERVERS = 8;
const MAX_ALLOWED_TOOLS = 80;
const LOCALHOST_NAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);
const BLOCKED_HEADER_NAMES = new Set([
  "accept",
  "accept-encoding",
  "connection",
  "content-length",
  "content-type",
  "cookie",
  "host",
  "mcp-session-id",
  "mcp-protocol-version",
  "proxy-authorization",
  "transfer-encoding",
  "upgrade",
]);

export function mcpStorageKey(organizationId: string): string {
  return `mcp_servers_${organizationId}`;
}

export function loadStoredMcpServers(organizationId: string | null | undefined): McpServerConfig[] {
  if (!organizationId || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(mcpStorageKey(organizationId));
    return normalizeMcpServers(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
}

export function saveStoredMcpServers(
  organizationId: string | null | undefined,
  servers: McpServerConfig[],
): void {
  if (!organizationId || typeof window === "undefined") return;
  window.localStorage.setItem(mcpStorageKey(organizationId), JSON.stringify(normalizeMcpServers(servers)));
}

function cleanString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanHeader(input: unknown): McpHeaderConfig | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const name = cleanString(raw.name, 80).toLowerCase();
  const value = cleanString(raw.value, 800);
  if (!/^[a-z0-9!#$%&'*+.^_`|~-]+$/.test(name)) return null;
  if (!value || BLOCKED_HEADER_NAMES.has(name)) return null;
  return { name, value };
}

export function normalizeMcpServers(input: unknown): McpServerConfig[] {
  const list = Array.isArray(input) ? input : [];
  return list.slice(0, MAX_SERVERS).map((raw, index) => {
    const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const id = cleanString(obj.id, 80) || `mcp-${index + 1}`;
    const label = cleanString(obj.label, 60) || `MCP ${index + 1}`;
    const url = cleanString(obj.url, 600);
    const authToken = cleanString(obj.authToken, 1000) || undefined;
    const headers = Array.isArray(obj.headers)
      ? obj.headers.map(cleanHeader).filter((h): h is McpHeaderConfig => !!h)
      : [];
    const allowedTools = Array.isArray(obj.allowedTools)
      ? obj.allowedTools
          .map((tool) => cleanString(tool, 120))
          .filter(Boolean)
          .slice(0, MAX_ALLOWED_TOOLS)
      : undefined;

    return {
      id,
      label,
      url,
      enabled: obj.enabled !== false,
      authToken,
      headers,
      allowedTools,
    };
  }).filter((server) => server.url);
}

export function publicMcpServers(servers: McpServerConfig[]): McpServerPublicInfo[] {
  return servers.map((server) => ({
    id: server.id,
    label: server.label,
    url: server.url,
    enabled: server.enabled,
    allowedTools: server.allowedTools,
    hasAuthToken: !!server.authToken,
    headers: (server.headers ?? []).map((header) => ({
      name: header.name,
      hasValue: !!header.value,
    })),
  }));
}

export function redactMcpServers(input: unknown): unknown {
  return publicMcpServers(normalizeMcpServers(input));
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    a === 0
  );
}

function isPrivateIpv6(hostname: string): boolean {
  const h = hostname.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  return h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80:");
}

export function assertSafeMcpUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);
  if (url.username || url.password) {
    throw new Error("MCP URL must not include username or password");
  }

  const allowLocal = process.env.MCP_ALLOW_LOCALHOST === "true";
  const hostname = url.hostname.toLowerCase();
  const localHost = LOCALHOST_NAMES.has(hostname) || isPrivateIpv4(hostname) || isPrivateIpv6(hostname);

  if (url.protocol === "https:") {
    if (localHost && !allowLocal) throw new Error("MCP URL cannot target localhost or private network hosts");
    return url;
  }

  if (allowLocal && url.protocol === "http:" && localHost) return url;

  throw new Error("MCP URL must be HTTPS");
}

export function mcpHeaders(server: McpServerConfig): Record<string, string> {
  const headers: Record<string, string> = {};
  if (server.authToken) headers.Authorization = `Bearer ${server.authToken}`;
  for (const header of server.headers ?? []) {
    headers[header.name] = header.value;
  }
  return headers;
}
