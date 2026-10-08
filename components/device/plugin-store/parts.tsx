"use client";

// Building blocks of the plugin store: the icon tile, a screenshot frame, the
// surface badges, the Install / Open button and a list row.

import { useState } from "react";
import { Check, ChevronRight, Lock } from "lucide-react";
import { Spinner } from "@/components/ui/loaders/geometric";
import { TILE_COLORS } from "@/components/device/apps-grid";
import type { DeviceAppEntry, DeviceSurface } from "@/components/device/apps/app-store";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

export const SHOTS = [1, 2, 3] as const;

const TILE_BASE = "bg-gradient-to-b shadow-[inset_0_0_0_.5px_rgb(0_0_0/.06)] dark:from-[rgb(48_48_48)] dark:to-[rgb(30_30_30)]";

const ICON_SIZE = {
  xl: ["h-24 w-24 rounded-[20px]", "h-14 w-14"],
  lg: ["h-16 w-16 rounded-[14px]", "h-10 w-10"],
  md: ["h-12 w-12 rounded-[11px]", "h-8 w-8"],
  sm: ["h-10 w-10 rounded-[9px]", "h-6 w-6"],
} as const;

/** The plugin's glyph on its tinted tile — the same tile as the device home grids. */
export function PluginIcon({ entry, size }: { entry: DeviceAppEntry; size: keyof typeof ICON_SIZE }) {
  const Icon = entry.icon;
  const [tile, glyph] = ICON_SIZE[size];
  return (
    <span className={cn("grid shrink-0 place-items-center", tile, TILE_BASE, TILE_COLORS[entry.color])}>
      <Icon className={glyph} />
    </span>
  );
}

/** One screenshot frame; falls back to the plugin glyph when the file is missing. */
export function Shot({ entry, n, className }: { entry: DeviceAppEntry; n: number; className?: string }) {
  const [missing, setMissing] = useState(false);
  const Icon = entry.icon;
  return (
    <div className={cn("relative aspect-[16/10] shrink-0 snap-start overflow-hidden rounded-[0.5rem] border border-border bg-muted", className)}>
      {missing ? (
        <div className={cn("grid h-full w-full place-items-center bg-gradient-to-b", TILE_COLORS[entry.color])}>
          <Icon className="h-14 w-14 opacity-70" />
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/app-shots/${entry.id}-${n}.png`}
          alt=""
          loading="lazy"
          onError={() => setMissing(true)}
          className="h-full w-full object-cover object-top"
        />
      )}
    </div>
  );
}

export function surfaceLabelKey(s: DeviceSurface): string {
  return s === "manager" ? "deviceApps.surfaceManager" : s === "store" ? "deviceApps.surfaceStore" : "deviceApps.surfacePersonal";
}

export function SurfaceBadges({ surfaces }: { surfaces: DeviceSurface[] }) {
  const t = useT();
  return (
    <span className="flex flex-wrap gap-1">
      {surfaces.map((s) => (
        <span key={s} className="rounded-[0.2rem] bg-muted px-1.5 py-px font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {t(surfaceLabelKey(s))}
        </span>
      ))}
    </span>
  );
}

export interface InstallControl {
  isInstalled: (id: string) => boolean;
  savingId: string | null;
  install: (entry: DeviceAppEntry) => void;
  open: (entry: DeviceAppEntry) => void;
}

/**
 * The store's one action button. Not installed → Install. Installed (or built
 * in) → Open when the plugin has a back-office page, otherwise a quiet
 * "Installed" / "Always on" label. Removing lives on the detail and Installed views.
 */
export function InstallButton({ entry, control, className }: { entry: DeviceAppEntry; control: InstallControl; className?: string }) {
  const t = useT();
  const on = control.isInstalled(entry.id);
  const busy = control.savingId === entry.id;
  const base = "inline-flex h-8 min-w-[76px] shrink-0 items-center justify-center gap-1 rounded-full px-4 text-[12px] font-bold uppercase tracking-wide transition-colors disabled:opacity-60";
  if (!on) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={(e) => { e.stopPropagation(); control.install(entry); }}
        className={cn(base, "bg-foreground text-background hover:bg-foreground/90", className)}
      >
        {busy ? <Spinner size={12} /> : t("device.appStore.add")}
      </button>
    );
  }
  if (entry.route) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); control.open(entry); }}
        className={cn(base, "bg-muted text-foreground hover:bg-muted/70", className)}
      >
        {t("device.pluginStore.open")}
      </button>
    );
  }
  return (
    <span className={cn(base, "gap-1 px-2 text-muted-foreground", className)}>
      {entry.required ? <Lock className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
      {entry.required ? t("device.appStore.alwaysOn") : t("device.pluginStore.installed")}
    </span>
  );
}

/** A list row: icon, name, category · description, action. Clicking the row opens the detail view. */
export function PluginRow({
  entry, categoryLabel, control, onSelect, trailing,
}: {
  entry: DeviceAppEntry;
  categoryLabel: string;
  control: InstallControl;
  onSelect: (entry: DeviceAppEntry) => void;
  trailing?: React.ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(entry)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(entry); } }}
      className="group flex cursor-pointer items-center gap-3 px-1 py-2.5 outline-none focus-visible:bg-muted/60 hover:bg-muted/40"
    >
      <PluginIcon entry={entry} size="md" />
      <div className="min-w-0 flex-1 border-b border-border pb-2.5 group-last:border-b-0">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold tracking-tight">{entry.name}</p>
            <p className="truncate text-[12px] text-muted-foreground">{categoryLabel}</p>
            <p className="mt-0.5 line-clamp-1 text-[12px] text-muted-foreground">{entry.description}</p>
          </div>
          {trailing ?? <InstallButton entry={entry} control={control} />}
        </div>
      </div>
      <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180 sm:block" />
    </div>
  );
}
