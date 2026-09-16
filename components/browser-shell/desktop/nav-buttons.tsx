"use client";

import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, House, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useActiveNavState,
  useActiveTab,
  useShortcutLabel,
  useTabActions,
  useTabHistory,
  useTabsSnapshot,
  type HistoryEntry,
} from "@/lib/browser-shell";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { TOOLBAR_BUTTON_CLASS } from "./chrome-classes";
import { useOverlayBackHandler } from "./chrome-context";
import { HISTORY_PRESS_MS } from "./chrome-geometry";
import { createLongPressClickGuard, type LongPressClickGuard } from "./long-press-click-guard";
import { describeUrl } from "./tab-describe";

/*
 * Back, Forward, Reload, Home (desktop spec §3.3).
 *   Back closes the top DynamicUIElement dialog first (core goBack), then walks the tab's
 *   own history. Right-click or a 500ms press opens the history menu (up to 12 entries).
 *   Reload remounts the page (soft); Shift-click reloads the document (hard).
 *   Home goes to the New Tab home page (core goHome), which every member may open.
 * Home is hidden below xl.
 */

const HISTORY_MENU_LIMIT = 12;

function withShortcut(label: string, shortcut: string | null): string {
  return shortcut ? `${label} (${shortcut})` : label;
}

export function NavButtons() {
  const t = useT();
  const actions = useTabActions();
  const snapshot = useTabsSnapshot();
  const nav = useActiveNavState();
  const activeTab = useActiveTab();
  const history = useTabHistory(activeTab?.id ?? null);
  const backShortcut = useShortcutLabel("back");
  const forwardShortcut = useShortcutLabel("forward");
  const reloadShortcut = useShortcutLabel("reload");
  const homeShortcut = useShortcutLabel("home");

  // Without a ready tab store (legacy fallback) Back/Forward delegate to the router.
  const idle = snapshot.status === "idle";
  const canGoBack = idle || nav.dialogOpen || history.canGoBack;
  const canGoForward = idle || nav.canGoForward;
  const currentIndex = activeTab?.history.index ?? 0;

  const goTo = (entryIndex: number) => {
    if (activeTab) actions.goToEntry(activeTab.id, entryIndex);
  };

  return (
    <>
      <HistoryButton
        label={withShortcut(t("browser.actions.back"), backShortcut)}
        ariaLabel={t("browser.actions.back")}
        icon={<ArrowLeft className="h-4 w-4 rtl:rotate-180" />}
        disabled={!canGoBack}
        entries={history.back}
        onActivate={() => actions.goBack()}
        onPickEntry={(offset) => goTo(currentIndex - 1 - offset)}
      />
      <HistoryButton
        label={withShortcut(t("browser.actions.forward"), forwardShortcut)}
        ariaLabel={t("browser.actions.forward")}
        icon={<ArrowRight className="h-4 w-4 rtl:rotate-180" />}
        disabled={!canGoForward}
        entries={history.forward}
        onActivate={() => actions.goForward()}
        onPickEntry={(offset) => goTo(currentIndex + 1 + offset)}
      />
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("browser.actions.reload")}
              className={TOOLBAR_BUTTON_CLASS}
              onClick={(event: MouseEvent<HTMLButtonElement>) => actions.reload(event.shiftKey ? { hard: true } : undefined)}
            />
          }
        >
          <RotateCw className="h-4 w-4" />
        </TooltipTrigger>
        <TooltipContent side="bottom" className="flex-col items-start gap-0.5">
          <span>{withShortcut(t("browser.actions.reload"), reloadShortcut)}</span>
          <span className="opacity-70">{t("browserDesktop.toolbar.reloadHint")}</span>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("browser.actions.home")}
              className={cn(TOOLBAR_BUTTON_CLASS, "hidden xl:inline-flex")}
              onClick={() => actions.goHome()}
            />
          }
        >
          <House className="h-4 w-4" />
        </TooltipTrigger>
        <TooltipContent side="bottom">{withShortcut(t("browser.actions.home"), homeShortcut)}</TooltipContent>
      </Tooltip>
    </>
  );
}

function HistoryButton({
  label,
  ariaLabel,
  icon,
  disabled,
  entries,
  onActivate,
  onPickEntry,
}: {
  label: string;
  ariaLabel: string;
  icon: ReactNode;
  disabled: boolean;
  entries: readonly HistoryEntry[];
  onActivate(): void;
  /** `offset` 0 is the nearest entry. */
  onPickEntry(offset: number): void;
}) {
  const t = useT();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pressTimerRef = useRef<number | null>(null);
  // The click that ends a long press must not navigate; see long-press-click-guard.ts.
  const clickGuardRef = useRef<LongPressClickGuard | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuEntries = entries.slice(0, HISTORY_MENU_LIMIT);
  const hasMenu = menuEntries.length > 0;

  useOverlayBackHandler(menuOpen, () => setMenuOpen(false));

  const clickGuard = () => (clickGuardRef.current ??= createLongPressClickGuard());

  const clearPress = () => {
    if (pressTimerRef.current !== null) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  useEffect(
    () => () => {
      if (pressTimerRef.current !== null) {
        window.clearTimeout(pressTimerRef.current);
        pressTimerRef.current = null;
      }
      clickGuardRef.current?.dispose();
    },
    [],
  );

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    clickGuard().reset();
    if (event.button !== 0 || !hasMenu) return;
    clearPress();
    pressTimerRef.current = window.setTimeout(() => {
      pressTimerRef.current = null;
      clickGuard().arm();
      setMenuOpen(true);
    }, HISTORY_PRESS_MS);
  };

  return (
    <>
      <Tooltip disabled={menuOpen}>
        <TooltipTrigger
          render={
            <Button
              ref={buttonRef}
              variant="ghost"
              size="icon-sm"
              aria-label={ariaLabel}
              aria-haspopup={hasMenu ? "menu" : undefined}
              aria-expanded={hasMenu ? menuOpen : undefined}
              disabled={disabled}
              className={TOOLBAR_BUTTON_CLASS}
              onPointerDown={onPointerDown}
              onPointerUp={clearPress}
              onPointerLeave={clearPress}
              onPointerCancel={clearPress}
              onContextMenu={(event: MouseEvent<HTMLButtonElement>) => {
                if (!hasMenu) return;
                event.preventDefault();
                setMenuOpen(true);
              }}
              onClick={() => {
                if (clickGuard().consumeClick()) return;
                onActivate();
              }}
            />
          }
        >
          {icon}
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
      {hasMenu ? (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuContent anchor={buttonRef} align="start" className="max-w-[320px] min-w-56">
            {menuEntries.map((entry, offset) => {
              const described = describeUrl(entry.url, entry.title, t);
              const Icon = described.icon;
              return (
                <DropdownMenuItem key={entry.key} onClick={() => onPickEntry(offset)}>
                  <Icon className="h-4 w-4" />
                  <span className="min-w-0 truncate">{described.title}</span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  );
}
