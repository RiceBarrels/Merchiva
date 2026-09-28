// Every link to the Drive home and to the Sheets / Slides editors is built here;
// Docs links stay in lib/docs/hrefs.ts. Like the Docs editor, both editors are
// static routes that read `?id=` (the Capacitor static export can't prerender
// runtime ids), and links are written without a trailing slash.
//
// documentFileHref is the one editor link for any document type. It MUST equal
// the module's docLink (spacetimedb/src/index.ts), which notifications carry;
// scripts/tests/drive/parity.test.ts compares them per type.

import { documentHref, DOCS_EDIT_PATH, type DocumentHrefOptions } from "@/lib/docs/hrefs";
import { isDocumentId } from "@/lib/docs/ids";
import type { DocumentMeta } from "@/lib/docs/types";

export const DRIVE_HOME_HREF = "/manager/drive";
export const SHEET_EDIT_PATH = "/manager/drive/sheet";
export const SLIDES_EDIT_PATH = "/manager/drive/slides";

// The Drive home's URL codec (drive-ui §6.1, components/drive/model/url-state.ts) drops defaults and unknown values;
// driveHref writes only what that codec keeps.
const DRIVE_SECTIONS: ReadonlySet<string> = new Set(["my", "store", "shared", "recent", "starred", "trash", "apps", "members"]);
const DRIVE_SOURCES: ReadonlySet<string> = new Set(["chat", "tasks", "inventory", "training", "products", "bugs", "profile"]);
const ENTRY_PREVIEW_RE = /^(item|doc):([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const VIRTUAL_PREVIEW_RE = /^v:[a-z]+:[A-Za-z0-9-]{1,80}(:\d{1,3})?$/;

function previewParam(value: string): string {
  const entry = ENTRY_PREVIEW_RE.exec(value);
  if (entry) return `${entry[1].toLowerCase()}:${entry[2].toLowerCase()}`;
  return VIRTUAL_PREVIEW_RE.test(value) ? value : "";
}

/**
 * Drive home URL: `/manager/drive[?space=…&folder=…&member=…&source=…&preview=…]`. Defaults (`space=my`, '') and
 * values the home would ignore (unknown section or source, a folder / member that is not a uuid, a malformed
 * preview key) are left out.
 */
export function driveHref(params: { space?: string; folder?: string; member?: string; source?: string; preview?: string } = {}): string {
  const search = new URLSearchParams();
  const space = params.space ?? "";
  if (space !== "my" && DRIVE_SECTIONS.has(space)) search.set("space", space);
  if (params.folder && isDocumentId(params.folder)) search.set("folder", params.folder.toLowerCase());
  if (params.member && isDocumentId(params.member)) search.set("member", params.member.toLowerCase());
  if (params.source && DRIVE_SOURCES.has(params.source)) search.set("source", params.source);
  const preview = params.preview ? previewParam(params.preview) : "";
  if (preview) search.set("preview", preview);
  const query = search.toString();
  return query ? `${DRIVE_HOME_HREF}?${query}` : DRIVE_HOME_HREF;
}

/** `<path>?id=<id>[&comment=…][&version=…][&new=1]`: the same parameters, in the same order, as documentHref. */
function editorHref(path: string, id: string, opts: DocumentHrefOptions, extra: ReadonlyArray<readonly [string, string]> = []): string {
  const params = [`id=${encodeURIComponent(id.trim().toLowerCase())}`];
  if (opts.comment) params.push(`comment=${encodeURIComponent(opts.comment)}`);
  for (const [name, value] of extra) params.push(`${name}=${encodeURIComponent(value)}`);
  if (opts.version) params.push(`version=${encodeURIComponent(opts.version)}`);
  if (opts.isNew) params.push("new=1");
  return `${path}?${params.join("&")}`;
}

/** "/manager/drive/sheet?id=<id>[&version=<versionId>][&new=1]" */
export function sheetHref(id: string, opts: { isNew?: boolean; version?: string } = {}): string {
  return editorHref(SHEET_EDIT_PATH, id, opts);
}

/** "/manager/drive/slides?id=<id>[&slide=<slideId>][&version=<versionId>][&new=1][&present=1]" */
export function slidesHref(id: string, opts: { isNew?: boolean; slide?: string; version?: string; present?: boolean } = {}): string {
  const href = editorHref(SLIDES_EDIT_PATH, id, opts, opts.slide ? [["slide", opts.slide]] : []);
  return opts.present ? `${href}&present=1` : href;
}

/**
 * The editor link of any document: Docs → documentHref, Sheets / Slides → their editor (a comment thread is kept,
 * as the module's docLink does); "unknown" (a newer client's type) → the Drive home.
 */
export function documentFileHref(doc: Pick<DocumentMeta, "id" | "fileType">, opts: DocumentHrefOptions = {}): string {
  switch (doc.fileType) {
    case "doc":
      return documentHref(doc.id, opts);
    case "sheet":
      return editorHref(SHEET_EDIT_PATH, doc.id, opts);
    case "slides":
      return editorHref(SLIDES_EDIT_PATH, doc.id, opts);
    default:
      return DRIVE_HOME_HREF;
  }
}

const EDITOR_KIND_BY_PATH: ReadonlyMap<string, "doc" | "sheet" | "slides"> = new Map([
  [DOCS_EDIT_PATH, "doc"],
  [SHEET_EDIT_PATH, "sheet"],
  [SLIDES_EDIT_PATH, "slides"],
]);

/**
 * `/manager/docs/edit`, `/manager/drive/sheet` or `/manager/drive/slides` with a valid `?id=` → the editor and the
 * lowercase id. A trailing slash (static builds), a hash and extra parameters are tolerated; anything else → null.
 */
export function parseEditorHref(href: string): { kind: "doc" | "sheet" | "slides"; id: string } | null {
  if (typeof href !== "string") return null;
  const [path, query = ""] = href.split("#")[0].split("?");
  const kind = EDITOR_KIND_BY_PATH.get(path.replace(/\/+$/, "") || "/");
  if (!kind) return null;
  const id = new URLSearchParams(query).get("id");
  return id && isDocumentId(id) ? { kind, id: id.toLowerCase() } : null;
}
