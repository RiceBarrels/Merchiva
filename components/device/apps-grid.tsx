"use client";

// iOS-style home grid + frosted dock.

import { Clock, FileText, LayoutGrid, Mail, Settings, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { hapticLight } from "@/lib/haptics";
import type { DeviceApp } from "./types";

export interface AppsGridProps {
  apps: DeviceApp[];
  onOpen: (id: DeviceApp["id"]) => void;
  columns?: 4 | 6;          // phone 4, tablet 6
  size?: "md" | "lg";       // tile size
  className?: string;
}

export const DEFAULT_DEVICE_APPS: DeviceApp[] = [
  { id: "punch-in", label: "Punch In", dark: true, dock: true },
  { id: "requests", label: "Requests", dock: true },
  { id: "docs", label: "Docs", dock: true },
  { id: "directory", label: "Directory" },
  { id: "settings", label: "Settings" },
];

const ICONS: Record<string, LucideIcon> = {
  "punch-in": Clock,
  requests: Mail,
  docs: FileText,
  directory: Users,
  settings: Settings,
};

function Tile({ app, size, showLabel, onOpen }: { app: DeviceApp; size: "md" | "lg"; showLabel: boolean; onOpen: (id: DeviceApp["id"]) => void }) {
  const Icon = app.icon ?? ICONS[app.id] ?? LayoutGrid;
  const lg = size === "lg";
  return (
    <button
      type="button"
      onClick={() => {
        hapticLight();
        onOpen(app.id);
      }}
      className="group flex flex-col items-center gap-[7px] text-[11.5px] font-medium tracking-[-0.01em] text-foreground"
    >
      <span
        className={cn(
          "grid place-items-center transition-[transform,filter] duration-100 group-active:scale-[0.92] group-active:brightness-[0.92]",
          lg ? "h-[76px] w-[76px] rounded-[17px]" : "h-[60px] w-[60px] rounded-[14px]",
          app.dark
            ? "bg-gradient-to-b from-[rgb(60_60_60)] to-[rgb(20_20_20)] text-white"
            : "bg-gradient-to-b from-white to-[rgb(240_240_240)] text-foreground shadow-[0_1px_2px_rgb(0_0_0/.08),inset_0_0_0_.5px_rgb(0_0_0/.06)] dark:from-[rgb(48_48_48)] dark:to-[rgb(30_30_30)] dark:text-[rgb(250_250_250)]",
        )}
      >
        <Icon className={lg ? "h-8 w-8" : "h-[25px] w-[25px]"} strokeWidth={1.8} />
      </span>
      {showLabel && <span className="truncate">{app.label}</span>}
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
