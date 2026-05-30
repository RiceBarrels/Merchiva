"use client";

import { usePersonnelHub } from "@/components/personnel/hub-context";
import { PersonnelLoading } from "@/components/personnel/hub-nav";
import { MobileRoles } from "@/components/personnel/mobile";
import { StaffingFull } from "@/components/personnel/staffing-full";

export default function PersonnelRolesPage() {
  const { organizationId } = usePersonnelHub();

  if (!organizationId) return <PersonnelLoading />;

  return (
    <>
      {/* Mobile */}
      <div className="md:hidden flex-1 min-h-0 overflow-y-auto no-scrollbar">
        <MobileRoles orgId={organizationId} />
      </div>

      {/* Desktop */}
      <div className="hidden md:flex md:flex-col md:flex-1 min-h-0 overflow-hidden">
        <StaffingFull subtabs={["roles"]} />
      </div>
    </>
  );
}
