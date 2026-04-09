/**
 * Supabase client stub — Supabase has been removed.
 * This file exists only to satisfy TypeScript imports in legacy lib/db/* files.
 * All data access is now via SpacetimeDB hooks. These functions will throw at runtime.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createClient(): any {
  return {
    from: () => { throw new Error("Supabase removed — use SpacetimeDB"); },
    auth: {
      getUser: () => Promise.reject(new Error("Supabase removed — use SpacetimeDB")),
    },
    channel: () => { throw new Error("Supabase removed"); },
    removeChannel: () => {},
  };
}
