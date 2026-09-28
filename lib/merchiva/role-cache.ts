/**
 * The client cache's roles and role tasks, read at the moment of a write.
 *
 * Mr. Merchiva's task cards add a role and then its tasks in one go; the
 * React tables only catch up on the next render, so a card waiting for a
 * role it just created reads the connection's cache directly. Scoped to the
 * active org, like every other cached read in lib/merchiva.
 */

import { getActiveOrgId, getConnection } from "@/lib/spacetimedb/client";

// Loose on purpose: the React tables and the connection cache both fit.
export interface CachedRole {
  id?: unknown;
  organizationId?: unknown;
  name?: unknown;
  color?: unknown;
}

export interface CachedRoleTask {
  id?: unknown;
  organizationId?: unknown;
  roleId?: unknown;
  title?: unknown;
  requiresEvidence?: unknown;
}

function activeOrg(): string | null {
  try {
    return getActiveOrgId();
  } catch {
    return null;
  }
}

function cached<T extends { organizationId?: unknown }>(table: "staffRole" | "roleTask"): T[] | null {
  try {
    const db = getConnection()?.db as Record<string, { iter?: () => Iterable<T> } | undefined> | undefined;
    const rows = db?.[table]?.iter?.();
    if (!rows) return null;
    const org = activeOrg();
    return Array.from(rows).filter((r) => !org || r?.organizationId === org);
  } catch {
    return null;
  }
}

/** The org's roles, or `fallback` (the rendered rows) when there is no connection. */
export function cachedRoles(fallback: readonly CachedRole[] = []): CachedRole[] {
  return cached<CachedRole>("staffRole") ?? [...fallback];
}

export function cachedRoleTasks(fallback: readonly CachedRoleTask[] = []): CachedRoleTask[] {
  return cached<CachedRoleTask>("roleTask") ?? [...fallback];
}
