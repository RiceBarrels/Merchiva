// /store is the shared store-device surface. It sits outside /manager so the
// back-office shell never renders around it, but it needs the same auth guard,
// org bootstrap and SpacetimeDB/permissions providers — so it reuses the
// manager layout (which renders bare children for this path).
export { default } from "../manager/layout";
