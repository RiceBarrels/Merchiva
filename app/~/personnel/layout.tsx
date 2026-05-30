"use client";

import { PermissionGuard } from "@/components/permission-guard";
import { PersonnelHubProvider } from "@/components/personnel/hub-context";
import { PersonnelHeader, PersonnelTabsNav } from "@/components/personnel/hub-nav";

export default function PersonnelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PermissionGuard section="staffing">
      <PersonnelHubProvider>
        <div className="flex flex-col h-[calc(100dvh-3.5rem)]">
          <PersonnelHeader />
          <PersonnelTabsNav />
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {children}
          </div>
        </div>
      </PersonnelHubProvider>
    </PermissionGuard>
  );
}
