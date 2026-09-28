// Colour values from pptxtojson: `#rgb`, `#rrggbb`, `#rrggbbaa` (alpha from a:alpha), `rgb()` / `rgba()`, or a
// CSS gradient for gradient text. Each becomes a lowercase `#rrggbb` plus an alpha in 0..1.

export interface ParsedColor { hex: `#${string}`; alpha: number }

const HEX_RE = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_RE = /^rgba?\(\s*([\d.]+)%?\s*[,\s]\s*([\d.]+)%?\s*[,\s]\s*([\d.]+)%?\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i;

function byte(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
}

/** A colour, or null for anything else (names, `transparent`, gradients, garbage). */
export function parseCssColor(raw: unknown): ParsedColor | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  const hex = HEX_RE.exec(value);
  if (hex) {
    let digits = hex[1].toLowerCase();
    if (digits.length <= 4) digits = [...digits].map((d) => d + d).join("");
    const alpha = digits.length === 8 ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1;
    return { hex: `#${digits.slice(0, 6)}`, alpha: Math.round(alpha * 1000) / 1000 };
  }
  const rgb = RGB_RE.exec(value);
  if (rgb) {
    const a = rgb[4] === undefined ? 1 : rgb[4].endsWith("%") ? Number.parseFloat(rgb[4]) / 100 : Number.parseFloat(rgb[4]);
    return { hex: `#${byte(Number(rgb[1]))}${byte(Number(rgb[2]))}${byte(Number(rgb[3]))}`, alpha: clamp01(a) };
  }
  const lower = value.toLowerCase();
  if (lower === "white") return { hex: "#ffffff", alpha: 1 };
  if (lower === "black") return { hex: "#000000", alpha: 1 };
  return null;
}

/** The first colour inside a CSS value (a gradient's first stop), or null. */
export function firstColorIn(value: string): ParsedColor | null {
  const match = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/i.exec(value);
  return match ? parseCssColor(match[0]) : null;
}

/** Relative luminance (WCAG) of a `#rrggbb`. */
export function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}
