"use client";

import { Clock, FileText, LayoutGrid, Mail, Settings, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { hapticLight } from "@/lib/haptics";
import type { DeviceApp } from "@/components/device";

// Scrollable variant of the shared AppsGrid for the phone: the shared grid is
// absolutely positioned (never scrolls), but with every Merchiva feature in
// the catalog the phone needs more than one screen of tiles. Same tile
// styling; the frosted dock stays pinned at the bottom.

const ICONS: Record<string, LucideIcon> = {
  "punch-in": Clock,
  requests: Mail,
  docs: FileText,
  directory: Users,
  settings: Settings,
};

function Tile({ app, showLabel, onOpen }: { app: DeviceApp; showLabel: boolean; onOpen: (id: string) => void }) {
  const Icon = app.icon ?? ICONS[app.id] ?? LayoutGrid;
  return (
    <button
      type="button"
      onClick={() => {
        hapticLight();
        onOpen(app.id);
      }}
      className="group flex min-w-0 flex-col items-center gap-[7px] text-[11.5px] font-medium tracking-[-0.01em] text-foreground"
    >
      <span
        className={cn(
          "grid h-[60px] w-[60px] place-items-center rounded-[14px] transition-[transform,filter] duration-100 group-active:scale-[0.92] group-active:brightness-[0.92]",
          app.dark
            ? "bg-gradient-to-b from-[rgb(60_60_60)] to-[rgb(20_20_20)] text-white"
            : "bg-gradient-to-b from-white to-[rgb(240_240_240)] text-foreground shadow-[0_1px_2px_rgb(0_0_0/.08),inset_0_0_0_.5px_rgb(0_0_0/.06)] dark:from-[rgb(48_48_48)] dark:to-[rgb(30_30_30)] dark:text-[rgb(250_250_250)]",
        )}
      >
        <Icon className="h-[25px] w-[25px]" strokeWidth={1.8} />
      </span>
      {showLabel && <span className="w-full truncate text-center">{app.label}</span>}
    </button>
  );
}

export function AppsHome({ apps, onOpen, className }: { apps: DeviceApp[]; onOpen: (id: string) => void; className?: string }) {
  const dock = apps.filter((a) => a.dock).slice(0, 4);
  return (
    <div className={cn("relative h-full w-full", className)}>
      <div className="h-full overflow-y-auto overscroll-contain px-4 pb-[140px] pt-7" style={{ scrollbarWidth: "none" }}>
        <div className="grid grid-cols-4 gap-x-3 gap-y-[22px]">
          {apps.map((a) => (
            <Tile key={a.id} app={a} showLabel onOpen={onOpen} />
          ))}
        </div>
      </div>
      {dock.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[150px] bg-gradient-to-t from-background via-background/80 to-transparent" />
      )}
      {dock.length > 0 && (
        <div className="absolute bottom-9 left-4 right-4 flex h-[88px] items-center justify-evenly rounded-[21px] bg-black/5 backdrop-blur-[20px] dark:bg-white/10">
          {dock.map((a) => (
            <Tile key={a.id} app={a} showLabel={false} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}
