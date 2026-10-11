"use client";

import { SectionBottomNav } from "@/components/section-nav";

// Suppliers is a tab of the Inventory section: same phone bottom tab bar.
export default function SuppliersLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <SectionBottomNav section="inventory" />
    </>
  );
}
