"use client";

import { Separator } from "@/components/ui/separator";
import { useT } from "@/lib/i18n/context";
import { AppMenu } from "./app-menu";
import { TOOLBAR_ROW_CLASS } from "./chrome-classes";
import { NavButtons } from "./nav-buttons";
import { Omnibox } from "./omnibox";
import { SidebarToggle } from "./sidebar";

/**
 * Toolbar row (desktop spec §3.3): sidebar toggle · Back · Forward · Reload · Home · omnibox ·
 * | · app menu. A plain group in normal Tab order (no roving toolbar). The account and store menu
 * moved into the sidebar's workspace switcher. Mr. Merchiva has no button here: on desktop ⌘⇧M
 * and his rail are the ways in (the phone layout adds a swipe; components/merchiva-dock).
 * Notifications have no button either: a dot marks the feature they belong to
 * (lib/notifications/dots-context.tsx).
 */
export function Toolbar() {
  const t = useT();
  return (
    <div role="group" aria-label={t("browserDesktop.toolbar.label")} className={TOOLBAR_ROW_CLASS}>
      <SidebarToggle />
      <NavButtons />
      <Omnibox />
      <Separator orientation="vertical" className="mx-1 data-vertical:h-5 data-vertical:self-center" />
      <AppMenu />
    </div>
  );
}
