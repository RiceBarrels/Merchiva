"use client";

// Renders one manager page inside a device panel: Suspense + spinner, hides
// the desktop PageHeader chrome, and intercepts clicks on internal
// `/manager/...` links so they open the matching catalog app in place (via
// onNavigate) instead of leaving the kiosk surface. Personnel pages get the
// hub provider + tab strip their route layout normally supplies.

import { Suspense, type ReactNode, type MouseEvent } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/loaders/geometric";
import { PersonnelHubProvider } from "@/components/personnel/hub-context";
import { PersonnelTabsNav } from "@/components/personnel/hub-nav";
import { catalogApp, catalogAppForRoute, type CatalogActor } from "./app-catalog";
import { PermissionsProvider, usePermissions } from "@/lib/context/permissions";
import type { OrgRole } from "@/lib/types";

export interface EmbeddedPageProps {
  /** Catalog app id being shown (for link interception context). */
  appId: string;
  children: ReactNode;
  /** Called with the catalog app id when an intercepted link maps to one. */
  onNavigate?: (appId: string) => void;
  /** Evaluate the page's permission checks as this member (the store-device
   *  operator) instead of the account the device is signed in with. */
  actor?: CatalogActor | null;
  className?: string;
}

/** Re-scopes usePermissions() under the embedded page to the operator. */
function ActorPermissions({ actor, children }: { actor: CatalogActor; children: ReactNode }) {
  const { organizationId, organizations, currentOrg, pickOrg } = usePermissions();
  return (
    <PermissionsProvider
      role={actor.role as OrgRole}
      permissions={actor.permissions}
      organizationId={organizationId}
      organizations={organizations}
      currentOrg={currentOrg}
      onPickOrg={pickOrg}
    >
      {children}
    </PermissionsProvider>
  );
}

function Fallback() {
  return (
    <div className="flex h-full min-h-[40vh] items-center justify-center">
      <Spinner size={20} className="text-muted-foreground" />
    </div>
  );
}

export function EmbeddedPage({ appId, children, onNavigate, actor, className }: EmbeddedPageProps) {
  const t = useT();
  const app = catalogApp(appId);
  const isPersonnel = !!app && app.route.startsWith("/manager/personnel");

  const onClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!anchor) return;
    const href = anchor.getAttribute("href") ?? "";
    if (!href.startsWith("/manager")) return;
    e.preventDefault();
    e.stopPropagation();
    const next = catalogAppForRoute(href);
    if (next && next.id !== appId) onNavigate?.(next.id);
    else if (!next) toast(t("device.notAvailableHere"));
  };

  const inner = isPersonnel ? (
    <PersonnelHubProvider>
      <div className="flex h-full min-h-0 flex-col">
        <PersonnelTabsNav />
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</div>
      </div>
    </PersonnelHubProvider>
  ) : (
    children
  );
  const body = actor ? <ActorPermissions actor={actor}>{inner}</ActorPermissions> : inner;

  return (
    <div
      data-embedded-app={appId}
      onClickCapture={onClickCapture}
      className={cn(
        "h-full overflow-y-auto bg-background text-foreground [&_[data-slot=page-header]]:hidden",
        className,
      )}
    >
      <Suspense fallback={<Fallback />}>{body}</Suspense>
    </div>
  );
}
