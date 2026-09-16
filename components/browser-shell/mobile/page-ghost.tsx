"use client";

import type { AppIcon } from "@/components/device/app-icons";
import type { PreviewKind } from "@/lib/browser-shell";
import { getSafeAreaInsets } from "@/lib/safe-area";
import { cn } from "@/lib/utils";
import { TabPreviewArt } from "./tab-preview-art";

export interface PageGhostProps {
  title: string;
  icon: AppIcon;
  kind: PreviewKind;
  /** Swiping past the last tab: blank art. The caller owns the title, which is never overridden. */
  isNew?: boolean;
  className?: string;
}

/**
 * Placeholder page shown where a live page cannot be (mobile-safari spec §10 F1): the neighbour
 * while swiping the address pill, the settle overlay after a tab switch and the overview zoom
 * proxy. The header mirrors PageHeader's mobile variant so the hand-off to the real page is calm.
 */
export function PageGhost({ title, icon: Icon, kind, isNew = false, className }: PageGhostProps) {
  return (
    <div aria-hidden className={cn("flex h-full w-full flex-col overflow-hidden bg-background", className)}>
      <div
        className="flex shrink-0 items-center gap-2.5 border-b border-border px-4 pb-3.5"
        style={{ paddingTop: `calc(${getSafeAreaInsets().top}px + 0.875rem)` }}
      >
        <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate text-[22px] font-semibold leading-[1.15] tracking-tight text-foreground">
          {title}
        </span>
      </div>
      <TabPreviewArt kind={isNew ? "blank" : kind} size="page" />
    </div>
  );
}
