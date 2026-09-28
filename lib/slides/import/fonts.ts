// Font families of an imported deck (slides.md §10.1 step 5, R15). No font files ship: a known family maps to a
// metric-compatible stack that ends in fonts Android WebView has (Roboto, Noto), so staff phones fall back
// predictably. The original name always comes first, so a .pptx export writes it back. A family we know nothing
// about keeps its name with a generic fallback and is reported as substituted.
import { safeFontCss } from "@/lib/slides/model/safe-values";

const SANS_TAIL = 'Roboto, "Noto Sans", sans-serif';
const SERIF_TAIL = '"Noto Serif", serif';

/** Lowercased family name → the stack that follows the original name. */
const KNOWN: ReadonlyMap<string, string> = new Map([
  ["calibri", 'Carlito, "Segoe UI", Arial, Roboto, sans-serif'],
  ["calibri light", 'Carlito, "Segoe UI", Arial, Roboto, sans-serif'],
  ["cambria", 'Caladea, Georgia, "Noto Serif", serif'],
  ["arial", '"Liberation Sans", Helvetica, Roboto, sans-serif'],
  ["helvetica", 'Arial, "Liberation Sans", Roboto, sans-serif'],
  ["times new roman", '"Liberation Serif", Times, "Noto Serif", serif'],
  ["courier new", '"Liberation Mono", "Droid Sans Mono", monospace'],
  ["microsoft yahei", '"PingFang SC", "Noto Sans SC", "Noto Sans CJK SC", sans-serif'],
  ["微软雅黑", '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", "Noto Sans CJK SC", sans-serif'],
  ["simsun", '"Songti SC", "Noto Serif SC", "Noto Serif CJK SC", serif'],
  ["宋体", 'SimSun, "Songti SC", "Noto Serif SC", "Noto Serif CJK SC", serif'],
  ["pmingliu", '"PingFang TC", "Noto Sans TC", "Noto Sans CJK TC", serif'],
  ["新細明體", 'PMingLiU, "PingFang TC", "Noto Sans TC", "Noto Sans CJK TC", serif'],
  ["mangal", '"Noto Sans Devanagari", sans-serif'],
  // Families most devices have (or have a close match for): kept, never reported.
  ["segoe ui", `"Helvetica Neue", Arial, ${SANS_TAIL}`],
  ["verdana", `"DejaVu Sans", ${SANS_TAIL}`],
  ["tahoma", `Verdana, "DejaVu Sans", ${SANS_TAIL}`],
  ["trebuchet ms", SANS_TAIL],
  ["georgia", `"DejaVu Serif", ${SERIF_TAIL}`],
  ["roboto", '"Noto Sans", sans-serif'],
  ["noto sans", "Roboto, sans-serif"],
  ["noto serif", "serif"],
]);

const ARABIC_NAME_RE = /arab|naskh|kufi|majalla|typesetting|nastaliq|thuluth|diwani/i;
const ARABIC_SCRIPT_RE = /[؀-ۿݐ-ݿࢠ-ࣿ]/;
const ARABIC_TAIL = '"Noto Naskh Arabic", "Geeza Pro", serif';

/** The first family of a CSS font-family value, unquoted and trimmed. */
function firstFamily(css: string): string {
  const first = css.split(",")[0] ?? "";
  return first.trim().replace(/^["']+|["']+$/g, "").trim();
}

/** The name with every character a font stack may not hold removed (see safeFontCss). */
function cleanName(name: string): string {
  return name
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function quote(name: string): string {
  return /^\p{L}[\p{L}\p{N}_-]*$/u.test(name) ? name : `"${name}"`;
}

const GENERIC_FAMILIES = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui"]);
/** An unresolved theme-font code ("+mn-cs" arrives as "mn-cs"): it names no family. */
const THEME_FONT_CODE_RE = /^(?:mj|mn)-(?:lt|ea|cs)$/i;

export interface MappedFont {
  /** A CSS stack that passes safeFontCss, or "" when the value names no usable family. */
  stack: string;
  /** The original family when it is unknown here (reported as `fontSubstituted`), else null. */
  substituted: string | null;
}

/** Maps pptxtojson's `font-family` value (one typeface name) to a stack. */
export function mapFontFamily(css: string): MappedFont {
  const name = cleanName(firstFamily(css));
  if (name === "" || THEME_FONT_CODE_RE.test(name)) return { stack: "", substituted: null };
  if (GENERIC_FAMILIES.has(name.toLowerCase())) return { stack: name.toLowerCase(), substituted: null };
  const known = KNOWN.get(name.toLowerCase());
  let stack: string;
  let substituted: string | null = null;
  if (known !== undefined) stack = `${quote(name)}, ${known}`;
  else if (ARABIC_NAME_RE.test(name) || ARABIC_SCRIPT_RE.test(name)) stack = `${quote(name)}, ${ARABIC_TAIL}`;
  else {
    stack = `${quote(name)}, sans-serif`;
    substituted = name;
  }
  return { stack: safeFontCss(stack) ?? "", substituted };
}
