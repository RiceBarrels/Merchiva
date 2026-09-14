import { Suspense } from "react";
import { StaffingConsole } from "@/components/merchiva-admin/staffing/staffing-console";

export const dynamic = "force-dynamic";

export default function MerchivaAdminStaffingPage() {
  return (
    <Suspense fallback={<div className="px-4 py-6 text-[13px] text-stone-500">Loading…</div>}>
      <StaffingConsole />
    </Suspense>
  );
}
