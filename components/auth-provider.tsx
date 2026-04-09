// Auth is now handled via PKCE directly — no OIDC provider wrapper needed.
// This file is kept for import compatibility.
export function SpacetimeAuthProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
