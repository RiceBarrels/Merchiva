"use client";

import { Loader2, RotateCw, Search } from "lucide-react";
import { motion, useTransform, type MotionValue } from "motion/react";
import type { AppIcon } from "@/components/device/app-icons";
import { StoreLogo } from "@/components/store-picker";
import {
  COLLAPSED_TITLE_SCALE,
  COLLAPSE_ROW_DY,
  INSTANT,
  STANDARD_EASE,
} from "@/lib/browser-shell/mobile/geometry";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { cn } from "@/lib/utils";

export interface AddressPillProps {
  collapse: MotionValue<number>;
  /** Collapse passed the halfway point: side buttons stop taking taps and the whole band expands. */
  collapsedHalf: boolean;
  title: string;
  icon: AppIcon;
  isNewTab: boolean;
  pending: boolean;
  /** Title of the top DynamicUIElement page; null or empty when none is raised over or it has no title. */
  dialogTitle: string | null;
  /** 0 = dialog fully open, 1 = swiped away (DynamicUIElement swipe progress). */
  dialogSwipe: number;
  orgName: string;
  orgLogoUrl: string | null;
  reloadDisabled: boolean;
  reloadTick: number;
  reducedMotion: boolean;
  onPillElement(element: HTMLDivElement | null): void;
  onPageMenu(): void;
  onSearch(): void;
  onReload(): void;
  onExpand(): void;
}

const SIDE_BUTTON =
  "relative z-10 flex h-[42px] w-[44px] shrink-0 items-center justify-center rounded-lg !min-h-0 !min-w-0 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Address row (mobile-safari spec §6.3): store logo (workspace and account menu), the page title (tap to search, swipe to switch tabs) and reload. While minimized it
 * shrinks into the title strip and the whole band becomes one "expand" target.
 */
export function AddressPill({
  collapse,
  collapsedHalf,
  title,
  icon: Icon,
  isNewTab,
  pending,
  dialogTitle,
  dialogSwipe,
  orgName,
  orgLogoUrl,
  reloadDisabled,
  reloadTick,
  reducedMotion,
  onPillElement,
  onPageMenu,
  onSearch,
  onReload,
  onExpand,
}: AddressPillProps) {
  const t = useT();
  const rowY = useTransform(collapse, (c) => c * COLLAPSE_ROW_DY);
  const fieldOpacity = useTransform(collapse, (c) => 1 - Math.min(1, c * 1.5));
  const sideOpacity = useTransform(collapse, (c) => 1 - Math.min(1, c * 2));
  const titleScale = useTransform(collapse, (c) => 1 - (1 - COLLAPSED_TITLE_SCALE) * c);

  // An empty title (a page without a string title, or one whose title unregistered on exit) shows the page label.
  const dialogActive = !!dialogTitle;
  const pageLabel = isNewTab ? t("browserMobile.searchPlaceholder") : title;
  const sideInteractive = collapsedHalf ? "none" : "auto";

  return (
    <motion.div
      ref={onPillElement}
      style={{ y: rowY }}
      className="relative flex h-[42px] items-center px-3 [touch-action:none]"
    >
      <motion.div
        aria-hidden
        style={{ opacity: fieldOpacity }}
        className="absolute inset-y-0 inset-x-3 rounded-lg border border-border bg-muted"
      />

      <motion.button
        type="button"
        onClick={onPageMenu}
        aria-label={t("browserMobile.pageMenu")}
        aria-haspopup="dialog"
        tabIndex={collapsedHalf ? -1 : undefined}
        style={{ opacity: sideOpacity, pointerEvents: sideInteractive }}
        className={SIDE_BUTTON}
      >
        <StoreLogo name={orgName} logoUrl={orgLogoUrl} className="h-[22px] w-[22px] rounded [&>span]:text-[10px]" />
      </motion.button>

      <button
        type="button"
        onClick={onSearch}
        aria-label={fmt(t("browserMobile.addressButton"), { title: dialogActive && dialogSwipe < 0.5 ? dialogTitle : pageLabel })}
        tabIndex={collapsedHalf ? -1 : undefined}
        className="relative z-10 flex h-[42px] min-w-0 flex-1 items-center justify-center rounded-lg px-1 !min-h-0 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <motion.span style={{ scale: titleScale }} className="relative flex min-w-0 max-w-full items-center justify-center">
          <span
            className="flex min-w-0 items-center gap-1.5"
            style={{ opacity: dialogActive ? dialogSwipe : 1 }}
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
            ) : isNewTab ? (
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <Icon className="h-3.5 w-3.5 shrink-0" />
            )}
            <span
              className={cn(
                "truncate text-[13px] font-medium tracking-tight",
                isNewTab ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {pageLabel}
            </span>
          </span>
          {dialogActive && (
            <span
              aria-hidden
              className="absolute inset-0 flex items-center justify-center"
              style={{ opacity: 1 - dialogSwipe }}
            >
              <span className="truncate text-[13px] font-medium tracking-tight text-foreground">{dialogTitle}</span>
            </span>
          )}
        </motion.span>
      </button>

      <motion.button
        type="button"
        onClick={onReload}
        disabled={reloadDisabled}
        aria-label={t("browser.actions.reload")}
        tabIndex={collapsedHalf ? -1 : undefined}
        style={{ opacity: sideOpacity, pointerEvents: sideInteractive }}
        className={cn(SIDE_BUTTON, reloadDisabled && "invisible")}
      >
        <motion.span
          key={reloadTick}
          className="flex"
          initial={{ rotate: 0 }}
          animate={{ rotate: reloadTick > 0 ? 360 : 0 }}
          transition={reducedMotion ? INSTANT : { duration: 0.45, ease: STANDARD_EASE }}
        >
          <RotateCw className="h-[17px] w-[17px]" />
        </motion.span>
      </motion.button>

      {collapsedHalf && (
        <button
          type="button"
          onClick={onExpand}
          aria-label={t("browserMobile.showToolbar")}
          className="absolute inset-0 z-20 !min-h-0 !min-w-0 outline-none"
        />
      )}
    </motion.div>
  );
}
