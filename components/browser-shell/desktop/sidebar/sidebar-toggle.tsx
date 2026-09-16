"use client";

import { PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useShortcutLabel, type ShellCommand } from "@/lib/browser-shell";
import { useT } from "@/lib/i18n/context";
import { TOOLBAR_BUTTON_CLASS } from "../chrome-classes";
import { SIDEBAR_ELEMENT_ID, SIDEBAR_TOGGLE_ID, toggleSidebarHidden, useSidebarState } from "./sidebar-state";

/*
 * Sidebar toggle, the first control in the toolbar row. It shows and hides the whole sidebar;
 * collapsing it to the icon rail stays inside the sidebar (and on the drag handle).
 *
 * The shortcut lives in core's table (lib/browser-shell/shortcuts.ts): Alt+S (⌥S on macOS) in
 * every environment — Tauri, a plain web tab and an installed PWA. The natural Mod combos are
 * taken (Mod+B and Mod+backslash by the docs editor, Mod+Shift+B by the bookmarks bar), while
 * Alt+S is clear of the core table, the docs keymap, the quick dialog (Mod+Shift+M) and the
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
  const { hidden } = useSidebarState();
  const shortcut = useShortcutLabel(TOGGLE_SIDEBAR_COMMAND);
  const label = t(hidden ? "browserDesktop.sidebar.show" : "browserDesktop.sidebar.hide");

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            id={SIDEBAR_TOGGLE_ID}
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            aria-expanded={!hidden}
            aria-controls={hidden ? undefined : SIDEBAR_ELEMENT_ID}
            className={TOOLBAR_BUTTON_CLASS}
            onClick={() => toggleSidebarWithFocus()}
          />
        }
      >
        <PanelLeft className="h-4 w-4 rtl:-scale-x-100" />
      </TooltipTrigger>
      <TooltipContent side="bottom">{shortcut ? `${label} (${shortcut})` : label}</TooltipContent>
    </Tooltip>
  );
}
