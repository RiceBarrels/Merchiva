"use client";

import { SpacetimeProvider } from "@/lib/spacetimedb/provider";

export default function PreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SpacetimeProvider>{children}</SpacetimeProvider>;
}
