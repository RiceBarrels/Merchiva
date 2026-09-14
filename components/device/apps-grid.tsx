"use client";

// iOS-style home grid + frosted dock.

import { LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_ICONS } from "./app-icons";
import { hapticLight } from "@/lib/haptics";
import type { DeviceApp, TileColor } from "./types";

export interface AppsGridProps {
  apps: DeviceApp[];
  onOpen: (id: DeviceApp["id"]) => void;
  columns?: 4 | 6;          // phone 4, tablet 6
  size?: "md" | "lg";       // tile size
  className?: string;
}

export const DEFAULT_DEVICE_APPS: DeviceApp[] = [
  { id: "punch-in", label: "Punch In", color: "ink", dock: true },
  { id: "requests", label: "Requests", color: "blue", dock: true },
  { id: "docs", label: "Docs", color: "amber", dock: true },
  { id: "directory", label: "Directory", color: "teal" },
  { id: "settings", label: "Settings", color: "slate" },
];

/** Soft tinted tile behind each multi-colour glyph (light mode); dark mode
 *  uses a uniform dark tile so the glyph colours carry the identity. */
export const TILE_COLORS: Record<TileColor, string> = {
  ink: "from-white to-neutral-200",
  slate: "from-white to-slate-200",
  red: "from-white to-red-100",
  orange: "from-white to-orange-100",
  amber: "from-white to-amber-100",
  lime: "from-white to-lime-100",
  green: "from-white to-green-100",
  emerald: "from-white to-emerald-100",
  teal: "from-white to-teal-100",
  cyan: "from-white to-cyan-100",
  sky: "from-white to-sky-100",
  blue: "from-white to-blue-100",
  indigo: "from-white to-indigo-100",
  violet: "from-white to-violet-100",
  purple: "from-white to-purple-100",
  fuchsia: "from-white to-fuchsia-100",
  pink: "from-white to-pink-100",
  rose: "from-white to-rose-100",
};
const TILE_BASE = "bg-gradient-to-b shadow-[0_1px_2px_rgb(0_0_0/.08),inset_0_0_0_.5px_rgb(0_0_0/.06)] dark:from-[rgb(48_48_48)] dark:to-[rgb(30_30_30)]";

function Tile({ app, size, showLabel, onOpen }: { app: DeviceApp; size: "md" | "lg"; showLabel: boolean; onOpen: (id: DeviceApp["id"]) => void }) {
  const Icon = app.icon ?? APP_ICONS[app.id] ?? LayoutGrid;
  const lg = size === "lg";
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
          "grid place-items-center transition-[transform,filter] duration-100 group-active:scale-[0.92] group-active:brightness-[0.92]",
          lg ? "h-[76px] w-[76px] rounded-[17px]" : "h-[60px] w-[60px] rounded-[14px]",
          TILE_BASE,
          TILE_COLORS[app.color ?? (app.dark ? "ink" : "slate")],
          "text-foreground",
        )}
      >
        <Icon className={lg ? "h-10 w-10" : "h-8 w-8"} />
      </span>
      {showLabel && <span className="w-full truncate text-center">{app.label}</span>}
    </button>
  );
}

export function AppsGrid({ apps, onOpen, columns = 4, size = "md", className }: AppsGridProps) {
  const dock = apps.filter((a) => a.dock);
  const lg = size === "lg";
  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      {/* Scrollable page of tiles; bottom padding keeps the last row clear of the dock. */}
      <div
        className={cn(
          "h-full overflow-y-auto pt-7 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          columns === 6 ? "px-10" : "px-4",
          dock.length > 0 ? (lg ? "pb-[152px]" : "pb-[140px]") : "pb-6",
        )}
      >
        <div className={cn("grid", columns === 6 ? "grid-cols-6 gap-x-4 gap-y-7" : "grid-cols-4 gap-x-3 gap-y-[22px]")}>
          {apps.map((a) => (
            <Tile key={a.id} app={a} size={size} showLabel onOpen={onOpen} />
          ))}
        </div>
      </div>
      {dock.length > 0 && (
        <div
          className={cn(
            "absolute flex items-center justify-evenly bg-black/5 backdrop-blur-[20px] dark:bg-white/10",
            lg ? "bottom-6 left-10 right-10 h-[104px] rounded-[27px]" : "bottom-9 left-4 right-4 h-[88px] rounded-[21px]",
          )}
        >
          {dock.map((a) => (
            <Tile key={a.id} app={a} size={size} showLabel={false} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}
