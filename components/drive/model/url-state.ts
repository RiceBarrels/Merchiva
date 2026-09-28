// Drive home URL state: `?space=&folder=&member=&source=&type=&sort=&view=&q=&preview=`.
//
// Pure (no React, no browser globals). The page hook (components/drive/use-drive-url-state.ts)
// reads the params with parseDriveParams and writes them through DRIVE_CODEC and
// lib/url-state/query-sync.ts. lib/drive/hrefs.ts driveHref writes links with the same rules
// (defaults dropped, bad ids and keys left out), so a link and a write give the same URL.

import { isDocumentId } from "@/lib/docs/ids";
import type { SearchCodec } from "@/lib/url-state/query-sync";
import {
  DRIVE_SECTIONS,
  DRIVE_SORTS,
  DRIVE_TYPE_FILTERS,
  DRIVE_VIEWS,
  VIRTUAL_SOURCE_IDS,
  type DriveSection,
  type DriveSort,
  type DriveTypeFilter,
  type DriveView,
  type VirtualSourceId,
} from "./types";

export interface DriveUrlParams {
  /** Default "my". */
  space: DriveSection;
  /** '' = root; a lowercase uuid. */
  folder: string;
  /** '' or an org_member uuid (the members section). */
  member: string;
  /** '' or a source (the apps section). */
  source: VirtualSourceId | "";
  /** Default "all". */
  type: DriveTypeFilter;
  /** '' = defaultSortFor(space). */
  sort: DriveSort | "";
  /** '' = the viewer's saved preference, else grid (list on phones). */
  view: DriveView | "";
  /** At most DRIVE_QUERY_MAX chars, raw as typed (not trimmed, so "foo " keeps its space). */
  q: string;
  /** An entry key ("item:<uuid>", "doc:<uuid>", "v:<source>:<rowId>[:<n>]") or ''. */
  preview: string;
}

/** Longest search query kept in the URL. */
export const DRIVE_QUERY_MAX = 200;

export const DEFAULT_DRIVE_PARAMS: Readonly<DriveUrlParams> = Object.freeze({
  space: "my", folder: "", member: "", source: "", type: "all", sort: "", view: "", q: "", preview: "",
});

/** Recent and Trash list newest first; every other section by name. */
export function defaultSortFor(section: DriveSection): DriveSort {
  return section === "recent" || section === "trash" ? "modified" : "name";
}

const ENTRY_PREVIEW_RE = /^(item|doc):(.+)$/i;
const VIRTUAL_PREVIEW_RE = /^v:[a-z]+:[A-Za-z0-9-]{1,80}(:\d{1,3})?$/;

function pick<T extends string>(allowed: readonly T[], value: string | null | undefined, fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** A lowercase uuid, or '' for anything else. */
function uuidParam(value: string | null | undefined): string {
  return value && isDocumentId(value) ? value.toLowerCase() : "";
}

/** A valid entry key (the uuid lowercased), or ''. */
export function previewParam(value: string | null | undefined): string {
  if (!value) return "";
  const entry = ENTRY_PREVIEW_RE.exec(value);
  if (entry) return isDocumentId(entry[2]) ? `${entry[1].toLowerCase()}:${entry[2].toLowerCase()}` : "";
  return VIRTUAL_PREVIEW_RE.test(value) ? value : "";
}

function queryParam(value: string | null | undefined): string {
  return (value ?? "").slice(0, DRIVE_QUERY_MAX);
}

/** Section-dependent default: a sort equal to the section's default is stored as ''. */
function sortParam(value: string | null | undefined, space: DriveSection): DriveSort | "" {
  const sort = pick<DriveSort | "">(DRIVE_SORTS, value, "");
  return sort === defaultSortFor(space) ? "" : sort;
}

/** Reads the Drive params; unknown or malformed values fall back to the defaults. */
export function parseDriveParams(params: { get(name: string): string | null }): DriveUrlParams {
  const space = pick(DRIVE_SECTIONS, params.get("space"), "my");
  return {
    space,
    folder: uuidParam(params.get("folder")),
    member: uuidParam(params.get("member")),
    source: pick<VirtualSourceId | "">(VIRTUAL_SOURCE_IDS, params.get("source"), ""),
    type: pick(DRIVE_TYPE_FILTERS, params.get("type"), "all"),
    sort: sortParam(params.get("sort"), space),
    view: pick<DriveView | "">(DRIVE_VIEWS, params.get("view"), ""),
    q: queryParam(params.get("q")),
    preview: previewParam(params.get("preview")),
  };
}

/**
 * Applies `patch` to a `location.search` string and returns the new search ("" or "?…").
 *
 * - Naming `space` navigates to that section's root: `folder`, `member`, `source` and `preview`
 *   are cleared unless the patch sets them too.
 * - Naming `folder` opens that folder: `preview` and `q` are cleared unless the patch sets them.
 * - Invalid values fall back to the default; defaults are dropped so the URL stays canonical, and
 *   params the home doesn't own (DynamicUIElement's `dialogs`) are kept in place.
 */
export function mergeDriveSearch(currentSearch: string, patch: Partial<DriveUrlParams>): string {
  const params = new URLSearchParams(currentSearch);
  const next: DriveUrlParams = { ...parseDriveParams(params) };
  if (patch.space !== undefined) {
    next.space = pick(DRIVE_SECTIONS, patch.space, "my");
    next.folder = "";
    next.member = "";
    next.source = "";
    next.preview = "";
  }
  if (patch.folder !== undefined) {
    next.folder = uuidParam(patch.folder);
    next.preview = "";
    next.q = "";
  }
  if (patch.member !== undefined) next.member = uuidParam(patch.member);
  if (patch.source !== undefined) next.source = pick<VirtualSourceId | "">(VIRTUAL_SOURCE_IDS, patch.source, "");
  if (patch.type !== undefined) next.type = pick(DRIVE_TYPE_FILTERS, patch.type, "all");
  if (patch.view !== undefined) next.view = pick<DriveView | "">(DRIVE_VIEWS, patch.view, "");
  if (patch.q !== undefined) next.q = queryParam(patch.q);
  if (patch.preview !== undefined) next.preview = previewParam(patch.preview);
  // After `space`: whether a sort is the default depends on the section.
  next.sort = sortParam(patch.sort !== undefined ? patch.sort : params.get("sort"), next.space);

  // Same order as driveHref, so a link and a write produce the same string.
  const write = (key: keyof DriveUrlParams, value: string, fallback: string) => {
    if (value === fallback) params.delete(key);
    else params.set(key, value);
  };
  write("space", next.space, DEFAULT_DRIVE_PARAMS.space);
  write("folder", next.folder, "");
  write("member", next.member, "");
  write("source", next.source, "");
  write("type", next.type, DEFAULT_DRIVE_PARAMS.type);
  write("sort", next.sort, "");
  write("view", next.view, "");
  if (next.q.trim() === "") params.delete("q");
  else params.set("q", next.q);
  write("preview", next.preview, "");
  const search = params.toString();
  return search ? `?${search}` : "";
}

/** Identity of the Drive-owned params; equal views give equal keys. */
export function driveParamsKey(p: DriveUrlParams): string {
  return JSON.stringify([p.space, p.folder, p.member, p.source, p.type, p.sort, p.view, p.q, p.preview]);
}

export const DRIVE_CODEC: SearchCodec<DriveUrlParams> = {
  parse: (search) => parseDriveParams(new URLSearchParams(search)),
  merge: mergeDriveSearch,
  key: driveParamsKey,
};
