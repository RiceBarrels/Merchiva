// Whether another store member can use Docs at all, read from their raw org_member row.
//
// MUST match `docMemberGate` in spacetimedb/src/index.ts; scripts/tests/docs/home-member-gate.test.ts
// checks parity against the real server code. `docsGateAllows` (lib/docs/access.ts) is for the
// signed-in member, whose permissions the manager layout has already merged onto the role
// defaults. This one reads the stored JSON, where a missing `dashboard` key (or unreadable JSON)
// means the default, which allows Docs. That is how both the layout merge and the server read it.

export interface DocsGateMemberRow {
  readonly role: string;
  /** org_member.permissions, a JSON string. */
  readonly permissions: string;
}

export function memberCanUseDocs(member: DocsGateMemberRow): boolean {
  if (member.role === "owner") return true;
  let stored: unknown;
  try {
    stored = JSON.parse(member.permissions || "{}");
  } catch {
    return true;
  }
  if (stored === null || typeof stored !== "object" || !("dashboard" in stored)) return true;
  const dashboard = (stored as { dashboard: unknown }).dashboard;
  return typeof dashboard === "object" && dashboard !== null && (dashboard as { view?: unknown }).view === true;
}
