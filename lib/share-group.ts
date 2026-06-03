/**
 * Multi-store sharing helpers.
 *
 * Sub-stores share certain resources (staff, products, chat, design, sites)
 * with their parent + sibling sub-stores. Inventory and sales forecasts stay
 * strictly per-org. The "share group" for an org is:
 *
 *   - root org id (the parent if this is a sub-store, else self)
 *   - every org whose parentOrgId is that root
 *
 * Both client filtering (this file) and the server reducers (see
 * findShareGroupMember in spacetimedb/src/index.ts) consult the same idea so
 * READ and WRITE access stay aligned.
 */

import type { OrgSummary } from "./types";

/** Return the root org id for `orgId` given a list of org summaries. */
export function rootOrgId(orgId: string | null | undefined, orgs: OrgSummary[]): string | null {
  if (!orgId) return null;
  const me = orgs.find((o) => o.id === orgId);
  if (!me) return orgId;
  return me.parentOrgId ?? me.id;
}

/**
 * Org ids in the share group for `orgId`. Always non-empty: at minimum returns
 * [orgId]. Caller is expected to use this list for "is this row visible to me"
 * checks on shared tables.
 */
export function shareGroupOrgIds(orgId: string | null | undefined, orgs: OrgSummary[]): string[] {
  if (!orgId) return [];
  const root = rootOrgId(orgId, orgs);
  if (!root) return [orgId];
  const ids = new Set<string>([root]);
  for (const o of orgs) {
    if (o.parentOrgId === root) ids.add(o.id);
  }
  // Make sure the caller's org is always included even if the org list is
  // partial (e.g. caller doesn't have membership in a sibling).
  ids.add(orgId);
  return [...ids];
}

/**
 * Filter helper for product visibility. A product is visible at a store when
 * (a) the product belongs to any org in the store's share group, AND
 * (b) the product's availableStoreIds list is either unset/empty-default OR
 *     includes the store's org id.
 *
 * When `availableStoreIds` is `null`/`undefined`, the product is visible at
 * every store in the share group (the default).
 */
export function isProductVisibleAtStore(
  productOrgId: string,
  productAvailableStoreIds: string[] | null | undefined,
  viewerOrgId: string,
  groupIds: string[],
): boolean {
  if (!groupIds.includes(productOrgId)) return false;
  if (!productAvailableStoreIds) return true;
  // explicit "[]" — hidden everywhere
  if (productAvailableStoreIds.length === 0) return false;
  return productAvailableStoreIds.includes(viewerOrgId);
}

/**
 * Parse the on-row availableStoreIds JSON string (the SpacetimeDB column
 * stores JSON-encoded arrays). Returns null for unset/invalid, or the parsed
 * array (possibly empty).
 */
export function parseAvailableStoreIds(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) return v;
    return null;
  } catch {
    return null;
  }
}
