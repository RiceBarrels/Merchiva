"use client";

// Entries for the manager's plugin store (/manager/apps): every app that can
// appear on the /store and /personal home grids, with which surfaces it is
// on, whether it is required, its store category, who may use it, and its
// i18n name + description. Install state is org-wide (settings.deviceApps,
// see lib/device-apps.ts).

import { useMemo } from "react";
import { useT } from "@/lib/i18n/context";
import { REQUIRED_DEVICE_APPS } from "@/lib/device-apps";
import { driveKindHref } from "@/lib/drive/hrefs";
import { pluginCategory, type PluginCategory } from "@/lib/plugin-store";
import type { Permissions } from "@/lib/types";
import { APP_CATALOG } from "../app-catalog";
import { APP_ICONS, type AppIcon } from "../app-icons";
import { DEFAULT_DEVICE_APPS } from "../apps-grid";
import type { TileColor } from "../types";

export type DeviceSurface = "manager" | "store" | "personal";

export interface DeviceAppEntry {
  id: string;
  name: string;
  description: string;
  icon: AppIcon;
  color: TileColor;
  required: boolean;
  surfaces: DeviceSurface[];
  category: PluginCategory;
  /** Manager page of the feature (catalog apps only). */
  route?: string;
  /** Permission section a member needs to see it (undefined = everyone). */
  permissionKey?: keyof Permissions;
  /** Owners and managers only. */
  managerOnly?: boolean;
}

/** Built-in surface apps that are not part of the catalog. */
const EXTRA_REQUIRED: Array<{ id: string; color: TileColor; nameKey: string }> = [
  { id: "channel", color: "cyan", nameKey: "device.catalog.channel" },
  { id: "merchiva", color: "ink", nameKey: "device.merchivaName" },
];

export function useDeviceAppEntries(): DeviceAppEntry[] {
  const t = useT();
  return useMemo(() => {
    const required = new Set<string>(REQUIRED_DEVICE_APPS);
    const desc = (id: string) => t(`device.catalogDesc.${id}`);
    const out: DeviceAppEntry[] = [];
    for (const a of DEFAULT_DEVICE_APPS) {
      // Punching on the store device happens at log-in / log-out, not as a tile.
      const surfaces: DeviceSurface[] = a.id === "punch-in" ? ["personal"] : ["store", "personal"];
      out.push({ id: a.id, name: t(`personalDevice.apps.${a.id}`), description: desc(a.id), icon: APP_ICONS[a.id], color: a.color ?? "slate", required: required.has(a.id), surfaces, category: pluginCategory(a.id) });
    }
    for (const x of EXTRA_REQUIRED) {
      out.push({ id: x.id, name: t(x.nameKey), description: desc(x.id), icon: APP_ICONS[x.id], color: x.color, required: true, surfaces: ["store", "personal"], category: pluginCategory(x.id) });
    }
    for (const a of APP_CATALOG) {
      if (!a.lite && !a.keepManagerPage && !a.editor) continue;
      // An editor plugin has no tile: it works inside Drive on every surface, so "Open" lands on Drive's view of its files.
      out.push({
        id: a.id, name: t(`device.catalog.${a.id}`), description: desc(a.id), icon: a.icon, color: a.color ?? "slate",
        required: required.has(a.id), surfaces: a.editor ? ["manager", "store", "personal"] : ["manager", ...a.surfaces], category: pluginCategory(a.id),
        route: a.editor ? driveKindHref(a.editor) : a.route, permissionKey: a.permissionKey, managerOnly: a.managerOnly,
      });
    }
    return out;
  }, [t]);
}
