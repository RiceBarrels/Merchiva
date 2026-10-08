// What pptxtojson does not report about each slide: whether it is hidden (`<p:sld show="0">`) and whether it has
// animations (a `<p:timing>` tree with effects). Read straight from the slide XML after the zip guard passed, in the
// order pptxtojson lists slides ([Content_Types].xml overrides sorted by the number in the part name), so index i
// here is slide i of the parse result. Pure over the bytes; runs in the worker.
import { readZipDirectory, readZipEntry, type ZipEntryInfo } from "./zip-directory";

export interface SlideScan {
  hidden: boolean[];
  animated: boolean[];
}

const SLIDE_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.slide+xml";
/** Largest XML part read here (the zip guard has bounded the archive; this bounds one part). */
const MAX_PART_BYTES = 32 * 1024 * 1024;
/** An animation effect node inside the slide's timing tree. */
const ANIMATION_RE = /<p:(?:anim|animEffect|animMotion|animRot|animScale|animClr|set|cmd|audio|video)\b/;

const utf8 = new TextDecoder("utf-8", { fatal: false });

function attr(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(tag);
  return match ? (match[2] ?? match[3] ?? "") : null;
}

/**
 * The start tags `<name …>` whose name `nameAt` (a sticky regex) matches right after the `<`, each up to the next
 * `>`, in document order: what `/<name\b[^>]*>/g` matches, in linear time. The regex runs `[^>]*` to the end of the
 * part from every candidate when no `>` follows, so a few KB of `<p:sld ` repeated (a part the zip guard's ratio rule
 * never sees) took minutes, and on the main-thread fallback froze the page.
 */
function* startTags(xml: string, nameAt: RegExp): Generator<string> {
  let end = -1;
  let at = xml.indexOf("<");
  while (at >= 0) {
    nameAt.lastIndex = at + 1;
    if (!nameAt.test(xml)) {
      at = xml.indexOf("<", at + 1);
      continue;
    }
    if (end < at) end = xml.indexOf(">", at);
    if (end < 0) return;
    yield xml.slice(at, end + 1);
    at = xml.indexOf("<", end + 1);
  }
}

const isDigit = (code: number) => code >= 48 && code <= 57;

/**
 * The number before `.xml` at the end of a part name (`/ppt/slides/slide12.xml` → 12), or null: what
 * `/(\d+)\.xml$/` captures, read backwards so a long run of digits is not rescanned from every start (quadratic).
 */
export function partNumber(name: string): number | null {
  if (!name.endsWith(".xml")) return null;
  const stop = name.length - 4;
  let start = stop;
  while (start > 0 && isDigit(name.charCodeAt(start - 1))) start--;
  return start < stop ? Number(name.slice(start, stop)) : null;
}

/** The slide part names in pptxtojson's order. */
export function slidePartNames(contentTypesXml: string): string[] {
  const parts: { name: string; number: number }[] = [];
  for (const tag of startTags(contentTypesXml, /(?:\w+:)?Override\b/y)) {
    if (attr(tag, "ContentType") !== SLIDE_CONTENT_TYPE) continue;
    const name = attr(tag, "PartName");
    const number = name ? partNumber(name) : null;
    if (name && number !== null) parts.push({ name: name.replace(/^\//, ""), number });
  }
  return parts.sort((a, b) => a.number - b.number).map((part) => part.name);
}

/** Hidden / animated flags of one slide's XML. */
export function scanSlideXml(xml: string): { hidden: boolean; animated: boolean } {
  const root = startTags(xml, /p:sld\b/y).next().value ?? "";
  const timing = xml.indexOf("<p:timing");
  return {
    hidden: attr(root, "show") === "0" || attr(root, "show") === "false",
    animated: timing >= 0 && ANIMATION_RE.test(xml.slice(timing)),
  };
}

function readPart(bytes: Uint8Array, byName: Map<string, ZipEntryInfo>, name: string): string | null {
  const entry = byName.get(name);
  const data = entry ? readZipEntry(bytes, entry, MAX_PART_BYTES) : null;
  return data ? utf8.decode(data) : null;
}

/** Flags per slide; empty lists when the archive cannot be read (the parse then fails on its own). */
export function scanSlides(bytes: Uint8Array): SlideScan {
  const scan: SlideScan = { hidden: [], animated: [] };
  const dir = readZipDirectory(bytes, Number.MAX_SAFE_INTEGER);
  if (typeof dir === "string") return scan;
  const byName = new Map(dir.entries.map((entry) => [entry.name, entry]));
  const types = readPart(bytes, byName, "[Content_Types].xml");
  if (types === null) return scan;
  for (const name of slidePartNames(types)) {
    const xml = readPart(bytes, byName, name);
    const flags = xml === null ? { hidden: false, animated: false } : scanSlideXml(xml);
    scan.hidden.push(flags.hidden);
    scan.animated.push(flags.animated);
  }
  return scan;
}
