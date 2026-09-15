"use client";

import { PermissionGuard } from "@/components/permission-guard";
import { usePersonnelHub } from "@/components/personnel/hub-context";
import { PersonnelLoading } from "@/components/personnel/hub-nav";
import { OrgPanel } from "@/components/personnel/team";

export default function PersonnelTeamPage() {
  const { organizationId } = usePersonnelHub();

  if (!organizationId) return <PersonnelLoading />;

  // The hub layout only checks staffing access; member emails, statuses and
  // permissions additionally require team.view. OrgPanel is responsive — on
  // mobile it renders the card list with a bottom-sheet inspector.
  return (
    <PermissionGuard section="team">
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <OrgPanel orgId={organizationId} />
      </div>
    </PermissionGuard>
  );
}
