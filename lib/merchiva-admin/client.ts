/**
 * Browser-side helpers for /merchivaAdmin pages. Every call goes through the
 * cookie-authenticated route handlers under /api/merchiva-admin — no
 * SpacetimeDB connection in the browser, no tokens in the client.
 */

export type AdminRow = Record<string, unknown>;

export class AdminApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    credentials: "same-origin",
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") window.location.reload();
    throw new AdminApiError(data.error ?? `Request failed (${res.status})`, res.status);
  }
  return data;
}

/**
 * Read-only SQL against a public table. SpacetimeDB SQL dialect: snake_case
 * column names, single quotes for strings, e.g.
 *   adminSql("SELECT * FROM org_member WHERE organization_id = 'abc'")
 * Rows come back with camelCase keys; uuid/identity as strings, timestamps
 * as unix millis, option none as null.
 */
export async function adminSql<T extends object = AdminRow>(query: string): Promise<T[]> {
  const data = await post<{ rows: T[] }>("/api/merchiva-admin/sql", { query });
  return data.rows;
}

/**
 * Call any module reducer as the platform (service) identity, e.g.
 *   adminCall("setMemberStatus", { organizationId, memberId, status: "disabled" })
 * Identity args: hex string. Timestamp args: unix millis or ISO string.
 * Option args: pass null/undefined for none. Throws with the reducer's message.
 */
export async function adminCall(reducer: string, args: Record<string, unknown> = {}): Promise<void> {
  await post("/api/merchiva-admin/rpc", { reducer, args });
}

/** Escape a string literal for use inside a SQL WHERE clause. */
export function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function formatTs(ms: unknown): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms === 0) return "—";
  return new Date(ms).toLocaleString();
}
