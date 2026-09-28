// pptxtojson fills, borders and shadows → model values (slides.md §10.1 step 3). Colours arrive as `#rrggbb` or
// `#rrggbbaa`; gradient stops as "NN%"; pattern fills are approximated by their foreground colour; image fills
// resolve through the asset registry (their URL is written in after the upload).
import type { ColorValue, DashStyle, Fill, LineEnd, Shadow, Stroke } from "@/lib/slides/model/types";

import type { AssetRegistry } from "./assets";
import { parseCssColor } from "./colors";
import { num, rec, records, str, type LeanRecord } from "./lean";
import type { ImportReportBuilder } from "./report";

export interface FillContext {
  report: ImportReportBuilder;
  assets: AssetRegistry;
  /** Maps a literal colour to the stored form (theme references for the theme's own colours). */
  color: (hex: `#${string}`) => ColorValue;
}

function withAlpha<T extends object>(base: T, alpha: number): T & { alpha?: number } {
  return alpha >= 1 ? base : { ...base, alpha: Math.max(0, alpha) };
}

/** A solid fill from a colour string, or null. */
export function solidFill(raw: unknown, ctx: FillContext): Fill | null {
  const c = parseCssColor(raw);
  return c ? withAlpha({ t: "solid" as const, color: ctx.color(c.hex) }, c.alpha) : null;
}

/** An image fill whose `src` the upload fills in; null (reported once per image) when the image cannot be shown. */
export function imageFill(ref: unknown, ctx: FillContext): Fill | null {
  const found = ctx.assets.lookup(ref);
  if (!found) return null;
  if (!["png", "jpeg", "gif", "webp", "bmp", "svg"].includes(found.kind)) {
    if (ctx.assets.firstReport(found.key)) ctx.report.add("imageUnsupported");
    return null;
  }
  const fill: { t: "image"; src: string; mode: "cover" | "stretch" } = { t: "image", src: "", mode: "stretch" };
  ctx.assets.use(found.key, (url) => {
    fill.src = url;
  });
  return fill;
}

/** A pptxtojson Fill (`{ type, value }`) → Fill; null for no fill (or one that cannot be shown). */
export function mapFill(raw: unknown, ctx: FillContext): Fill | null {
  const fill = rec(raw);
  if (!fill) return null;
  const value = fill.value;
  switch (fill.type) {
    case "color":
      return solidFill(value, ctx);
    case "gradient": {
      const v = rec(value);
      const stops = records(v?.colors).flatMap((stop) => {
        const c = parseCssColor(stop.color);
        if (!c) return [];
        return [withAlpha({ pos: Math.min(1, Math.max(0, num(Number.parseFloat(str(stop.pos)), 0) / 100)), color: ctx.color(c.hex) }, c.alpha)];
      });
      if (stops.length === 0) return null;
      if (stops.length === 1) return withAlpha({ t: "solid" as const, color: stops[0].color }, stops[0].alpha ?? 1);
      return { t: "linear", angle: num(v?.rot, 0), stops };
    }
    case "image":
      return imageFill(rec(value)?.base64, ctx);
    case "pattern": {
      ctx.report.add("patternApprox");
      return solidFill(rec(value)?.foregroundColor, ctx);
    }
    default:
      return null;
  }
}

const LINE_ENDS: readonly LineEnd[] = ["none", "arrow", "triangle", "stealth", "oval", "diamond"];

function lineEnd(raw: unknown): LineEnd {
  const type = rec(raw)?.type;
  return typeof type === "string" && (LINE_ENDS as readonly string[]).includes(type) ? (type as LineEnd) : "none";
}

function dashOf(el: LeanRecord): DashStyle {
  const type = str(el.borderType);
  const pattern = str(el.borderStrokeDasharray).split(",").map((s) => s.trim()).filter((s) => s !== "" && s !== "0");
  if (pattern.length >= 4) return "dashDot";
  if (type === "dotted") return "dot";
  if (type === "dashed") return "dash";
  return "solid";
}

/**
 * The element's border as a stroke; null when it has none. `minWidth` keeps a line visible whose width the file
 * left out (PowerPoint draws those at 0.75 pt).
 */
export function mapStroke(el: LeanRecord, ctx: FillContext, minWidth = 0): Stroke | null {
  const width = Math.max(num(el.borderWidth, 0), minWidth);
  const c = parseCssColor(el.borderColor) ?? (minWidth > 0 ? { hex: "#000000" as const, alpha: 1 } : null);
  if (!c || width <= 0) return null;
  const stroke: Stroke = withAlpha({ color: ctx.color(c.hex), width, dash: dashOf(el) }, c.alpha);
  const head = lineEnd(el.headEnd);
  const tail = lineEnd(el.tailEnd);
  if (head !== "none") stroke.head = head;
  if (tail !== "none") stroke.tail = tail;
  return stroke;
}

export function mapShadow(raw: unknown, ctx: FillContext): Shadow | null {
  const s = rec(raw);
  const c = s ? parseCssColor(s.color) : null;
  if (!s || !c) return null;
  const r = (n: number) => Math.round(n * 100) / 100;
  return { x: r(num(s.h, 0)), y: r(num(s.v, 0)), blur: r(Math.max(0, num(s.blur, 0))), color: ctx.color(c.hex), alpha: c.alpha };
}
