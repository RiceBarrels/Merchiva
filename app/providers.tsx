"use client";

import { SpacetimeAuthProvider } from "@/components/auth-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return <SpacetimeAuthProvider>{children}</SpacetimeAuthProvider>;
}
