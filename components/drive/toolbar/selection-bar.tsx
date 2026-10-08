"use client";

// What a selection can do: "{count} selected", one button per action every selected entry
// allows (selectionActions: move, download, trash; restore and delete forever in Trash), select
// all, and clear. On desktop it takes the place of the toolbar's filters; on phones it floats at
// the bottom of the page's scroll area. Offline, only downloading stays.
//
// The phone bar sticks to the page's scroller rather than being `fixed` to the viewport: inside
// the mobile browser shell the page sits in #mobile-content, a stacking context under the fixed
// bottom chrome (components/browser-shell/mobile/mobile-browser-chrome.tsx, lib/browser-shell/
// mobile/geometry.ts Z.chrome), and the scroller already ends above that chrome and its safe
// area. `--shell-scroll-pad` is the part of it the expanded chrome still covers in overlay mode.

import { Download, FolderInput, RotateCcw, SquareCheck, Trash2, X, XCircle, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DriveBulkAction } from "@/components/drive/model/actions";
import type { DriveEntry, DriveSection } from "@/components/drive/model/types";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { cn } from "@/lib/utils";
import { selectionActions } from "./selection-actions";

const BULK: Readonly<Record<DriveBulkAction, { labelKey: string; icon: LucideIcon; destructive?: boolean }>> = {
  move: { labelKey: "drive.menu.move", icon: FolderInput },
  download: { labelKey: "drive.menu.download", icon: Download },
  trash: { labelKey: "drive.menu.trash", icon: Trash2 },
  restore: { labelKey: "drive.menu.restore", icon: RotateCcw },
  deleteForever: { labelKey: "drive.menu.deleteForever", icon: XCircle, destructive: true },
};

export interface SelectionBarProps {
  /** The selected entries (resolved). */
  entries: readonly DriveEntry[];
  section: DriveSection;
  onAction(action: DriveBulkAction): void;
  onClear(): void;
  /** Shown while not every visible entry is selected. */
  onSelectAll?: (() => void) | null;
  offline?: boolean;
  /** An action on the selection is running. */
  busy?: boolean;
  /**
   * Phones: a bar that sticks to the bottom of the page's scroll area. Render it as the last child
   * of the page's content column (after the results; `mt-auto` takes it to the bottom of a
   * full-height flex column), so it stays in view while the list scrolls.
   */
  floating?: boolean;
  className?: string;
}

export function SelectionBar({ entries, section, onAction, onClear, onSelectAll = null, offline = false, busy = false, floating = false, className }: SelectionBarProps) {
  const t = useT();
  if (entries.length === 0) return null;
  const actions = selectionActions(entries, section, offline);

  return (
    <section
      aria-label={fmt(t("drive.list.selected"), { count: entries.length })}
      className={cn(
        "flex min-w-0 items-center gap-1",
        floating &&
          "sticky bottom-[calc(var(--shell-scroll-pad,0px)+0.5rem)] z-30 mt-auto rounded-lg border border-border bg-background px-1.5 py-1.5 shadow-md",
        className,
      )}
    >
      <Button type="button" variant="ghost" size="icon-sm" aria-label={t("drive.list.clearSelection")} title={t("drive.list.clearSelection")} onClick={onClear}>
        <X aria-hidden />
      </Button>
      <p aria-live="polite" className="min-w-0 truncate px-1 text-[13px] font-medium text-foreground tabular-nums">
        {fmt(t("drive.list.selected"), { count: entries.length })}
      </p>
      <div className="ms-auto flex shrink-0 items-center gap-0.5">
        {onSelectAll && (
          <Button type="button" variant="ghost" size="sm" onClick={onSelectAll} className="gap-1.5" title={t("drive.list.selectAll")}>
            <SquareCheck aria-hidden />
            <span className={cn(floating ? "sr-only" : "sr-only sm:not-sr-only")}>{t("drive.list.selectAll")}</span>
          </Button>
        )}
        {actions.map((action) => {
          const meta = BULK[action];
          const Icon = meta.icon;
          return (
            <Button
              key={action}
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              title={t(meta.labelKey)}
              onClick={() => onAction(action)}
              className={cn("gap-1.5", meta.destructive && "text-destructive hover:text-destructive")}
            >
              <Icon aria-hidden />
              <span className={cn(floating ? "sr-only" : "sr-only xl:not-sr-only")}>{t(meta.labelKey)}</span>
            </Button>
          );
        })}
      </div>
    </section>
  );
}
