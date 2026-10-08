// Stage zoom levels (slides.md §7.3): "fit" follows the viewport; a number is the scale of a slide pt to a CSS px.
// Pure, shared by the toolbar's zoom control and View ▸ Zoom.
import { ZOOM_MAX, ZOOM_MIN } from "@/lib/slides/editor/ui-state";

/** The levels the zoom menus offer. */
export const ZOOM_PRESETS: readonly number[] = [0.5, 0.75, 1, 1.25, 1.5, 2];
/** The levels zoom in / out step through. */
export const ZOOM_STEPS: readonly number[] = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

/**
 * The next level up or down. From "fit" it steps from `fitScale`, the scale the stage shows the slide at, so zooming
 * in always makes the slide bigger; only when that scale is unknown does zooming in start at 100% and out at 50%.
 */
export function stepZoom(zoom: number | "fit", dir: 1 | -1, fitScale: number | null = null): number {
  const from = zoom !== "fit" ? zoom : fitScale !== null && Number.isFinite(fitScale) && fitScale > 0 ? fitScale : null;
  if (from === null) return dir > 0 ? 1 : 0.5;
  const next = dir > 0 ? ZOOM_STEPS.find((z) => z > from + 1e-9) : [...ZOOM_STEPS].reverse().find((z) => z < from - 1e-9);
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next ?? from));
}

/** "125%" for 1.25 (the caller shows "fit" through i18n). */
export function zoomPercent(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}

/** The menu value of a zoom: "fit", or the scale as a string. */
export function zoomValue(zoom: number | "fit"): string {
  return zoom === "fit" ? "fit" : String(zoom);
}

/** Inverse of zoomValue; null for anything else. */
export function parseZoomValue(value: unknown): number | "fit" | null {
  if (value === "fit") return "fit";
  const n = typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) && n >= ZOOM_MIN && n <= ZOOM_MAX ? n : null;
}
