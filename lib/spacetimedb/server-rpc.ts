// Server-side helper for calling SpacetimeDB reducers from a Next.js route.
// The browser-side client uses a long-lived WebSocket; from a stateless API
// route we instead hit the database's HTTP RPC endpoint with the caller's
// access token (forwarded from the client) so the reducer's `ctx.sender`
// reflects the real user — keeping audit trails and permission checks honest.

const WS_BASE =
  process.env.NEXT_PUBLIC_SPACETIMEDB_URI ?? "ws://localhost:3000";
const HTTP_BASE = WS_BASE.replace(/^ws:/, "http:").replace(/^wss:/, "https:");
// Database identity hex (preferred — see lib/spacetimedb/client.ts comment).
// The HTTP RPC path /v1/database/{nameOrIdentity}/call/{reducer} accepts either.
const MODULE_NAME =
  process.env.NEXT_PUBLIC_SPACETIMEDB_MODULE ??
  "c200b446cd88a8dfa10c16c03d8f315007c61f331ff36bd711acba146a2f43aa";

export interface CallReducerOptions {
  token: string;          // SpacetimeDB access token (user identity)
  name: string;           // reducer name in lowerCamelCase (matches generated SDK)
  args: unknown[];        // ordered argument array per the reducer schema
}

export async function callReducer({ token, name, args }: CallReducerOptions): Promise<void> {
  const url = `${HTTP_BASE.replace(/\/$/, "")}/v1/database/${MODULE_NAME}/call/${name}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`SpacetimeDB reducer ${name} failed (${res.status}): ${text.slice(0, 300)}`);
  }
}
