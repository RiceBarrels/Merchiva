"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { NEW_TAB_URL, useShortcutLabel, useTabActions, useTabsSnapshot } from "@/lib/browser-shell";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { useBookmarksBarVisible } from "./bookmarks-bar-state";
import { CHROME_MENU_CLASS } from "./chrome-classes";
import { useOverlayBackHandler } from "./chrome-context";
import { useAnnounce } from "./shell-live-region";
import { reportOpenResult } from "./tab-describe";

/*
 * One context menu for the whole tab strip (desktop spec §5.3). The trigger records which
 * tab was right-clicked (`[data-tab-id]`), or null for the empty strip. The keyboard
 * ContextMenu key and Shift+F10 fire `contextmenu` on the focused tab, so they work too.
 * Bulk closes keep pinned tabs (core rule).
 */

function MenuShortcut({ children }: { children: ReactNode }) {
  return (
    <span dir="ltr" aria-hidden className="ms-auto ps-4 font-mono text-[11px] text-muted-foreground">
      {children}
    </span>
  );
}

const ITEM_CLASS = "text-[13px]";

export function TabContextMenu({ children }: { children: ReactNode }) {
  const t = useT();
  const snapshot = useTabsSnapshot();
  const actions = useTabActions();
  const announce = useAnnounce();
  const [barVisible, setBarVisible] = useBookmarksBarVisible();
  const [open, setOpen] = useState(false);
  const [contextTabId, setContextTabId] = useState<string | null>(null);
  const newTabShortcut = useShortcutLabel("newTab");
  const closeShortcut = useShortcutLabel("closeTab");
  const reopenShortcut = useShortcutLabel("reopenClosedTab");
  const duplicateShortcut = useShortcutLabel("duplicateTab");
  const toggleBarShortcut = useShortcutLabel("toggleBookmarksBar");

  useOverlayBackHandler(open, () => setOpen(false));

  const { tabs, closed } = snapshot;
  const index = contextTabId ? tabs.findIndex((tab) => tab.id === contextTabId) : -1;
  const tab = index >= 0 ? tabs[index] : null;
  const hasOtherUnpinned = tab ? tabs.some((other) => other.id !== tab.id && !other.pinned) : false;
  const hasUnpinnedToRight = index >= 0 && tabs.slice(index + 1).some((other) => !other.pinned);
  const toast$ = (message: string) => toast(message);

  const onContextMenuCapture = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-tab-id]") : null;
    setContextTabId(target?.dataset.tabId ?? null);
  };

  const reopen = () => {
    if (reportOpenResult(actions.reopenClosedTab(), t, toast$)) announce(t("browserDesktop.tabs.reopened"));
  };

  return (
    <ContextMenu open={open} onOpenChange={setOpen}>
      <ContextMenuTrigger className="contents" onContextMenuCapture={onContextMenuCapture}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className={cn(CHROME_MENU_CLASS, "min-w-60")}>
        {tab ? (
          <>
            <ContextMenuItem
              className={ITEM_CLASS}
              onClick={() => {
                reportOpenResult(
                  actions.openTab(NEW_TAB_URL, { position: index + 1, activate: true, openerTabId: null }),
                  t,
                  toast$,
                );
              }}
            >
              {t("browserDesktop.tabs.newTabRight")}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              className={ITEM_CLASS}
              onClick={() => {
                if (tab.id === (snapshot.requestedTabId ?? snapshot.activeTabId)) actions.reload();
                else actions.activateTab(tab.id);
              }}
            >
              {t("browser.actions.reload")}
            </ContextMenuItem>
            <ContextMenuItem className={ITEM_CLASS} onClick={() => reportOpenResult(actions.duplicateTab(tab.id), t, toast$)}>
              {t("browser.actions.duplicateTab")}
              {duplicateShortcut ? <MenuShortcut>{duplicateShortcut}</MenuShortcut> : null}
            </ContextMenuItem>
            <ContextMenuItem className={ITEM_CLASS} onClick={() => actions.setPinned(tab.id, !tab.pinned)}>
              {tab.pinned ? t("browser.actions.unpinTab") : t("browser.actions.pinTab")}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              className={ITEM_CLASS}
              onClick={() => {
                actions.closeTab(tab.id, { source: "menu" });
                announce(t("browserDesktop.tabs.closed"));
              }}
            >
              {t("browser.actions.closeTab")}
              {closeShortcut ? <MenuShortcut>{closeShortcut}</MenuShortcut> : null}
            </ContextMenuItem>
            <ContextMenuItem className={ITEM_CLASS} disabled={!hasOtherUnpinned} onClick={() => actions.closeOtherTabs(tab.id)}>
              {t("browser.actions.closeOtherTabs")}
            </ContextMenuItem>
            <ContextMenuItem className={ITEM_CLASS} disabled={!hasUnpinnedToRight} onClick={() => actions.closeTabsToRight(tab.id)}>
              {t("browser.actions.closeTabsToRight")}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem className={ITEM_CLASS} disabled={closed.length === 0} onClick={reopen}>
              {t("browser.actions.reopenClosedTab")}
              {reopenShortcut ? <MenuShortcut>{reopenShortcut}</MenuShortcut> : null}
            </ContextMenuItem>
          </>
        ) : (
          <>
            <ContextMenuItem className={ITEM_CLASS} onClick={() => reportOpenResult(actions.openNewTabPage(), t, toast$)}>
              {t("browser.actions.newTab")}
              {newTabShortcut ? <MenuShortcut>{newTabShortcut}</MenuShortcut> : null}
            </ContextMenuItem>
            <ContextMenuItem className={ITEM_CLASS} disabled={closed.length === 0} onClick={reopen}>
              {t("browser.actions.reopenClosedTab")}
              {reopenShortcut ? <MenuShortcut>{reopenShortcut}</MenuShortcut> : null}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuCheckboxItem
              className={cn(ITEM_CLASS, "pe-8")}
              checked={barVisible}
              onCheckedChange={(checked) => setBarVisible(checked)}
            >
              {t("browserDesktop.bookmarks.showBar")}
              {toggleBarShortcut ? <MenuShortcut>{toggleBarShortcut}</MenuShortcut> : null}
            </ContextMenuCheckboxItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
