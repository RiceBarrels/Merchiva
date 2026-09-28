// Names of Drive entries: cleaning what people type, validating it before the server does,
// and picking a free name next to existing siblings ("Report (2).pdf").
//
// Pure (no React). The server cleans and validates again (lib/drive/rules.ts cleanDriveName
// is the client twin of the module's rule); these helpers only keep the dialogs from offering
// what the server would refuse.

import { cleanDriveName, DRIVE_NAME_MAX } from "@/lib/drive/rules";
import type { DriveDocKind } from "./types";

export { cleanDriveName };

/**
 * One Unicode bidi control (ALM, LRM, RLM, LRE…RLO, LRI…PDI): they can make "invoice\u202Efdp.exe" read as
 * "invoiceexe.pdf". Not global, so `.test()` is safe to call repeatedly.
 */
export const BIDI_CONTROLS_RE = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/;
const BIDI_CONTROLS_ALL_RE = new RegExp(BIDI_CONTROLS_RE.source, "g");
// C0 and C1 controls, DEL included: the rest of what cleanDriveName strips.
const CONTROL_CHARS_ALL_RE = /[\u0000-\u001F\u007F-\u009F]/g;

/** Mirrors the server's DOC_TITLE_MAX (cleanDocTitle in the SpacetimeDB module). */
export const DOC_TITLE_MAX = 200;

export function stripBidiControls(s: string): string {
  return s.replace(BIDI_CONTROLS_ALL_RE, "");
}

/**
 * What the server would store for `raw`, without refusing anything: NFC → strip C0/C1 and bidi
 * controls → NFC → trim (cleanDriveName's steps). '' when nothing is left. Where cleanDriveName
 * accepts a name, both return the same string.
 */
export function cleanEntryName(raw: string): string {
  if (typeof raw !== "string") return "";
  return stripBidiControls(raw.normalize("NFC")).replace(CONTROL_CHARS_ALL_RE, "").normalize("NFC").trim();
}

export type DriveNameProblem = "empty" | "tooLong" | "invalid";

/**
 * Why the server would refuse `raw` as a name, or null.
 * - Folders and files: empty; longer than DRIVE_NAME_MAX; ".", "..", or containing "/" or "\".
 * - Docs, Sheets and Slides keep document-title rules: any title up to DOC_TITLE_MAX (whitespace
 *   runs count as one space, as the server collapses them), and '' is allowed (shown as "Untitled").
 */
export function driveNameProblem(raw: string, kind: "folder" | "file" | DriveDocKind): DriveNameProblem | null {
  const name = cleanEntryName(raw);
  if (kind === "doc" || kind === "sheet" || kind === "slides") {
    return name.replace(/\s+/g, " ").length > DOC_TITLE_MAX ? "tooLong" : null;
  }
  if (name === "") return "empty";
  if (name.length > DRIVE_NAME_MAX) return "tooLong";
  return cleanDriveName(raw) === null ? "invalid" : null;
}

const collators = new Map<string, Intl.Collator>();

function collator(locale: string | undefined): Intl.Collator {
  const key = locale ?? "";
  const hit = collators.get(key);
  if (hit) return hit;
  let made: Intl.Collator;
  try {
    made = new Intl.Collator(locale, { sensitivity: "accent" });
  } catch {
    // An unsupported tag must not take the screen down.
    made = new Intl.Collator(undefined, { sensitivity: "accent" });
  }
  collators.set(key, made);
  return made;
}

/** Whether two names would read as the same to a person: NFC, case-insensitive, accents count ("Résumé" ≠ "Resume"). */
export function sameName(a: string, b: string, locale?: string): boolean {
  return collator(locale).compare(cleanEntryName(a), cleanEntryName(b)) === 0;
}

// An extension is 1–10 ASCII letters/digits with at least one letter, like asciiFileName's rule plus the letter:
// "a.pdf", "b.mp4", "c.7z" have one; "v1.0", "Q3.2026" and ".env" don't.
const EXTENSION_RE = /^(?=[A-Za-z0-9]*[A-Za-z])[A-Za-z0-9]{1,10}$/;
const COUNTER_RE = /^(.*?) \((\d{1,6})\)$/;

/** "Report (2).pdf" → { stem: "Report", ext: ".pdf", counter: 2 }. */
function splitName(name: string): { stem: string; ext: string; counter: number } {
  let stem = name;
  let ext = "";
  const dot = name.lastIndexOf(".");
  if (dot > 0 && EXTENSION_RE.test(name.slice(dot + 1))) {
    stem = name.slice(0, dot);
    ext = name.slice(dot);
  }
  const counted = COUNTER_RE.exec(stem);
  if (counted && counted[1].trim() !== "") return { stem: counted[1], ext, counter: Number(counted[2]) };
  return { stem, ext, counter: 1 };
}

/** The first `max` UTF-16 units of `s`, never ending in half of a surrogate pair. */
function cutTo(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

/**
 * `name` when no sibling has the same name (sameName), else the first free "<stem> (n)<ext>"
 * from n = 2: "Report.pdf" → "Report (2).pdf" → "Report (3).pdf". A name that already ends in a
 * counter continues from it ("a (2).pdf" taken → "a (3).pdf"). The extension stays last, and
 * the stem is shortened when the result would exceed DRIVE_NAME_MAX.
 */
export function uniqueSiblingName(name: string, siblingNames: readonly string[], locale?: string): string {
  const clean = cleanEntryName(name);
  const taken = (candidate: string) => siblingNames.some((sibling) => sameName(sibling, candidate, locale));
  if (!taken(clean)) return clean;
  const { stem, ext, counter } = splitName(clean);
  for (let n = Math.max(2, counter + 1); ; n++) {
    const suffix = ` (${n})${ext}`;
    const candidate = `${cutTo(stem, Math.max(1, DRIVE_NAME_MAX - suffix.length)).trimEnd()}${suffix}`;
    if (!taken(candidate)) return candidate;
  }
}
