"use client";

// A plugin's glyph on its tinted tile, as the plugin store draws it (PluginIcon), for prompts that only know the
// plugin's id. The colours mirror the APP_CATALOG entries: the catalog itself lazy-imports every manager page, and
// those pages import PermissionGuard, which renders this — so it can't be imported here.

import { LayoutGrid } from "lucide-react";
import { APP_ICONS } from "@/components/device/app-icons";
import type { DeviceAppEntry } from "@/components/device/apps/app-store";
import { PluginIcon } from "@/components/device/plugin-store/parts";
import type { TileColor } from "@/components/device/types";
import { pluginCategory } from "@/lib/plugin-store";

/** Tile colour of every optional plugin, = its APP_CATALOG `color` (scripts/tests/plugins pins the two together). */
export const PLUGIN_TILE_COLORS: Readonly<Record<string, TileColor>> = {
  tasks: "green",
  training: "purple",
  pay: "emerald",
  products: "pink",
  sales: "red",
  bookings: "sky",
  docs: "amber",
  drive: "violet",
  sheets: "lime",
  slides: "fuchsia",
  forms: "teal",
};

export function pluginTileColor(appId: string): TileColor {
  return PLUGIN_TILE_COLORS[appId] ?? "slate";
}

export function PluginTile({ appId, name, size }: { appId: string; name: string; size: "lg" | "md" | "sm" }) {
  const entry: DeviceAppEntry = {
    id: appId,
    name,
    description: "",
    icon: APP_ICONS[appId] ?? LayoutGrid,
    color: pluginTileColor(appId),
    required: false,
    surfaces: [],
    category: pluginCategory(appId),
  };
  return <PluginIcon entry={entry} size={size} />;
}
