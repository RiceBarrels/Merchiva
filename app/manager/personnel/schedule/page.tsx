"use client";

import { usePersonnelHub } from "@/components/personnel/hub-context";
import { PersonnelLoading } from "@/components/personnel/hub-nav";
import { MobileSchedule } from "@/components/personnel/mobile";
import { StaffingFull } from "@/components/personnel/staffing-full";

export default function PersonnelSchedulePage() {
  const { organizationId, myMemberId, openRequests } = usePersonnelHub();

  if (!organizationId) return <PersonnelLoading />;

  return (
    <>
      {/* Mobile */}
      <div className="md:hidden flex-1 min-h-0 overflow-y-auto no-scrollbar">
        <MobileSchedule
          orgId={organizationId}
          myMemberId={myMemberId}
          onOpenRequests={openRequests}
        />
      </div>

      {/* Desktop */}
      <div className="hidden md:flex md:flex-col md:flex-1 min-h-0 overflow-hidden">
        <StaffingFull subtabs={["schedule", "attendance", "myShifts"]} />
      </div>
    </>
  );
}
