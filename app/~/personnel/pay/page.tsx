"use client";

import { usePersonnelHub } from "@/components/personnel/hub-context";
import { PersonnelLoading } from "@/components/personnel/hub-nav";
import { PayrollPanel } from "@/components/personnel/payroll";

export default function PersonnelPayPage() {
  const { organizationId, myMemberId } = usePersonnelHub();

  if (!organizationId) return <PersonnelLoading />;

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto no-scrollbar md:overflow-hidden">
      <PayrollPanel orgId={organizationId} myMemberId={myMemberId} />
    </div>
  );
}
