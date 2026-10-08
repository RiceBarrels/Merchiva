"use client";

// Charts are stored import data only in Phase 1 (slides.md §3): they render as a labelled placeholder with a dashed
// border, a chart glyph and the chart's title (or the "Chart" label passed in). Colours come from the deck theme so
// the placeholder reads on every theme, in light and dark mode alike.
import { ChartColumn } from "lucide-react";

import type { ElementRenderContext } from "@/components/slides/canvas/element-view";
import { colorCssOf } from "@/lib/slides/export/render-rules";
import type { ChartElement, Pt } from "@/lib/slides/model/types";

export function ChartPlaceholderView({ el, w, h, ctx }: { el: ChartElement; w: Pt; h: Pt; ctx: ElementRenderContext }) {
  const ink = colorCssOf("theme:muted", ctx.theme);
  const icon = Math.max(10, Math.min(48, Math.min(w, h) * 0.3));
  const label = el.chart.title || ctx.labels?.chart || "";
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        border: `1px dashed ${ink}`,
        background: colorCssOf("theme:surface", ctx.theme, 0.6),
        color: ink,
        fontFamily: ctx.theme.fonts.body,
        fontSize: Math.max(8, Math.min(18, h * 0.08)),
        textAlign: "center",
        overflow: "hidden",
        padding: 4,
      }}
    >
      <ChartColumn width={icon} height={icon} color={colorCssOf("theme:muted", ctx.theme)} aria-hidden="true" />
      {label ? <span dir="auto">{label}</span> : null}
    </div>
  );
}
