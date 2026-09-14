import { Suspense } from "react";
import { InventoryConsole } from "@/components/merchiva-admin/inventory/inventory-console";

export const dynamic = "force-dynamic";

export default function MerchivaAdminInventoryPage() {
  return (
    <Suspense fallback={<div className="px-1 py-6 text-[13px] text-stone-500">Loading…</div>}>
      <InventoryConsole />
    </Suspense>
  );
}
