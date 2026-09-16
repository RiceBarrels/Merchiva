/**
 * `word/styles.xml` — the style table, and what a style *means*.
 *
 * Two jobs, both of which the old mammoth-based reader skipped:
 *
 * 1. Resolution. A paragraph's `w:pStyle` points at a style that is `w:basedOn` another style, and so on up to the
 *    document defaults. Run formatting that a template defines once on "Heading 1" is otherwise invisible — the
 *    paragraph itself carries no colour, size or font at all.
 * 2. Recognition. Whether a style *is* a title or a heading has to be decided from both its `w:styleId` and its
 *    `w:name` (Word writes id `Heading1`, name `heading 1`; other producers do the reverse), and a custom style
 *    based on a heading still is one.
 *
 * Pure: parsed elements in, records out.
 */
import {
  EMPTY_PARA_PROPS,
  EMPTY_RUN_PROPS,
  mergeParaProps,
  mergeRunProps,
  readParaProps,
  readRunProps,
  type ParaProps,
  type RunProps,
} from "./props";
import { EMPTY_THEME, type DocxTheme } from "./theme";
import { attr, child, children, type XmlElement } from "./xml";

export interface StyleDef {
  readonly id: string;
  /** `w:name w:val`, e.g. `heading 1`. */
  readonly name: string;
  /** `paragraph`, `character`, `table` or `numbering`. */
  readonly type: string;
  readonly basedOn: string | null;
  readonly runProps: RunProps;
  readonly paraProps: ParaProps;
}

export interface ResolvedStyle {
  readonly runProps: RunProps;
  readonly paraProps: ParaProps;
}

export interface StyleTable {
  readonly byId: ReadonlyMap<string, StyleDef>;
  /** `w:docDefaults/w:rPrDefault`. */
  readonly defaultRunProps: RunProps;
  /** `w:docDefaults/w:pPrDefault`. */
  readonly defaultParaProps: ParaProps;
  /** `w:style w:type="paragraph" w:default="1"` — usually `Normal`. */
  readonly defaultParagraphStyleId: string | null;
  /** Memoised chain walks; a long document asks for the same handful of styles thousands of times. */
  readonly cache: Map<string, ResolvedStyle>;
}

export const EMPTY_STYLE_TABLE: StyleTable = {
  byId: new Map<string, StyleDef>(),
  defaultRunProps: EMPTY_RUN_PROPS,
  defaultParaProps: EMPTY_PARA_PROPS,
  defaultParagraphStyleId: null,
  cache: new Map<string, ResolvedStyle>(),
};

/** A style that resolves to one of the editor's block types. */
export type DocxBlockKind = "title" | "subtitle" | "h1" | "h2" | "h3";

/** Guard against a `w:basedOn` cycle, which a hand-edited styles.xml can have. */
const MAX_CHAIN = 16;

export function readStyles(root: XmlElement | null, theme: DocxTheme = EMPTY_THEME): StyleTable {
  if (!root) return { ...EMPTY_STYLE_TABLE, cache: new Map<string, ResolvedStyle>() };
  const defaults = child(root, "w:docDefaults");
  const defaultRunProps = readRunProps(child(child(defaults, "w:rPrDefault"), "w:rPr"), theme);
  const defaultParaProps = readParaProps(child(child(defaults, "w:pPrDefault"), "w:pPr"));

  const byId = new Map<string, StyleDef>();
  let defaultParagraphStyleId: string | null = null;
  for (const style of children(root, "w:style")) {
    const id = attr(style, "w:styleId");
    if (!id) continue;
    const type = (attr(style, "w:type") ?? "paragraph").trim().toLowerCase();
    const isDefault = (attr(style, "w:default") ?? "").trim().toLowerCase();
    if (type === "paragraph" && (isDefault === "1" || isDefault === "true" || isDefault === "on")) {
      defaultParagraphStyleId ??= id;
    }
    byId.set(id, {
      id,
      name: attr(child(style, "w:name"), "w:val") ?? "",
      type,
      basedOn: attr(child(style, "w:basedOn"), "w:val"),
      runProps: readRunProps(child(style, "w:rPr"), theme),
      paraProps: readParaProps(child(style, "w:pPr")),
    });
  }
  return { byId, defaultRunProps, defaultParaProps, defaultParagraphStyleId, cache: new Map<string, ResolvedStyle>() };
}

/** The style and everything it is based on, base-most first. Unknown ids yield an empty chain. */
function styleChain(table: StyleTable, styleId: string | null): StyleDef[] {
  const chain: StyleDef[] = [];
  const seen = new Set<string>();
  let id = styleId;
  while (id && chain.length < MAX_CHAIN && !seen.has(id)) {
    seen.add(id);
    const style = table.byId.get(id);
    if (!style) break;
    chain.unshift(style);
    id = style.basedOn;
  }
  return chain;
}

/**
 * Document defaults + the default paragraph style + the style's own chain, merged nearest-wins. `styleId` of null
 * gives the document's baseline, which is what an unstyled paragraph inherits.
 */
export function resolveStyle(table: StyleTable, styleId: string | null): ResolvedStyle {
  const key = styleId ?? "";
  const cached = table.cache.get(key);
  if (cached) return cached;

  let runProps = table.defaultRunProps;
  let paraProps = table.defaultParaProps;
  const chain =
    table.defaultParagraphStyleId && table.defaultParagraphStyleId !== styleId
      ? [...styleChain(table, table.defaultParagraphStyleId), ...styleChain(table, styleId)]
      : styleChain(table, styleId);
  for (const style of chain) {
    runProps = mergeRunProps(runProps, style.runProps);
    paraProps = mergeParaProps(paraProps, style.paraProps);
  }
  // `mergeParaProps` keeps the outermost `styleId`, which for the baseline is nothing at all.
  const resolved: ResolvedStyle = { runProps, paraProps: { ...paraProps, styleId } };
  table.cache.set(key, resolved);
  return resolved;
}

/** Character style (`w:rStyle`) run properties, without the paragraph baseline. */
export function resolveCharacterStyle(table: StyleTable, styleId: string | null): RunProps {
  let runProps = EMPTY_RUN_PROPS;
  for (const style of styleChain(table, styleId)) runProps = mergeRunProps(runProps, style.runProps);
  return runProps;
}

/** `"heading 1"`, `"Heading1"` and `"HEADING-1"` all collapse to `heading1`. */
function normalizeStyleName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function kindForName(name: string): DocxBlockKind | null {
  if (name === "title") return "title";
  if (name === "subtitle") return "subtitle";
  const heading = /^heading([1-9])$/.exec(name);
  if (heading) {
    const level = Number(heading[1]);
    // The schema has levels 1–3; `prepareImportHtml` clamps h4–h6 too, but resolving it here keeps the style's own
    // run properties attached to the right tag.
    return level === 1 ? "h1" : level === 2 ? "h2" : "h3";
  }
  return null;
}

/** Title / Subtitle / Heading 1–9 for a style id, following `w:basedOn` so custom styles are recognised too. */
export function blockKindForStyle(table: StyleTable, styleId: string | null): DocxBlockKind | null {
  if (!styleId) return null;
  const chain = styleChain(table, styleId);
  // Nearest style first: a custom style named "Callout" based on "Heading 2" is a heading 2.
  for (let i = chain.length - 1; i >= 0; i--) {
    const style = chain[i];
    const kind = kindForName(normalizeStyleName(style.id)) ?? kindForName(normalizeStyleName(style.name));
    if (kind) return kind;
  }
  return null;
}

/** `w:outlineLvl` fallback for a paragraph whose style name says nothing: 0 → h1, 1 → h2, 2+ → h3. */
export function blockKindForOutlineLevel(level: number | null): DocxBlockKind | null {
  if (level === null || !Number.isFinite(level) || level < 0 || level > 8) return null;
  return level === 0 ? "h1" : level === 1 ? "h2" : "h3";
}
