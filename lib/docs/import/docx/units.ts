/**
 * Unit conversions for the DOCX reader.
 *
 * Word measures the same document in four units: twips (1/1440 in) for page and paragraph geometry, EMUs
 * (1/914400 in) inside drawings, half-points for `w:sz`, and eighths of a point for border widths. The editor speaks
 * CSS px at 96 dpi and points, so every read goes through one of these.
 *
 * Pure arithmetic with no DOM, which is also why the Bun tests can cover it directly.
 */
import { EMU_PER_INCH, PX_PER_INCH, TWIPS_PER_INCH } from "@/lib/docs/page-setup";

/** Largest length we will write into the HTML; anything beyond is a corrupt value, not a big page. */
const MAX_PX = 20000;

function clampPx(value: number): number {
  return Math.max(0, Math.min(MAX_PX, value));
}

/** `w:tblGrid/w:gridCol w:w`, `w:ind w:left` → CSS px at 96 dpi. */
export function twipsToPx(twips: number): number {
  if (!Number.isFinite(twips)) return 0;
  return Math.round(clampPx((twips / TWIPS_PER_INCH) * PX_PER_INCH));
}

/** `wp:extent cx/cy` → CSS px at 96 dpi. */
export function emuToPx(emu: number): number {
  if (!Number.isFinite(emu)) return 0;
  return Math.round(clampPx((emu / EMU_PER_INCH) * PX_PER_INCH));
}

/** `w:sz w:val` is half-points: 22 → 11pt. */
export function halfPointsToPt(halfPoints: number): number {
  if (!Number.isFinite(halfPoints)) return 0;
  return Math.round((halfPoints / 2) * 10) / 10;
}

/** `w:tcBorders/*` `w:sz` is eighths of a point; the result is a hairline-safe 1–8 px. */
export function eighthPointsToPx(eighths: number): number {
  if (!Number.isFinite(eighths) || eighths <= 0) return 1;
  return Math.max(1, Math.min(8, Math.round((eighths / 8) * (PX_PER_INCH / 72))));
}

/** Inches with at most three decimals and no trailing zeros, for a CSS length. */
export function formatIn(inches: number): string {
  if (!Number.isFinite(inches)) return "0";
  return String(Math.round(inches * 1000) / 1000);
}

/** Points with at most one decimal, for a CSS length. */
export function formatPt(points: number): string {
  if (!Number.isFinite(points)) return "0";
  return String(Math.round(points * 10) / 10);
}

/** Word's `v:shape style="width:120pt;height:90pt"` lengths (VML images) → px. */
export function cssLengthToPx(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*(pt|px|in|cm|mm|pc|em)?\s*$/i.exec(raw);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const perUnit: Readonly<Record<string, number>> = {
    px: 1,
    pt: PX_PER_INCH / 72,
    in: PX_PER_INCH,
    cm: PX_PER_INCH / 2.54,
    mm: PX_PER_INCH / 25.4,
    pc: PX_PER_INCH / 6,
    em: 16,
  };
  const unit = (match[2] ?? "px").toLowerCase();
  return Math.round(clampPx(value * (perUnit[unit] ?? 1)));
}

/** One CSS declaration of a VML `style` attribute, e.g. `width` from `width:120pt;height:90pt`. */
export function vmlStyleValue(style: string | null | undefined, property: string): string | null {
  if (!style) return null;
  for (const part of style.split(";")) {
    const colon = part.indexOf(":");
    if (colon < 0) continue;
    if (part.slice(0, colon).trim().toLowerCase() === property) return part.slice(colon + 1).trim();
  }
  return null;
}
