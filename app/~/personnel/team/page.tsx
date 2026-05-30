"use client";

import { usePersonnelHub } from "@/components/personnel/hub-context";
import { PersonnelLoading } from "@/components/personnel/hub-nav";
import { OrgPanel } from "@/components/personnel/team";

export default function PersonnelTeamPage() {
  const { organizationId } = usePersonnelHub();

  if (!organizationId) return <PersonnelLoading />;

  // The desktop OrgPanel is fully responsive — on mobile it falls back to the
  // list view with a bottom-sheet inspector — so both breakpoints share it.
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <OrgPanel orgId={organizationId} />
    </div>
  );
}
