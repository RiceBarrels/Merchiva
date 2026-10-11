// Where a notification's dot goes on the device surfaces (/store, /personal).
// The device apps are lite: a row lights a tile only when that tile's lite app
// shows the thing the row is about, because opening the tile is what clears it.
//
//   chat       → the channel header (per conversation; the walkie marks it read)
//   drive      → the Drive tile (shared files, comments and replies)
//   inventory  → the Inventory tile (low stock, waste)
//   team join  → the Directory tile
//   everything else (security, supplier, forms, schedule, Mr. Merchiva) → no
//   device dot. No lite app shows those, so a device never clears them: they
//   stay unread for /manager.
//
// There is no "requests" target (that tile is a coming-soon placeholder) and no
// "merchiva" tile.

import type { NotificationFeature, NotificationFeatureKind } from "./features";

export type DeviceSurface = "store" | "personal";

/** Device tiles a notification can light (DEFAULT_DEVICE_APPS / catalog ids). */
export type DeviceDotTile = "drive" | "inventory" | "directory";

export type DeviceDotTarget =
  | { readonly kind: "tile"; readonly app: DeviceDotTile }
  | { readonly kind: "channel"; readonly conversationId: string | null };

/** The tile each feature lights, per surface. Chat is the channel header on both. */
const DEVICE_TILES: Readonly<Record<DeviceSurface, Partial<Record<NotificationFeatureKind, DeviceDotTile>>>> = {
  store: { drive: "drive", inventory: "inventory", team: "directory" },
  personal: { drive: "drive", inventory: "inventory", team: "directory" },
};

/**
 * The permission section each tile needs (its catalog `permissionKey`), or null for
 * a tile everyone has. A row only lights a tile its person can see.
 */
export const DEVICE_DOT_TILE_PERMISSION: Readonly<Record<DeviceDotTile, "dashboard" | "inventory" | null>> = {
  drive: "dashboard",
  inventory: "inventory",
  directory: null,
};

/** The device entry that carries this feature's dot on `surface`, or null for none. */
export function deviceDotTarget(feature: NotificationFeature, surface: DeviceSurface): DeviceDotTarget | null {
  if (feature.kind === "chat") return { kind: "channel", conversationId: feature.conversationId ?? null };
  const app = DEVICE_TILES[surface][feature.kind];
  return app ? { kind: "tile", app } : null;
}

/** The `useDot({ app })` key of a device target: the tile id, or "channel" for the channel header. */
export function deviceDotApp(target: DeviceDotTarget): string {
  return target.kind === "tile" ? target.app : "channel";
}
