import { Suspense } from "react";
import { DataConsole } from "@/components/merchiva-admin/data/data-console";

export const dynamic = "force-dynamic";

/** /merchivaAdmin/data — generic table browser, reducer console and SQL console. */
export default function MerchivaAdminDataPage() {
  return (
    <Suspense fallback={<div className="px-1 py-6 text-[13px] text-stone-500">Loading…</div>}>
      <DataConsole />
    </Suspense>
  );
}
