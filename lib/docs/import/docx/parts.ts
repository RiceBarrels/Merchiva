/**
 * OPC plumbing: relationships and content types.
 *
 * Nothing inside a part names another part directly. `w:hyperlink r:id`, `a:blip r:embed` and
 * `w:headerReference r:id` all point at a relationship id, which the part's own `_rels` file resolves to a target —
 * relative to that part's folder. Header and footer parts have their own `_rels`, which is why an image in a header
 * must not be looked up in `word/_rels/document.xml.rels`.
 *
 * Pure string work on parsed XML, so the Bun tests cover it without a zip.
 */
import { attr, children, type XmlElement } from "./xml";

export interface RelTarget {
  readonly id: string;
  readonly type: string;
  /** Package path (`word/media/image1.png`) for internal targets, the raw URL for external ones. */
  readonly target: string;
  readonly external: boolean;
}

export interface PartRels {
  readonly byId: ReadonlyMap<string, RelTarget>;
}

export const EMPTY_RELS: PartRels = { byId: new Map<string, RelTarget>() };

/** `"word/document.xml"` → `"word/"`; a root-level part → `""`. */
export function partDir(partPath: string): string {
  const slash = partPath.lastIndexOf("/");
  return slash < 0 ? "" : partPath.slice(0, slash + 1);
}

/** `"word/header2.xml"` → `"word/_rels/header2.xml.rels"`. */
export function relsPathFor(partPath: string): string {
  const slash = partPath.lastIndexOf("/");
  const dir = slash < 0 ? "" : partPath.slice(0, slash + 1);
  const name = slash < 0 ? partPath : partPath.slice(slash + 1);
  return `${dir}_rels/${name}.rels`;
}

/** Resolves a relationship target against the referencing part's folder, collapsing `.` and `..`. */
export function resolveTarget(baseDir: string, target: string): string {
  const raw = target.replace(/\\/g, "/");
  // A target starting with "/" is package-absolute.
  const combined = raw.startsWith("/") ? raw.slice(1) : `${baseDir}${raw}`;
  const out: string[] = [];
  for (const segment of combined.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") out.pop();
    else out.push(segment);
  }
  return out.join("/");
}

/** Reads one `_rels/*.rels` part. Relationship elements carry no namespace prefix. */
export function readRels(root: XmlElement | null, partPath: string): PartRels {
  if (!root) return EMPTY_RELS;
  const base = partDir(partPath);
  const byId = new Map<string, RelTarget>();
  for (const rel of children(root, "Relationship")) {
    const id = attr(rel, "Id");
    const target = attr(rel, "Target");
    if (!id || !target) continue;
    const external = (attr(rel, "TargetMode") ?? "").toLowerCase() === "external";
    byId.set(id, {
      id,
      type: attr(rel, "Type") ?? "",
      target: external ? target.trim() : resolveTarget(base, target),
      external,
    });
  }
  return { byId };
}

export function relTarget(rels: PartRels, id: string | null | undefined): RelTarget | null {
  if (!id) return null;
  return rels.byId.get(id) ?? null;
}

const FALLBACK_MIME: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jpe: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  svg: "image/svg+xml",
  emf: "image/x-emf",
  wmf: "image/x-wmf",
};

/** `[Content_Types].xml` `<Default Extension="png" ContentType="image/png"/>` pairs, lowercased. */
export function readContentTypes(root: XmlElement | null): ReadonlyMap<string, string> {
  const byExtension = new Map<string, string>();
  for (const def of children(root, "Default")) {
    const extension = attr(def, "Extension")?.toLowerCase();
    const type = attr(def, "ContentType");
    if (extension && type) byExtension.set(extension, type.trim().toLowerCase());
  }
  return byExtension;
}

/** Media type of a package part, from `[Content_Types].xml` first and a static table second. */
export function mimeForPath(types: ReadonlyMap<string, string>, path: string): string {
  const dot = path.lastIndexOf(".");
  const extension = dot < 0 ? "" : path.slice(dot + 1).toLowerCase();
  return types.get(extension) ?? FALLBACK_MIME[extension] ?? "application/octet-stream";
}
