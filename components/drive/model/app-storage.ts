// Drive UI model: how much the store's other apps keep ("Stored in apps" totals). Byte totals come from every
// `app_file` row of the store plus its chat bytes (useDrive().appBytesBySource), so they also count files nobody can list here:
// images inside documents, spreadsheets and presentations, other people's chat attachments, every member's
// profile photo. Totals reveal no content. Pure (no React).
//
// A module source that matches a listable source (VIRTUAL_SOURCES) belongs to that source's tile; the store logo
// and profile photos fold into the "Store & profile" tile. A tile's bytes are only those of the files it lists
// (VirtualSourceSummary.listedBytes): a tile's list is scoped to the person (their own profile photo, their own
// tasks…) while the store's totals are not, so whatever the store holds beyond that becomes a "{source}: files you
// can't open here" row. A tile listing a file of unknown size (chat attachments have no readable size row) cannot
// be split: it shows the store's total for its source, which the "files you can't open here" note covers. The rest — and a matching source the person
// may not open here (no permission, app not installed, chat on the shared tablet) — become plain rows: a label
// and a size, nothing to open.
//
// A record source (no app_file source feeds it: Forms keeps its answers as rows) shows the bytes it lists on its
// tile, and those stay out of `total`, which counts app files only.

import { fmt } from "@/lib/i18n/fmt";
import type { AppFileSource } from "@/lib/storage/sources";
import { VIRTUAL_SOURCES } from "./virtual-sources";
import type { VirtualSourceId } from "./types";

/** The listable source an app_file source belongs to; null for one Drive cannot list. */
export const APP_FILE_SOURCE_TILE: Readonly<Record<AppFileSource, VirtualSourceId | null>> = {
  chat: "chat",
  tasks: "tasks",
  inventory: "inventory",
  training: "training",
  products: "products",
  bugs: "bugs",
  logo: "profile",
  avatar: "profile",
  doc_image: null,
  sheet_image: null,
  slides_image: null,
  other: null,
};

/** Listable sources no app_file source feeds: their tile shows the bytes it lists (forms: answer text + files). */
const RECORD_SOURCES: ReadonlySet<VirtualSourceId> = new Set(
  VIRTUAL_SOURCES.map((s) => s.id).filter((id) => !Object.values(APP_FILE_SOURCE_TILE).includes(id)),
);

/** Rows for sources Drive cannot list, in this order. */
const UNLISTED_ORDER: readonly AppFileSource[] = ["doc_image", "sheet_image", "slides_image", "logo", "avatar", "other"];

export interface AppBytesRow {
  /**
   * A VirtualSourceId for a listable source the person may not open here, `<VirtualSourceId>:notListed` for the
   * files of a visible tile it does not list, else the app_file source.
   */
  readonly id: string;
  readonly labelKey: string;
  /** The tile a `:notListed` row belongs to: `labelKey` then takes its label as `{source}`. */
  readonly source?: VirtualSourceId;
  readonly bytes: number;
}

/** A tile the person sees, and the bytes of the files it lists (null when one of their sizes is unknown). */
export interface VisibleAppSource {
  readonly id: VirtualSourceId;
  readonly listedBytes: number | null;
}

export interface AppStorageSummary {
  /** Bytes of every app file of the store. */
  readonly total: number;
  /** Bytes per tile of the files (for a record source, the records) it lists; tiles listing nothing sized are absent. */
  readonly bySource: ReadonlyMap<VirtualSourceId, number>;
  /** Sources with files that have no tile here, non-clickable, in a fixed order. */
  readonly rows: readonly AppBytesRow[];
}

const positive = (n: number | undefined): number => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0);

/**
 * Splits the store's per-source totals into the tiles the person sees (`visible`) and plain rows for the rest.
 * A source with no bytes gets no row.
 */
export function appStorageSummary(
  appBytesBySource: ReadonlyMap<AppFileSource, number>,
  visible: Iterable<VisibleAppSource>,
): AppStorageSummary {
  const listed = new Map<VirtualSourceId, number | null>();
  for (const source of visible) listed.set(source.id, source.listedBytes === null ? null : positive(source.listedBytes));
  const shown = new Set(listed.keys());
  const stored = new Map<VirtualSourceId, number>();
  const bySource = new Map<VirtualSourceId, number>();
  const hidden = new Map<VirtualSourceId, number>();
  const unlisted = new Map<AppFileSource, number>();
  let total = 0;
  for (const [source, raw] of appBytesBySource) {
    const bytes = positive(raw);
    if (bytes === 0) continue;
    total += bytes;
    const tile = APP_FILE_SOURCE_TILE[source] ?? null;
    if (tile !== null && shown.has(tile)) stored.set(tile, (stored.get(tile) ?? 0) + bytes);
    else if (tile !== null && tile !== "profile") hidden.set(tile, (hidden.get(tile) ?? 0) + bytes);
    else {
      // The mapper already reads an unknown source as "other"; a stray one still counts there.
      const key: AppFileSource = Object.hasOwn(APP_FILE_SOURCE_TILE, source) ? source : "other";
      unlisted.set(key, (unlisted.get(key) ?? 0) + bytes);
    }
  }
  const rows: AppBytesRow[] = [];
  for (const meta of VIRTUAL_SOURCES) {
    if (RECORD_SOURCES.has(meta.id)) {
      const own = listed.get(meta.id);
      if (own) bySource.set(meta.id, own);
      continue;
    }
    const bytes = hidden.get(meta.id);
    if (bytes) rows.push({ id: meta.id, labelKey: meta.labelKey, bytes });
    const inStore = stored.get(meta.id) ?? 0;
    const listedBytes = listed.get(meta.id);
    const inTile = listedBytes === null ? inStore : Math.min(listedBytes ?? 0, inStore);
    if (inTile > 0) bySource.set(meta.id, inTile);
    if (inStore > inTile) {
      rows.push({ id: `${meta.id}:notListed`, labelKey: "drive.apps.bytesNotListed", source: meta.id, bytes: inStore - inTile });
    }
  }
  for (const source of UNLISTED_ORDER) {
    const bytes = unlisted.get(source);
    if (bytes) rows.push({ id: source, labelKey: `drive.apps.bytesSource.${source}`, bytes });
  }
  return { total, bySource, rows };
}

/** A row's label for a person: a `:notListed` row names its tile. */
export function appBytesRowLabel(row: AppBytesRow, t: (key: string) => string): string {
  const meta = row.source ? VIRTUAL_SOURCES.find((s) => s.id === row.source) : undefined;
  return meta ? fmt(t(row.labelKey), { source: t(meta.labelKey) }) : t(row.labelKey);
}
