"use client";

import { useEffect, useState, type ReactNode } from "react";
import { BookOpen, ChevronLeft, ChevronRight, Share } from "lucide-react";
import { motion, useMotionValue, useMotionValueEvent, useTransform, type MotionValue } from "motion/react";
import type { AppIcon } from "@/components/device/app-icons";
import {
  COLLAPSE_SURFACE_DY,
  COLLAPSE_TOOLBAR_DY,
  TAP_SPRING,
  bottomPad,
  expandedFootprint,
} from "@/lib/browser-shell/mobile/geometry";
import { useLongPress } from "@/lib/browser-shell/mobile/use-long-press";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { cn } from "@/lib/utils";
import { AddressPill } from "./address-pill";
import { TabCountGlyph } from "./tab-count-glyph";

export interface BottomChromeProps {
  /** 0 expanded → 1 minimized. */
  collapse: MotionValue<number>;
  /** 0 visible → 1 off-screen. */
  hide: MotionValue<number>;
  hidden: boolean;
  zIndex: number;
  bottomInset: number;
  title: string;
  icon: AppIcon;
  isNewTab: boolean;
  pending: boolean;
  dialogTitle: string | null;
  dialogSwipe: number;
  orgName: string;
  orgLogoUrl: string | null;
  unreadCount: number;
  tabCount: number;
  canBack: boolean;
  canForward: boolean;
  reloadDisabled: boolean;
  reloadTick: number;
  androidNative: boolean;
  reducedMotion: boolean;
  onRootElement(element: HTMLElement | null): void;
  onPillElement(element: HTMLDivElement | null): void;
  onPageMenu(): void;
  onSearch(): void;
  onReload(): void;
  onExpand(): void;
  onBack(): void;
  onForward(): void;
  onShare(): void;
  onBookmarks(): void;
  onTabs(): void;
  onLongPressBack(): void;
  onLongPressForward(): void;
  onLongPressTabs(): void;
}

function noop(): void {}

function ToolbarButton({
  label,
  onClick,
  onLongPress,
  disabled = false,
  reducedMotion,
  opensDialog = false,
  children,
}: {
  label: string;
  onClick(): void;
  onLongPress?: () => void;
  disabled?: boolean;
  reducedMotion: boolean;
  opensDialog?: boolean;
  children: ReactNode;
}) {
  const longPress = useLongPress(onLongPress ?? noop, { disabled: disabled || !onLongPress });
  return (
    <motion.button
      type="button"
      aria-label={label}
      aria-haspopup={opensDialog ? "dialog" : undefined}
      disabled={disabled}
      onClick={onClick}
      whileTap={reducedMotion || disabled ? undefined : { scale: 0.9 }}
      transition={TAP_SPRING}
      className="flex h-[44px] items-center justify-center rounded-lg text-foreground outline-none [touch-action:manipulation] focus-visible:bg-muted disabled:text-muted-foreground/40"
      {...longPress}
    >
      {children}
    </motion.button>
  );
}

/**
 * Safari-style bottom chrome (mobile-safari spec §6): address row above a five-button toolbar
 * (Back, Forward, Share, Bookmarks, Tabs). Fixed to the viewport, outside every transformed
 * ancestor. It collapses into a title strip and slides away entirely through motion values, so
 * scrolling never re-renders it per frame.
 */
export function BottomChrome({
  collapse,
  hide,
  hidden,
  zIndex,
  bottomInset,
  title,
  icon,
  isNewTab,
  pending,
  dialogTitle,
  dialogSwipe,
  orgName,
  orgLogoUrl,
  unreadCount,
  tabCount,
  canBack,
  canForward,
  reloadDisabled,
  reloadTick,
  androidNative,
  reducedMotion,
  onRootElement,
  onPillElement,
  onPageMenu,
  onSearch,
  onReload,
  onExpand,
  onBack,
  onForward,
  onShare,
  onBookmarks,
  onTabs,
  onLongPressBack,
  onLongPressForward,
  onLongPressTabs,
}: BottomChromeProps) {
  const t = useT();

  const inset = useMotionValue(bottomInset);
  useEffect(() => {
    inset.set(bottomInset);
  }, [inset, bottomInset]);

  const y = useTransform([hide, inset], ([h, b]: number[]) => h * (expandedFootprint(b) + 8));
  const surfaceY = useTransform(collapse, (c) => c * COLLAPSE_SURFACE_DY);
  const toolbarOpacity = useTransform(collapse, (c) => 1 - Math.min(1, c * 2));
  const toolbarY = useTransform(collapse, (c) => c * COLLAPSE_TOOLBAR_DY);

  const [collapsedHalf, setCollapsedHalf] = useState(false);
  useMotionValueEvent(collapse, "change", (value) => setCollapsedHalf(value > 0.5));

  return (
    <motion.nav
      ref={onRootElement}
      data-browser-chrome=""
      aria-label={t("browserMobile.chromeLabel")}
      aria-hidden={hidden || undefined}
      inert={hidden || undefined}
      className="fixed inset-x-0 bottom-0 select-none [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none]"
      style={{
        zIndex,
        y,
        paddingBottom: `max(env(safe-area-inset-bottom, 0px), ${bottomPad(bottomInset)}px)`,
      }}
    >
      <motion.div
        aria-hidden
        style={{ y: surfaceY }}
        className={cn(
          "absolute inset-x-0 top-0 -bottom-10 border-t border-border",
          androidNative ? "bg-background" : "bg-background/95 backdrop-blur-md",
        )}
      />
      <div className="relative mx-auto w-full max-w-[640px] pt-[6px]">
        <AddressPill
          collapse={collapse}
          collapsedHalf={collapsedHalf}
          title={title}
          icon={icon}
          isNewTab={isNewTab}
          pending={pending}
          dialogTitle={dialogTitle}
          dialogSwipe={dialogSwipe}
          orgName={orgName}
          orgLogoUrl={orgLogoUrl}
          unreadCount={unreadCount}
          reloadDisabled={reloadDisabled}
          reloadTick={reloadTick}
          reducedMotion={reducedMotion}
          onPillElement={onPillElement}
          onPageMenu={onPageMenu}
          onSearch={onSearch}
          onReload={onReload}
          onExpand={onExpand}
        />
        <motion.div
          aria-hidden={collapsedHalf || undefined}
          inert={collapsedHalf || undefined}
          style={{ opacity: toolbarOpacity, y: toolbarY, pointerEvents: collapsedHalf ? "none" : "auto" }}
          className="relative mt-[2px] grid h-[44px] grid-cols-5 px-2"
        >
          <ToolbarButton
            label={t("browser.actions.back")}
            onClick={onBack}
            onLongPress={onLongPressBack}
            disabled={!canBack}
            reducedMotion={reducedMotion}
          >
            <ChevronLeft className="h-[22px] w-[22px] rtl:-scale-x-100" strokeWidth={1.75} />
          </ToolbarButton>
          <ToolbarButton
            label={t("browser.actions.forward")}
            onClick={onForward}
            onLongPress={onLongPressForward}
            disabled={!canForward}
            reducedMotion={reducedMotion}
          >
            <ChevronRight className="h-[22px] w-[22px] rtl:-scale-x-100" strokeWidth={1.75} />
          </ToolbarButton>
          <ToolbarButton label={t("browserMobile.share")} onClick={onShare} reducedMotion={reducedMotion}>
            <Share className="h-[20px] w-[20px]" strokeWidth={1.75} />
          </ToolbarButton>
          <ToolbarButton label={t("browserMobile.bookmarks")} onClick={onBookmarks} reducedMotion={reducedMotion} opensDialog>
            <BookOpen className="h-[21px] w-[21px]" strokeWidth={1.75} />
          </ToolbarButton>
          <ToolbarButton
            label={fmt(t("browserMobile.tabsButton"), { n: tabCount })}
            onClick={onTabs}
            onLongPress={onLongPressTabs}
            reducedMotion={reducedMotion}
            opensDialog
          >
            <TabCountGlyph count={tabCount} />
          </ToolbarButton>
        </motion.div>
      </div>
    </motion.nav>
  );
}
