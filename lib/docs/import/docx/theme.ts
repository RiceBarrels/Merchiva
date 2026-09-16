/**
 * `word/theme/theme1.xml` — the colour and font scheme a Word template hangs its formatting on.
 *
 * Text styled from the theme carries no literal value: `w:color w:themeColor="accent1"` and
 * `w:rFonts w:asciiTheme="minorHAnsi"` are indirections, and a reader that ignores them loses exactly the colours
 * and fonts a branded template cares most about. `w:themeTint` / `w:themeShade` then lighten or darken the slot,
 * which is how Word draws "Accent 1, Lighter 40%".
 *
 * Pure: takes a parsed element, returns a record.
 */
import { attr, child, descendant, type XmlElement } from "./xml";

export interface DocxTheme {
  /** Scheme slot (`dk1`, `accent1`, `hlink`, …) → `rrggbb`, lowercase and without `#`. */
  readonly colors: ReadonlyMap<string, string>;
  /** `a:majorFont/a:latin` — heading font. */
  readonly majorFont: string | null;
  /** `a:minorFont/a:latin` — body font. */
  readonly minorFont: string | null;
}

export const EMPTY_THEME: DocxTheme = { colors: new Map<string, string>(), majorFont: null, minorFont: null };

const SLOTS = ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"] as const;

/**
 * `w:themeColor` names → scheme slots. Word can remap these through `w:clrSchemeMapping` in settings.xml, but the
 * identity mapping below is what every default template uses.
 */
const THEME_COLOR_SLOTS: Readonly<Record<string, string>> = {
  dark1: "dk1",
  text1: "dk1",
  light1: "lt1",
  background1: "lt1",
  dark2: "dk2",
  text2: "dk2",
  light2: "lt2",
  background2: "lt2",
  accent1: "accent1",
  accent2: "accent2",
  accent3: "accent3",
  accent4: "accent4",
  accent5: "accent5",
  accent6: "accent6",
  hyperlink: "hlink",
  followedhyperlink: "folHlink",
};

const HEX6 = /^[0-9a-f]{6}$/;

function schemeColor(slot: XmlElement | null): string | null {
  if (!slot) return null;
  const srgb = attr(child(slot, "a:srgbClr"), "val");
  if (srgb && HEX6.test(srgb.toLowerCase())) return srgb.toLowerCase();
  // `a:sysClr` (windowText / window) carries the resolved value alongside the system name.
  const sys = attr(child(slot, "a:sysClr"), "lastClr");
  if (sys && HEX6.test(sys.toLowerCase())) return sys.toLowerCase();
  return null;
}

export function readTheme(root: XmlElement | null): DocxTheme {
  if (!root) return EMPTY_THEME;
  const colors = new Map<string, string>();
  const scheme = descendant(root, "a:clrScheme");
  if (scheme) {
    for (const slot of SLOTS) {
      const hex = schemeColor(child(scheme, `a:${slot}`));
      if (hex) colors.set(slot, hex);
    }
  }
  const fonts = descendant(root, "a:fontScheme");
  const latin = (group: string): string | null => {
    const typeface = attr(child(child(fonts, group), "a:latin"), "typeface");
    return typeface && typeface.trim() ? typeface.trim() : null;
  };
  return { colors, majorFont: latin("a:majorFont"), minorFont: latin("a:minorFont") };
}

/** `w:themeTint` / `w:themeShade` are hex bytes: tint blends toward white, shade toward black. */
function applyTintShade(hex: string, tint: string | null, shade: string | null): string {
  const factorOf = (raw: string | null): number | null => {
    if (!raw) return null;
    const value = Number.parseInt(raw.trim(), 16);
    return Number.isFinite(value) && value >= 0 && value <= 255 ? value / 255 : null;
  };
  const tintFactor = factorOf(tint);
  const shadeFactor = factorOf(shade);
  if (tintFactor === null && shadeFactor === null) return hex;
  const channel = (offset: number): string => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16);
    let next = value;
    if (tintFactor !== null) next = value * tintFactor + 255 * (1 - tintFactor);
    if (shadeFactor !== null) next = next * shadeFactor;
    return Math.max(0, Math.min(255, Math.round(next))).toString(16).padStart(2, "0");
  };
  return `${channel(0)}${channel(2)}${channel(4)}`;
}

/** `w:themeColor="accent1" w:themeTint="66"` → `rrggbb`, or null when the theme has nothing for it. */
export function resolveThemeColor(
  theme: DocxTheme,
  themeColor: string | null,
  tint: string | null,
  shade: string | null,
): string | null {
  if (!themeColor) return null;
  const name = themeColor.trim().toLowerCase();
  if (name === "none") return null;
  const slot = THEME_COLOR_SLOTS[name];
  const hex = slot ? theme.colors.get(slot) : undefined;
  return hex ? applyTintShade(hex, tint, shade) : null;
}

/** `w:asciiTheme="minorHAnsi"` → the theme's body font; `major*` → the heading font. */
export function resolveThemeFont(theme: DocxTheme, themeName: string | null): string | null {
  if (!themeName) return null;
  const name = themeName.trim().toLowerCase();
  if (name.startsWith("major")) return theme.majorFont;
  if (name.startsWith("minor")) return theme.minorFont;
  return null;
}
