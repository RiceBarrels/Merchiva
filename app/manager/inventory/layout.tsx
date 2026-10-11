"use client";

import { SectionBottomNav } from "@/components/section-nav";

// The phone's bottom tab bar for the Inventory section (inventory, waste);
// suppliers has its own layout with the same bar.
export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <SectionBottomNav section="inventory" />
    </>
  );
}
