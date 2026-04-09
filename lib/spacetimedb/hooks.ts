// SpacetimeDB custom hooks
//
// NOTE: `useTable` accepts a query builder expression, not a table name string.
// These hooks are stubs — update them once the BizOps server module is
// code-generated and the `tables` query builder is available.
//
// Example after codegen:
//   import { tables } from "@/lib/spacetimedb/generated";
//   export function useOrganizations() {
//     const [rows] = useTable(tables.organization);
//     return rows;
//   }

export { useSpacetimeDB } from "spacetimedb/react";

// Re-export useTable for direct use in components that have access to
// the generated `tables` query builder.
export { useTable } from "spacetimedb/react";
