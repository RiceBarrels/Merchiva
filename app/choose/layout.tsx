// /choose sits outside /manager but needs the same auth guard, org bootstrap
// and SpacetimeDB/permissions providers, so it reuses the manager layout.
export { default } from "../manager/layout";
