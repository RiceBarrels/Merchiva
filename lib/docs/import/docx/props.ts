/**
 * `w:rPr` and `w:pPr` → plain records → CSS.
 *
 * Formatting in a .docx arrives in layers: document defaults, then the paragraph style (and everything it is
 * `w:basedOn`), then the character style, then direct formatting on the run. Each layer is read into a record whose
 * fields are `null` for "inherit", so merging is a field-wise override and a run that turns bold *off* over a bold
 * heading style still wins. Turning the record into a style string is a separate step, which is what makes both
 * halves testable without a DOM.
 *
 * The emitted declarations are the ones the editor schema actually parses (`lib/docs/editor-extensions.ts`):
 * `color`, `font-size`, `font-family` on a run span; `text-align`, `line-height`, indent and shading on the block.
 */
import { attr, attrAny, child, intAttr, intAttrAny, toggle, type XmlElement } from "./xml";
import { cssFontFamily } from "./emit";
import { resolveThemeColor, resolveThemeFont, type DocxTheme } from "./theme";
import { formatIn, formatPt, halfPointsToPt } from "./units";

/* ------------------------------------------------------------------ runs */

export type VertAlign = "superscript" | "subscript";

export interface RunProps {
  /** `null` means "inherit"; `false` means this layer switched it off. */
  readonly bold: boolean | null;
  readonly italic: boolean | null;
  readonly underline: boolean | null;
  readonly strike: boolean | null;
  readonly vertAlign: VertAlign | null;
  /** `#rrggbb`, never `auto`. */
  readonly color: string | null;
  readonly fontSizePt: number | null;
  readonly fontFamily: string | null;
  /** `#rrggbb` from `w:highlight` or a run-level `w:shd w:fill`. */
  readonly highlight: string | null;
  /** `w:vanish` — hidden text, dropped rather than rendered invisibly. */
  readonly vanish: boolean | null;
  /** `w:rStyle`, resolved by the caller against the style table. */
  readonly styleId: string | null;
}

export const EMPTY_RUN_PROPS: RunProps = {
  bold: null,
  italic: null,
  underline: null,
  strike: null,
  vertAlign: null,
  color: null,
  fontSizePt: null,
  fontFamily: null,
  highlight: null,
  vanish: null,
  styleId: null,
};

/** Word's 16 highlight names (`w:highlight w:val`); `none` clears it. */
const HIGHLIGHTS: Readonly<Record<string, string>> = {
  black: "#000000",
  blue: "#0000ff",
  cyan: "#00ffff",
  darkblue: "#000080",
  darkcyan: "#008080",
  darkgray: "#808080",
  darkgreen: "#008000",
  darkmagenta: "#800080",
  darkred: "#800000",
  darkyellow: "#808000",
  green: "#00ff00",
  lightgray: "#c0c0c0",
  magenta: "#ff00ff",
  red: "#ff0000",
  white: "#ffffff",
  yellow: "#ffff00",
};

const HEX6 = /^[0-9a-f]{6}$/;

/** `"FF0000"` → `"#ff0000"`; `auto`, `none` and anything malformed → null. */
export function hexColor(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim().replace(/^#/, "").toLowerCase();
  if (!HEX6.test(value)) return null;
  return `#${value}`;
}

function highlightHex(raw: string | null): string | null {
  if (!raw) return null;
  const name = raw.trim().toLowerCase();
  if (name === "none") return null;
  return HIGHLIGHTS[name] ?? hexColor(name);
}

/** `w:shd` on a run or paragraph: the fill is the visible colour; `w:val="clear"` with fill `auto` means none. */
export function shadingFill(shd: XmlElement | null): string | null {
  if (!shd) return null;
  const pattern = (attr(shd, "w:val") ?? "").trim().toLowerCase();
  if (pattern === "nil" || pattern === "none") return null;
  return hexColor(attr(shd, "w:fill"));
}

function runColor(rPr: XmlElement, theme: DocxTheme): string | null {
  const color = child(rPr, "w:color");
  if (!color) return null;
  const literal = hexColor(attr(color, "w:val"));
  if (literal) return literal;
  const themed = resolveThemeColor(theme, attr(color, "w:themeColor"), attr(color, "w:themeTint"), attr(color, "w:themeShade"));
  return themed ? `#${themed}` : null;
}

function runFont(rPr: XmlElement, theme: DocxTheme): string | null {
  const fonts = child(rPr, "w:rFonts");
  if (!fonts) return null;
  const literal = attrAny(fonts, "w:ascii", "w:hAnsi", "w:eastAsia", "w:cs");
  if (literal && literal.trim()) return literal.trim();
  return resolveThemeFont(theme, attrAny(fonts, "w:asciiTheme", "w:hAnsiTheme", "w:eastAsiaTheme", "w:cstheme"));
}

export function readRunProps(rPr: XmlElement | null, theme: DocxTheme): RunProps {
  if (!rPr) return EMPTY_RUN_PROPS;
  const sizeHalfPoints = intAttr(child(rPr, "w:sz"), "w:val") ?? intAttr(child(rPr, "w:szCs"), "w:val");
  const fontSizePt = sizeHalfPoints !== null && sizeHalfPoints > 0 ? halfPointsToPt(sizeHalfPoints) : null;
  const vertAlignRaw = (attr(child(rPr, "w:vertAlign"), "w:val") ?? "").trim().toLowerCase();
  return {
    bold: toggle(rPr, "w:b") ?? toggle(rPr, "w:bCs"),
    italic: toggle(rPr, "w:i") ?? toggle(rPr, "w:iCs"),
    // `w:u w:val="none"` is an explicit "not underlined", which has to beat an underlined style.
    underline: underlineValue(rPr),
    strike: toggle(rPr, "w:strike") ?? toggle(rPr, "w:dstrike"),
    vertAlign: vertAlignRaw === "superscript" || vertAlignRaw === "subscript" ? vertAlignRaw : null,
    color: runColor(rPr, theme),
    fontSizePt,
    fontFamily: runFont(rPr, theme),
    highlight: highlightHex(attr(child(rPr, "w:highlight"), "w:val")) ?? shadingFill(child(rPr, "w:shd")),
    vanish: toggle(rPr, "w:vanish"),
    styleId: attr(child(rPr, "w:rStyle"), "w:val"),
  };
}

function underlineValue(rPr: XmlElement): boolean | null {
  const u = child(rPr, "w:u");
  if (!u) return null;
  const value = (attr(u, "w:val") ?? "single").trim().toLowerCase();
  return value !== "none" && value !== "0" && value !== "false";
}

function pick<T>(over: T | null, base: T | null): T | null {
  return over !== null ? over : base;
}

/** Field-wise override: anything the outer layer left as `null` keeps the inherited value. */
export function mergeRunProps(base: RunProps, over: RunProps): RunProps {
  return {
    bold: pick(over.bold, base.bold),
    italic: pick(over.italic, base.italic),
    underline: pick(over.underline, base.underline),
    strike: pick(over.strike, base.strike),
    vertAlign: pick(over.vertAlign, base.vertAlign),
    color: pick(over.color, base.color),
    fontSizePt: pick(over.fontSizePt, base.fontSizePt),
    fontFamily: pick(over.fontFamily, base.fontFamily),
    highlight: pick(over.highlight, base.highlight),
    vanish: pick(over.vanish, base.vanish),
    styleId: pick(over.styleId, base.styleId),
  };
}

/**
 * The `style` attribute body for a run's `<span>`. Bold/italic/underline/strike are semantic tags, not
 * declarations, so they are not here — `run.ts` wraps them.
 */
export function runStyleString(props: RunProps): string {
  const out: string[] = [];
  if (props.color) out.push(`color:${props.color}`);
  if (props.fontSizePt !== null && props.fontSizePt > 0) out.push(`font-size:${formatPt(props.fontSizePt)}pt`);
  if (props.fontFamily) {
    const family = cssFontFamily(props.fontFamily);
    if (family) out.push(`font-family:${family}`);
  }
  return out.join(";");
}

/* ------------------------------------------------------------ paragraphs */

export type ParaAlign = "left" | "center" | "right" | "justify";

export interface ParaProps {
  readonly styleId: string | null;
  readonly align: ParaAlign | null;
  /** `w:ind w:left` / `w:start`, twips. */
  readonly indentLeftTwips: number | null;
  /** `w:ind w:firstLine`, twips. */
  readonly firstLineTwips: number | null;
  /** `w:ind w:hanging`, twips — a negative first line. */
  readonly hangingTwips: number | null;
  /** `w:spacing w:line` with `w:lineRule="auto"`, as a multiplier. */
  readonly lineSpacing: number | null;
  readonly shading: string | null;
  readonly pageBreakBefore: boolean | null;
  readonly numId: number | null;
  readonly ilvl: number | null;
  /** `w:outlineLvl`, 0-based — the fallback when a custom style isn't recognisably a heading. */
  readonly outlineLevel: number | null;
}

export const EMPTY_PARA_PROPS: ParaProps = {
  styleId: null,
  align: null,
  indentLeftTwips: null,
  firstLineTwips: null,
  hangingTwips: null,
  lineSpacing: null,
  shading: null,
  pageBreakBefore: null,
  numId: null,
  ilvl: null,
  outlineLevel: null,
};

const ALIGNMENTS: Readonly<Record<string, ParaAlign>> = {
  left: "left",
  start: "left",
  center: "center",
  centre: "center",
  right: "right",
  end: "right",
  both: "justify",
  justify: "justify",
  distribute: "justify",
};

/** The editor's `Indent` extension counts half-inch steps (`data-indent`, 0–8). */
export const INDENT_STEP_TWIPS = 720;
export const MAX_INDENT_STEPS = 8;

/** Left indent in twips → the editor's 0–8 indent step. */
export function indentSteps(twips: number | null): number {
  if (twips === null || !Number.isFinite(twips) || twips <= 0) return 0;
  return Math.max(0, Math.min(MAX_INDENT_STEPS, Math.round(twips / INDENT_STEP_TWIPS)));
}

/** Line spacings the editor's `LineSpacing` extension accepts, plus the tolerance Word's rounding needs. */
const SNAP_TARGETS = [1, 1.15, 1.5, 2] as const;
const SNAP_TOLERANCE = 0.08;

/**
 * `w:spacing w:line` → a CSS `line-height` multiplier. Only `w:lineRule="auto"` (240ths of a line) is a multiplier;
 * `exact` and `atLeast` are absolute heights that the editor has no attribute for, so they are dropped.
 */
export function normalizeLineSpacing(line: number | null, lineRule: string | null): number | null {
  if (line === null || !Number.isFinite(line) || line <= 0) return null;
  const rule = (lineRule ?? "auto").trim().toLowerCase();
  if (rule !== "auto") return null;
  const raw = line / 240;
  if (raw <= 0 || raw > 10) return null;
  for (const target of SNAP_TARGETS) {
    if (Math.abs(raw - target) <= SNAP_TOLERANCE) return target;
  }
  return Math.round(raw * 100) / 100;
}

export function readParaProps(pPr: XmlElement | null): ParaProps {
  if (!pPr) return EMPTY_PARA_PROPS;
  const ind = child(pPr, "w:ind");
  const spacing = child(pPr, "w:spacing");
  const numPr = child(pPr, "w:numPr");
  const alignRaw = (attr(child(pPr, "w:jc"), "w:val") ?? "").trim().toLowerCase();
  return {
    styleId: attr(child(pPr, "w:pStyle"), "w:val"),
    align: ALIGNMENTS[alignRaw] ?? null,
    indentLeftTwips: intAttrAny(ind, "w:left", "w:start"),
    firstLineTwips: intAttr(ind, "w:firstLine"),
    hangingTwips: intAttr(ind, "w:hanging"),
    lineSpacing: normalizeLineSpacing(intAttr(spacing, "w:line"), attr(spacing, "w:lineRule")),
    shading: shadingFill(child(pPr, "w:shd")),
    pageBreakBefore: toggle(pPr, "w:pageBreakBefore"),
    numId: intAttr(child(numPr, "w:numId"), "w:val"),
    ilvl: intAttr(child(numPr, "w:ilvl"), "w:val"),
    outlineLevel: intAttr(child(pPr, "w:outlineLvl"), "w:val"),
  };
}

export function mergeParaProps(base: ParaProps, over: ParaProps): ParaProps {
  return {
    // The style id is the paragraph's own; it is never inherited from the style it is based on.
    styleId: over.styleId,
    align: pick(over.align, base.align),
    indentLeftTwips: pick(over.indentLeftTwips, base.indentLeftTwips),
    firstLineTwips: pick(over.firstLineTwips, base.firstLineTwips),
    hangingTwips: pick(over.hangingTwips, base.hangingTwips),
    lineSpacing: pick(over.lineSpacing, base.lineSpacing),
    shading: pick(over.shading, base.shading),
    pageBreakBefore: pick(over.pageBreakBefore, base.pageBreakBefore),
    numId: pick(over.numId, base.numId),
    ilvl: pick(over.ilvl, base.ilvl),
    outlineLevel: pick(over.outlineLevel, base.outlineLevel),
  };
}

export interface ParagraphCssOptions {
  /** List items get their indent from the list markup, so the paragraph must not add its own. */
  readonly skipIndent?: boolean;
}

/**
 * The `style` attribute body for a `<p>` / `<hN>`. The indent also needs `data-indent`, which the caller adds —
 * `margin-left` alone is decorative, since the `Indent` extension parses the attribute.
 */
export function paragraphStyleString(props: ParaProps, options: ParagraphCssOptions = {}): string {
  const out: string[] = [];
  if (props.align) out.push(`text-align:${props.align}`);
  if (!options.skipIndent && props.indentLeftTwips !== null && props.indentLeftTwips > 0) {
    out.push(`margin-left:${formatIn(props.indentLeftTwips / 1440)}in`);
  }
  if (!options.skipIndent) {
    const firstLine = props.firstLineTwips ?? (props.hangingTwips !== null ? -props.hangingTwips : null);
    if (firstLine !== null && firstLine !== 0) out.push(`text-indent:${formatIn(firstLine / 1440)}in`);
  }
  if (props.lineSpacing !== null) out.push(`line-height:${props.lineSpacing}`);
  if (props.shading) out.push(`background-color:${props.shading}`);
  return out.join(";");
}
