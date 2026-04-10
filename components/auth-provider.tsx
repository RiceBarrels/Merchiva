// Auth is now handled by Clerk via ClerkProvider in app/providers.tsx.
// This file is kept for import compatibility only.
export function SpacetimeAuthProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
