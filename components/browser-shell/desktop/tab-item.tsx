"use client";

import { memo, type KeyboardEvent, type MouseEvent } from "react";
import { Loader2, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useShortcutLabel, useTabPresentation, type BrowserTab } from "@/lib/browser-shell";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import {
  TAB_ACTIVE_CLASS,
  TAB_BASE_CLASS,
  TAB_CLOSE_CLASS,
  TAB_CLOSE_HOVER_ONLY_CLASS,
  TAB_DIVIDER_CLASS,
  TAB_DRAGGED_CLASS,
  TAB_INACTIVE_CLASS,
  TAB_PINNED_CLASS,
  TAB_SHIFT_CLASS,
  TAB_TITLE_CLASS,
} from "./chrome-classes";
import { TAB_HOVER_CARD_DELAY_MS } from "./chrome-geometry";
import { displayAddress } from "./tab-describe";
import type { TabPointerHandlers } from "./use-tab-drag";
import { tabContentMode } from "./use-tab-strip-layout";

export interface TabItemProps {
  tab: BrowserTab;
  /** Index in the full tabs array. */
  index: number;
  /** Pinned tabs use the pinned width. */
  width: number;
  active: boolean;
  /** The previous tab is active: hides this tab's leading divider. */
  prevActive: boolean;
  /** Roving tabindex. */
  focusable: boolean;
  /** Current drag transform (px). */
  translateX: number;
  /** This tab is being dragged. */
  dragged: boolean;
  /** Any drag is in progress (suppresses hover cards). */
  dragActive: boolean;
  /** The reorder just committed: transitions off for one frame. */
  settling: boolean;
  coarse: boolean;
  handlers: TabPointerHandlers;
  onClose(id: string, via: "pointer" | "keyboard"): void;
  onKeyDown(event: KeyboardEvent<HTMLDivElement>, id: string): void;
  onFocusTab(id: string): void;
}

function TabItemImpl({
  tab,
  index,
  width,
  active,
  prevActive,
  focusable,
  translateX,
  dragged,
  dragActive,
  settling,
  coarse,
  handlers,
  onClose,
  onKeyDown,
  onFocusTab,
}: TabItemProps) {
  const t = useT();
  const presentation = useTabPresentation(tab);
  const closeShortcut = useShortcutLabel("closeTab");
  const mode = tab.pinned ? ({ icon: true, title: false, close: "never" } as const) : tabContentMode(width, active, coarse);
  const Icon = presentation.icon;
  const address = presentation.isNewTab ? "" : displayAddress(presentation.url);
  const closeLabel = closeShortcut ? `${t("browser.actions.closeTab")} (${closeShortcut})` : t("browser.actions.closeTab");
  const pending = presentation.pending;

  const onAuxClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 1) return;
    event.preventDefault();
    onClose(tab.id, "pointer");
  };

  return (
    <Tooltip disabled={dragActive}>
      <TooltipTrigger
        delay={TAB_HOVER_CARD_DELAY_MS}
        render={
          <div
            role="tab"
            id={`browser-tab-${tab.id}`}
            aria-selected={active}
            aria-controls="desktop-content"
            aria-busy={pending || undefined}
            aria-label={mode.title ? undefined : presentation.title}
            data-tab-id={tab.id}
            data-pinned={tab.pinned ? "" : undefined}
            data-dragging={dragged ? "" : undefined}
            tabIndex={focusable ? 0 : -1}
            style={{
              width,
              transform: translateX !== 0 ? `translateX(${translateX}px)` : undefined,
            }}
            className={cn(
              TAB_BASE_CLASS,
              active ? TAB_ACTIVE_CLASS : TAB_INACTIVE_CLASS,
              !active && index > 0 && !prevActive && TAB_DIVIDER_CLASS,
              tab.pinned && TAB_PINNED_CLASS,
              dragged || settling ? TAB_DRAGGED_CLASS : TAB_SHIFT_CLASS,
              settling && !dragged && "z-auto",
            )}
            onPointerDown={handlers.onPointerDown}
            onPointerMove={handlers.onPointerMove}
            onPointerUp={handlers.onPointerUp}
            onPointerCancel={handlers.onPointerCancel}
            onLostPointerCapture={handlers.onLostPointerCapture}
            onClick={handlers.onClick}
            onAuxClick={onAuxClick}
            onKeyDown={(event) => onKeyDown(event, tab.id)}
            onFocus={() => onFocusTab(tab.id)}
          />
        }
      >
        {mode.icon || pending ? (
          <span className="relative flex size-4 shrink-0 items-center justify-center" aria-hidden>
            {pending ? (
              <span className="flex animate-in fade-in-0 delay-150 fill-mode-backwards">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </span>
            ) : (
              <Icon className="size-4" />
            )}
          </span>
        ) : null}
        {mode.title ? <span className={TAB_TITLE_CLASS}>{presentation.title}</span> : null}
        {mode.close !== "never" ? (
          <span
            data-tab-close=""
            aria-hidden
            title={closeLabel}
            className={cn(TAB_CLOSE_CLASS, mode.close === "hover" && TAB_CLOSE_HOVER_ONLY_CLASS)}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onClose(tab.id, "pointer");
            }}
          >
            <X className="h-3.5 w-3.5" />
          </span>
        ) : null}
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6} className="max-w-[320px] flex-col items-start gap-0.5 px-2.5 py-1.5">
        <span className="w-full truncate text-[12px] font-medium">{presentation.title}</span>
        {address ? (
          <span dir="ltr" className="w-full truncate font-mono text-[11px] opacity-70">
            {address}
          </span>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

/** One tab in the strip (desktop spec §3.2). Memoized; handlers passed in must be stable. */
export const TabItem = memo(TabItemImpl);
