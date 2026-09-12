// /personal (employee phone surface) sits outside /manager but needs the same
// auth guard, org bootstrap and SpacetimeDB/permissions providers, so it
// reuses the manager layout — same pattern as /choose.
export { default } from "../manager/layout";
