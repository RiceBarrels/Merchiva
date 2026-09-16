"use client";

import { useState } from "react";
import { Copy, Link2, Pin, PinOff, Plus, RotateCcw, Star, StarOff, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  useBookmarks,
  useTab,
  useTabActions,
  useTabHistory,
  useTabPresentation,
  type TabId,
} from "@/lib/browser-shell";
import { labelForUrl } from "@/lib/browser-shell/mobile/labels";
import { buildShareUrl } from "@/lib/browser-shell/mobile/share";
import { hapticLight } from "@/lib/haptics";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { copyLinkWithFeedback, toggleFavoriteWithFeedback } from "./share-drawer";
import { SheetRow, SheetSection, ShellDrawer } from "./shell-drawer";

// ─── Tab actions (long-press on an overview card) ────────────────────────────

export interface TabActionsDrawerProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  tabId: TabId | null;
}

/** Spec §11.3 long-press menu: copy link, duplicate, favorite, pin, close others, close. */
export function TabActionsDrawer({ open, onOpenChange, tabId }: TabActionsDrawerProps) {
  const t = useT();
  const actions = useTabActions();
  const bookmarks = useBookmarks();
  const tab = useTab(tabId);
  const presentation = useTabPresentation(tab);
  const close = () => onOpenChange(false);
  const bookmarked = !presentation.isNewTab && bookmarks.find(presentation.url) !== undefined;

  return (
    <ShellDrawer open={open && tab !== null} onOpenChange={onOpenChange} title={presentation.title}>
      <p className="truncate px-4 pb-2 font-mono text-[11.5px] text-muted-foreground" dir="ltr">
        {presentation.url}
      </p>
      <div className="border-t border-border">
        <SheetRow
          icon={Link2}
          disabled={presentation.isNewTab}
          onClick={() => {
            close();
            copyLinkWithFeedback(buildShareUrl(presentation.url), t);
          }}
        >
          {t("browserMobile.copyLink")}
        </SheetRow>
        <SheetRow
          icon={Copy}
          onClick={() => {
            close();
            if (!tab) return;
            const result = actions.duplicateTab(tab.id);
            if (!result.ok && result.reason === "limit") toast(t("browser.tabLimit"));
          }}
        >
          {t("browser.actions.duplicateTab")}
        </SheetRow>
        {!presentation.isNewTab && (
          <SheetRow
            icon={bookmarked ? StarOff : Star}
            onClick={() => {
              close();
              toggleFavoriteWithFeedback(bookmarks, presentation.url, presentation.title, t);
            }}
          >
            {t(bookmarked ? "browserMobile.removeFromFavorites" : "browserMobile.addToFavorites")}
          </SheetRow>
        )}
        <SheetRow
          icon={tab?.pinned ? PinOff : Pin}
          onClick={() => {
            close();
            if (tab) actions.setPinned(tab.id, !tab.pinned);
          }}
        >
          {t(tab?.pinned ? "browser.actions.unpinTab" : "browser.actions.pinTab")}
        </SheetRow>
      </div>
      <div className="border-t border-border">
        <SheetRow
          icon={XCircle}
          onClick={() => {
            close();
            if (tab) actions.closeOtherTabs(tab.id);
          }}
        >
          {t("browser.actions.closeOtherTabs")}
        </SheetRow>
        <SheetRow
          icon={X}
          destructive
          onClick={() => {
            close();
            if (!tab) return;
            void hapticLight();
            actions.closeTab(tab.id, { source: "menu" });
          }}
        >
          {t("browser.actions.closeTab")}
        </SheetRow>
      </div>
    </ShellDrawer>
  );
}

// ─── Tabs menu (long-press on the toolbar tabs button / overview "N Tabs") ───

export interface TabsMenuDrawerProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** "toolbar" adds New tab and Close this tab; "overview" is the overview's centre menu. */
  variant: "toolbar" | "overview";
  tabCount: number;
  closedCount: number;
  canCloseActive: boolean;
  onNewTab(): void;
  onCloseActive(): void;
  onCloseAll(): void;
  onReopenClosed(): void;
}

/**
 * Tabs menu with Safari's two-step "Close all" confirmation inside the sheet. An AlertDialog is
 * not used: its z-50 layer would render underneath the tab overview (z-[80]).
 */
export function TabsMenuDrawer({
  open,
  onOpenChange,
  variant,
  tabCount,
  closedCount,
  canCloseActive,
  onNewTab,
  onCloseActive,
  onCloseAll,
  onReopenClosed,
}: TabsMenuDrawerProps) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setConfirming(false);
  }
  const close = () => onOpenChange(false);
  const countLabel = { n: tabCount };

  return (
    <ShellDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={confirming ? fmt(t("browserMobile.closeAllConfirm"), countLabel) : fmt(t("browserMobile.tabsCount"), countLabel)}
    >
      {confirming ? (
        <div role="alertdialog" aria-label={fmt(t("browserMobile.closeAllConfirm"), countLabel)}>
          <p className="px-4 pb-3 text-[13px] text-muted-foreground">{t("browserMobile.closeAllDescription")}</p>
          <div className="border-t border-border">
            <SheetRow
              icon={X}
              destructive
              onClick={() => {
                close();
                onCloseAll();
              }}
            >
              {fmt(t("browserMobile.closeAllAction"), countLabel)}
            </SheetRow>
            <SheetRow onClick={() => setConfirming(false)}>{t("common.cancel")}</SheetRow>
          </div>
        </div>
      ) : (
        <>
          {variant === "toolbar" && (
            <SheetSection first>
              <SheetRow
                icon={Plus}
                onClick={() => {
                  close();
                  onNewTab();
                }}
              >
                {t("browser.actions.newTab")}
              </SheetRow>
              <SheetRow
                icon={X}
                disabled={!canCloseActive}
                onClick={() => {
                  close();
                  onCloseActive();
                }}
              >
                {t("browser.actions.closeTab")}
              </SheetRow>
            </SheetSection>
          )}
          <SheetSection first={variant === "overview"}>
            <SheetRow icon={RotateCcw} disabled={closedCount === 0} onClick={() => {
              close();
              onReopenClosed();
            }}>
              {t("browser.actions.reopenClosedTab")}
            </SheetRow>
            <SheetRow icon={XCircle} destructive disabled={tabCount === 0} onClick={() => setConfirming(true)}>
              {fmt(t("browserMobile.closeAllAction"), countLabel)}
            </SheetRow>
          </SheetSection>
        </>
      )}
    </ShellDrawer>
  );
}

// ─── Back / forward history (long-press on the toolbar arrows) ───────────────

export interface HistoryDrawerProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  tabId: TabId | null;
  direction: "back" | "forward";
}

/** Entries before (or after) the current one in the active tab, nearest first (spec §6.3). */
export function HistoryDrawer({ open, onOpenChange, tabId, direction }: HistoryDrawerProps) {
  const t = useT();
  const actions = useTabActions();
  const tab = useTab(tabId);
  const history = useTabHistory(tabId);
  const entries = direction === "back" ? history.back : history.forward;
  const currentIndex = tab?.history.index ?? 0;

  return (
    <ShellDrawer
      open={open && entries.length > 0}
      onOpenChange={onOpenChange}
      title={t(direction === "back" ? "browserMobile.backHistory" : "browserMobile.forwardHistory")}
    >
      <ol className="pb-1">
        {entries.map((entry, i) => {
          const label = labelForUrl(entry.url, entry.title, t);
          const target = direction === "back" ? currentIndex - 1 - i : currentIndex + 1 + i;
          return (
            <li key={entry.key}>
              <SheetRow
                icon={label.icon}
                description={<span dir="ltr">{entry.url}</span>}
                onClick={() => {
                  onOpenChange(false);
                  if (tab) actions.goToEntry(tab.id, target);
                }}
              >
                {label.title}
              </SheetRow>
            </li>
          );
        })}
      </ol>
    </ShellDrawer>
  );
}
