import { Suspense } from "react";
import { SalesConsole } from "@/components/merchiva-admin/sales/sales-console";

export const dynamic = "force-dynamic";

export default function MerchivaAdminSalesPage() {
  return (
    <Suspense fallback={<div className="py-10 text-center text-[13px] text-stone-500">Loading…</div>}>
      <SalesConsole />
    </Suspense>
  );
}
