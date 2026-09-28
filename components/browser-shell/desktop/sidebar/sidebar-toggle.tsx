"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useShortcutLabel, type ShellCommand } from "@/lib/browser-shell";
import { useT } from "@/lib/i18n/context";
import { TOOLBAR_BUTTON_CLASS } from "../chrome-classes";
import {
  SIDEBAR_ELEMENT_ID,
  SIDEBAR_TOGGLE_ID,
  setSidebarHidden,
  toggleSidebarCollapsed,
  toggleSidebarHidden,
  useSidebarState,
} from "./sidebar-state";

/*
 * Sidebar toggle, the first control in the toolbar row. It collapses the sidebar to the icon rail
 * and back — the same action, the same state and the same icons as the control at the foot of the
 * sidebar, so the two always agree.
 *
 * The one exception is when the sidebar is hidden outright: there is nothing to collapse then, and
 * this is the only pointer affordance that brings it back, so in that state it shows the sidebar.
 * Hiding stays on the shortcut.
 *
 * The shortcut lives in core's table (lib/browser-shell/shortcuts.ts): Alt+S (⌥S on macOS) in
 * every environment — Tauri, a plain web tab and an installed PWA. The natural Mod combos are
 * taken (Mod+B and Mod+backslash by the docs editor, Mod+Shift+B by the bookmarks bar), while
 * Alt+S is clear of the core table, the docs keymap, the Mr. Merchiva dock (Mod+Shift+M) and the
 * browser/OS combos, and Alt bindings never fire while typing (plan D21). When the command is
 * unbound `useShortcutLabel` returns null and the tooltip shows the label alone.
 */
export const TOGGLE_SIDEBAR_COMMAND: ShellCommand = "toggleSidebar";

/**
 * Toggles the sidebar and keeps focus somewhere useful: hiding it while focus sits inside
 * would drop focus to the document, so focus moves to the toolbar toggle instead.
 */
export function toggleSidebarWithFocus(): void {
  const sidebar = typeof document === "undefined" ? null : document.getElementById(SIDEBAR_ELEMENT_ID);
  const focusInside = sidebar !== null && sidebar.contains(document.activeElement);
  toggleSidebarHidden();
  if (!focusInside) return;
  window.requestAnimationFrame(() => document.getElementById(SIDEBAR_TOGGLE_ID)?.focus());
}

export function SidebarToggle() {
  const t = useT();
  const { hidden, collapsed } = useSidebarState();
  const shortcut = useShortcutLabel(TOGGLE_SIDEBAR_COMMAND);
  const railed = hidden || collapsed;
  const label = hidden
    ? t("browserDesktop.sidebar.show")
    : t(collapsed ? "components.sidebar.expand" : "components.sidebar.collapse");
  // The shortcut hides and shows the whole sidebar, so it is only this button's shortcut while
  // the sidebar is hidden — the one state where the two do the same thing.
  const tooltip = hidden && shortcut ? `${label} (${shortcut})` : label;
  const Icon = railed ? PanelLeftOpen : PanelLeftClose;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            id={SIDEBAR_TOGGLE_ID}
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            aria-expanded={!railed}
            aria-controls={hidden ? undefined : SIDEBAR_ELEMENT_ID}
            className={TOOLBAR_BUTTON_CLASS}
            onClick={() => (hidden ? setSidebarHidden(false) : toggleSidebarCollapsed())}
          />
        }
      >
        <Icon className="h-4 w-4 rtl:-scale-x-100" />
      </TooltipTrigger>
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </Tooltip>
  );
}
