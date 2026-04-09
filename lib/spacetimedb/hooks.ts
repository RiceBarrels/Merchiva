// SpacetimeDB React hooks — wired to generated bindings
//
// Public tables (organization, user, site, site_page, membership_tier,
// membership_perk) are subscribed to in the provider and accessible via
// useTable(tables.xxx).
//
// Private tables (inventory, products, sales, settings, staffing) are not
// exposed in the generated `tables` query builder; those domain hooks continue
// to read from Supabase until the module tables are made public.

import { useTable } from "spacetimedb/react";
import { tables } from "./generated";

// Re-export primitives for components that need raw access
export { useSpacetimeDB } from "spacetimedb/react";
export { useTable } from "spacetimedb/react";
export { useReducer as useStdbReducer } from "spacetimedb/react";

/** All organizations the current user belongs to (public table). */
export function useOrganizations() {
  return useTable(tables.organization);
}

/** All user records visible to the current connection (public table). */
export function useUsers() {
  return useTable(tables.user);
}

/** All sites belonging to subscribed organizations (public table). */
export function useSites() {
  return useTable(tables.site);
}

/** All site pages (public table). */
export function useSitePages() {
  return useTable(tables.sitePage);
}

/** All membership tiers (public table). */
export function useMembershipTiers() {
  return useTable(tables.membershipTier);
}

/** All membership perks (public table). */
export function useMembershipPerks() {
  return useTable(tables.membershipPerk);
}
