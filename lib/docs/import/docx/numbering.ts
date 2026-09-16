/**
 * `word/numbering.xml` — what kind of list a `w:numPr` actually is.
 *
 * A list paragraph carries only a `w:numId` and a `w:ilvl`. Everything that decides the markup lives two hops away:
 * `w:num` → `w:abstractNumId` → `w:abstractNum/w:lvl` → `w:numFmt` (bullet vs. decimal), `w:start` (where an
 * `<ol>` counts from) and `w:lvlText` (which is how a Word checklist announces itself — a bullet list whose glyph
 * is a Wingdings ballot box).
 *
 * Pure: parsed elements in, records out. `levelFormat` takes plain strings so the mapping is testable on its own.
 */
import { attr, child, children, intAttr, type XmlElement } from "./xml";

export type ListFormat = "bullet" | "ordered" | "task";

export interface NumberingLevel {
  readonly format: ListFormat;
  /** `w:start w:val`; 1 unless the list counts from somewhere else. */
  readonly start: number;
  /** Task lists only: whether the level's glyph is a *ticked* box. */
  readonly checked: boolean;
}

export interface NumberingTable {
  readonly abstractByNum: ReadonlyMap<number, number>;
  readonly levelsByAbstract: ReadonlyMap<number, ReadonlyMap<number, NumberingLevel>>;
  /** `w:num/w:lvlOverride/w:lvl` — a whole replacement level, keyed `numId:ilvl`. */
  readonly overrides: ReadonlyMap<string, NumberingLevel>;
  /** `w:num/w:lvlOverride/w:startOverride` — "this instance restarts at N", keyed `numId:ilvl`. */
  readonly startOverrides: ReadonlyMap<string, number>;
}

export const EMPTY_NUMBERING: NumberingTable = {
  abstractByNum: new Map<number, number>(),
  levelsByAbstract: new Map<number, ReadonlyMap<number, NumberingLevel>>(),
  overrides: new Map<string, NumberingLevel>(),
  startOverrides: new Map<string, number>(),
};

/**
 * Ballot-box glyphs, as code points. Word writes Wingdings characters into the Private Use Area (`F0A8` is
 * Wingdings `A8`), and other producers use the real Unicode boxes.
 */
const BALLOT_BOXES = new Set<number>([0xa8, 0xfd, 0xfe, 0x2610, 0x2611, 0x2612, 0x25a1, 0x274f, 0x2751, 0x2752]);
const TICKED_BOXES = new Set<number>([0xfd, 0xfe, 0x2611, 0x2612]);

/** PUA-mapped Wingdings characters are `F000 + code`; everything else is itself. */
function glyphCodePoint(lvlText: string): number | null {
  for (const ch of lvlText) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    // `%1`, `.`, `)` and whitespace are decoration around the number, never the glyph.
    if (cp <= 0x2f && cp !== 0x2a) continue;
    return cp >= 0xf000 && cp <= 0xf0ff ? cp - 0xf000 : cp;
  }
  return null;
}

/**
 * `w:numFmt` + `w:lvlText` → the markup a level needs.
 *
 * `none` joins `bullet` on the unnumbered side: a level with no marker is closer to a `<ul>` than to an `<ol>` that
 * would invent numbers the document never had.
 */
export function levelFormat(numFmt: string | null, lvlText: string | null): { format: ListFormat; checked: boolean } {
  const fmt = (numFmt ?? "bullet").trim().toLowerCase();
  if (fmt !== "bullet" && fmt !== "none") return { format: "ordered", checked: false };
  const glyph = lvlText ? glyphCodePoint(lvlText) : null;
  if (glyph !== null && BALLOT_BOXES.has(glyph)) return { format: "task", checked: TICKED_BOXES.has(glyph) };
  return { format: "bullet", checked: false };
}

function readLevel(lvl: XmlElement): NumberingLevel {
  const start = intAttr(child(lvl, "w:start"), "w:val");
  const { format, checked } = levelFormat(attr(child(lvl, "w:numFmt"), "w:val"), attr(child(lvl, "w:lvlText"), "w:val"));
  return { format, start: start !== null && start > 0 ? start : 1, checked };
}

function readLevels(abstractNum: XmlElement): Map<number, NumberingLevel> {
  const levels = new Map<number, NumberingLevel>();
  for (const lvl of children(abstractNum, "w:lvl")) {
    const ilvl = intAttr(lvl, "w:ilvl");
    if (ilvl === null || ilvl < 0) continue;
    levels.set(ilvl, readLevel(lvl));
  }
  return levels;
}

export function readNumbering(root: XmlElement | null): NumberingTable {
  if (!root) return EMPTY_NUMBERING;

  const levelsByAbstract = new Map<number, ReadonlyMap<number, NumberingLevel>>();
  // `w:numStyleLink` points at the abstract definition that owns the levels; `w:styleLink` is how it is found.
  const byStyleLink = new Map<string, number>();
  const pendingLinks = new Map<number, string>();

  for (const abstractNum of children(root, "w:abstractNum")) {
    const id = intAttr(abstractNum, "w:abstractNumId");
    if (id === null) continue;
    const levels = readLevels(abstractNum);
    levelsByAbstract.set(id, levels);
    const styleLink = attr(child(abstractNum, "w:styleLink"), "w:val");
    if (styleLink) byStyleLink.set(styleLink, id);
    const numStyleLink = attr(child(abstractNum, "w:numStyleLink"), "w:val");
    if (numStyleLink && levels.size === 0) pendingLinks.set(id, numStyleLink);
  }
  for (const [id, link] of pendingLinks) {
    const target = byStyleLink.get(link);
    const levels = target === undefined ? undefined : levelsByAbstract.get(target);
    if (levels) levelsByAbstract.set(id, levels);
  }

  const abstractByNum = new Map<number, number>();
  const overrides = new Map<string, NumberingLevel>();
  const startOverrides = new Map<string, number>();
  for (const num of children(root, "w:num")) {
    const numId = intAttr(num, "w:numId");
    if (numId === null) continue;
    const abstractId = intAttr(child(num, "w:abstractNumId"), "w:val");
    if (abstractId !== null) abstractByNum.set(numId, abstractId);
    for (const override of children(num, "w:lvlOverride")) {
      const ilvl = intAttr(override, "w:ilvl");
      if (ilvl === null || ilvl < 0) continue;
      const key = `${numId}:${ilvl}`;
      const lvl = child(override, "w:lvl");
      if (lvl) overrides.set(key, readLevel(lvl));
      const start = intAttr(child(override, "w:startOverride"), "w:val");
      if (start !== null && start > 0) startOverrides.set(key, start);
    }
  }

  return { abstractByNum, levelsByAbstract, overrides, startOverrides };
}

/** The deepest level at or above `ilvl` — Word renders levels past the definition with its last one. */
function nearestLevel(levels: ReadonlyMap<number, NumberingLevel> | undefined, ilvl: number): NumberingLevel | null {
  if (!levels || levels.size === 0) return null;
  const exact = levels.get(ilvl);
  if (exact) return exact;
  let best: NumberingLevel | null = null;
  let bestKey = -1;
  for (const [key, level] of levels) {
    if (key <= ilvl && key > bestKey) {
      best = level;
      bestKey = key;
    }
  }
  return best;
}

/** The level a `w:numPr` resolves to, or null when the numbering part doesn't define it. */
export function numberingLevel(table: NumberingTable, numId: number | null, ilvl: number | null): NumberingLevel | null {
  if (numId === null || numId <= 0) return null;
  const level = Math.max(0, ilvl ?? 0);
  const key = `${numId}:${level}`;
  const abstractId = table.abstractByNum.get(numId);
  const base = table.overrides.get(key) ?? nearestLevel(abstractId === undefined ? undefined : table.levelsByAbstract.get(abstractId), level);
  if (!base) return null;
  const start = table.startOverrides.get(key);
  return start === undefined ? base : { ...base, start };
}
