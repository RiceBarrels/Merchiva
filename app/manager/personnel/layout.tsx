"use client";

import { PermissionGuard } from "@/components/permission-guard";
import { PersonnelHubProvider } from "@/components/personnel/hub-context";
import { PersonnelBottomNav, PersonnelHeader, PersonnelTabsNav } from "@/components/personnel/hub-nav";

export default function PersonnelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PermissionGuard section="staffing">
      <PersonnelHubProvider>
        <div className="-mx-2 flex flex-col flex-1 min-h-0">
          <PersonnelHeader />
          <PersonnelTabsNav />
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {children}
          </div>
          <PersonnelBottomNav />
        </div>
      </PersonnelHubProvider>
    </PermissionGuard>
  );
}
