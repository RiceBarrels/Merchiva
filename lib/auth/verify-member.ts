// Proving that the caller of a server route is an ACTIVE member of the
// organization it names, and what that membership lets them see, before the
// route reads that org's data or spends model tokens on its behalf.
//
// Clients send the same token they hand SpacetimeDB: the WorkOS access token,
// or the stored stdb_token when WorkOS has none. /api/store-ai/enqueue also
// forwards it to reducers, which run `findActiveMember` as that identity. Here
// the database is asked, AS the caller, over the SQL endpoint for the caller's
// own membership row:
//
//   * the endpoint verifies the token's signature and expiry — a forged or
//     expired token is a 401, never an anonymous read;
//   * `:sender` is bound to the identity of that verified token (checked
//     against maincloud: the service token matches its own service_identity
//     row, an anonymous caller matches none), and org_member's row-level
//     security lets every caller read their own rows.
//
// So the row that comes back IS the caller's active membership, with the role
// and the permissions JSON the client's PermissionsProvider is built from.
// Nothing in the request body is trusted — not the identity, not the role, not
// the permissions.

import type { OrgRole, PermissionSection, Permissions } from "@/lib/types";

const WS_BASE = process.env.NEXT_PUBLIC_SPACETIMEDB_URI ?? "ws://localhost:3000";
const HTTP_BASE = WS_BASE.replace(/^ws:/, "http:").replace(/^wss:/, "https:");
const MODULE_NAME =
  process.env.NEXT_PUBLIC_SPACETIMEDB_MODULE ??
  "c200b446cd88a8dfa10c16c03d8f315007c61f331ff36bd711acba146a2f43aa";

const CHECK_TIMEOUT_MS = 8_000;
// Organization ids are uuid strings. Anything else is refused before it can
// reach the SQL text.
const ORG_ID_RE = /^[A-Za-z0-9-]{1,64}$/;

/** The caller's membership as the client's `usePermissions()` sees it. */
export interface MemberAccess {
  role: OrgRole;
  isOwner: boolean;
  permissions: Permissions;
}

export type MemberCheck =
  | { ok: true; access: MemberAccess }
  | { ok: false; status: 401 | 503; error: string };

// ── Section permissions, as the client computes them ──────────────────────────
//
// app/manager/layout.tsx merges a member's stored JSON onto the role's defaults
// (`ownerPermissions()` for owners, else `defaultPermissions()`, both in
// lib/db/team.ts), and lib/context/permissions.tsx answers `can()` from the
// result. lib/db/team.ts is legacy client code that cannot be imported here, so
// its defaults are copied without the retired `pos` / `website` sections;
// scripts/tests/ai/member-access.test.ts fails if the copies drift.

function staffDefaults(): Permissions {
  return {
    dashboard: { view: true },
    inventory: { view: true, edit: false },
    sales: { view: true },
    staffing: { view: true, edit: false },
    products: { view: true, edit: false },
    settings: { view: true },
    team: { view: false, invite: false, edit: false },
    training_grading: { view: false, edit: false },
    merchiva: { view: true },
    drive: { view: false, edit: false },
    store_device: { view: false },
  };
}

function ownerDefaults(): Permissions {
  return {
    dashboard: { view: true },
    inventory: { view: true, edit: true },
    sales: { view: true },
    staffing: { view: true, edit: true },
    products: { view: true, edit: true },
    settings: { view: true },
    team: { view: true, invite: true, edit: true },
    training_grading: { view: true, edit: true },
    merchiva: { view: true },
    drive: { view: true, edit: true },
    store_device: { view: true },
  };
}

/** The role defaults a member's stored permissions are merged onto; exported for the drift test. */
export function roleDefaultPermissions(role: string): Permissions {
  return role === "owner" ? ownerDefaults() : staffDefaults();
}

/** A membership row's role + permissions JSON → access, exactly as the layout builds it. */
export function memberAccess(role: string, permissionsJson: string): MemberAccess {
  const fallback = roleDefaultPermissions(role);
  let permissions: Permissions;
  try {
    // Merged onto the role's defaults so sections added after the JSON was
    // last saved still have a value.
    permissions = { ...fallback, ...(JSON.parse(permissionsJson) as Partial<Permissions>) } as Permissions;
  } catch {
    permissions = fallback;
  }
  return { role: role as OrgRole, isOwner: role === "owner", permissions };
}

/** `can(section, action)` from lib/context/permissions.tsx: owners may do anything. */
export function canAccess(
  access: MemberAccess,
  section: string,
  action: "view" | "edit" | "invite" = "view",
): boolean {
  if (access.isOwner) return true;
  const perms = (access.permissions as unknown as Record<string, PermissionSection | undefined>)[section];
  if (!perms) return false;
  return perms[action] === true;
}

/**
 * Mr. Merchiva's own switch: admins can turn the assistant off per member
 * (`merchiva.view`), and the chat and the dock then refuse to open for them
 * (components/merchiva-chat-dashboard.tsx, merchiva-dock/dock-panel.tsx). The
 * AI routes hold the same line, so a copied token can't get around it.
 */
export const MERCHIVA_DISABLED_ERROR = "Mr. Merchiva is disabled for this member";

export function canUseMerchiva(access: MemberAccess): boolean {
  return canAccess(access, "merchiva", "view");
}

/**
 * The permissions block Mr. Merchiva's prompt shows, in the shape the client
 * sends (`{ isOwner, role, sections: { [section]: { view, edit } } }`), built
 * from the verified row instead of the request body.
 */
export function permissionSummary(access: MemberAccess): {
  isOwner: boolean;
  role: string;
  sections: Record<string, { view?: boolean; edit?: boolean }>;
} {
  const sections: Record<string, { view?: boolean; edit?: boolean }> = {};
  for (const [section, perms] of Object.entries(access.permissions as unknown as Record<string, unknown>)) {
    const p = perms as Partial<PermissionSection> | null | undefined;
    sections[section] = { view: p?.view, edit: p?.edit };
  }
  return { isOwner: access.isOwner, role: access.role, sections };
}

/** The caller's token: the body's `token` field, else an `Authorization: Bearer` header. */
export function requestToken(bodyToken: unknown, authHeader: string | null): string | null {
  if (typeof bodyToken === "string" && bodyToken.trim()) return bodyToken.trim();
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    if (token) return token;
  }
  return null;
}

/** The query run as the caller: their own active membership of the org. Exported for tests. */
export function memberCheckQuery(organizationId: string): string {
  return (
    `SELECT role, permissions FROM org_member ` +
    `WHERE organization_id = '${organizationId}' AND user_id = :sender AND status = 'active'`
  );
}

/**
 * Whether `token` belongs to an active member of `organizationId`, and that
 * member's role and section permissions. Fails closed: 401 for a missing,
 * invalid or non-member token, 503 when the database cannot answer.
 */
export async function verifyActiveMember(
  token: string | null | undefined,
  organizationId: string | null | undefined,
): Promise<MemberCheck> {
  if (!token) return { ok: false, status: 401, error: "Missing token" };
  if (!organizationId || !ORG_ID_RE.test(organizationId)) {
    return { ok: false, status: 401, error: "Missing or invalid organizationId" };
  }

  const url = `${HTTP_BASE.replace(/\/$/, "")}/v1/database/${MODULE_NAME}/sql`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain", Authorization: `Bearer ${token}` },
      body: memberCheckQuery(organizationId),
      cache: "no-store",
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
  } catch (err) {
    console.error("[verify-member] membership check failed:", err instanceof Error ? err.message : err);
    return { ok: false, status: 503, error: "Membership check unavailable" };
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, status: 401, error: "Invalid or expired token" };
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[verify-member] membership check returned", res.status, detail.slice(0, 200));
    return { ok: false, status: 503, error: "Membership check unavailable" };
  }

  const data: unknown = await res.json().catch(() => null);
  const rows = Array.isArray(data) ? (data[0] as { rows?: unknown } | undefined)?.rows : undefined;
  if (!Array.isArray(rows)) {
    console.error("[verify-member] unexpected SQL response shape");
    return { ok: false, status: 503, error: "Membership check unavailable" };
  }
  if (rows.length === 0) {
    return { ok: false, status: 401, error: "Not an active member of this organization" };
  }
  // One membership per user and org; like the layout's `find`, the first wins.
  const [role, permissionsJson] = Array.isArray(rows[0]) ? (rows[0] as unknown[]) : [];
  if (typeof role !== "string" || typeof permissionsJson !== "string") {
    console.error("[verify-member] unexpected membership row shape");
    return { ok: false, status: 503, error: "Membership check unavailable" };
  }
  return { ok: true, access: memberAccess(role, permissionsJson) };
}
