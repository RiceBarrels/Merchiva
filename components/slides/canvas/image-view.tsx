"use client";

// Pictures (slides.md §3, §5.2). The frame clips the picture (crop = the full picture offset inside the frame, mask =
// border-radius, both of which html2canvas renders; it has no clip-path), flips mirror the picture inside the
// frame, and an outline is drawn on top. The src is checked again here (https only). A missing or broken picture
// shows a neutral box with the "image unavailable" label: after its error event, or at once when the export host
// already knows the src failed (ctx.unavailableImages; the error event's re-render may come after the capture).
// Export mode asks for a CORS copy, so a cached non-CORS copy of the same URL cannot taint the export canvas.
import { ImageOff } from "lucide-react";
import { useState } from "react";

import type { ElementRenderContext } from "@/components/slides/canvas/element-view";
import { paddedSvg } from "@/components/slides/canvas/svg-ids";
import { ROUND_RECT_RATIO, cropFrame, dashArray, hexOf } from "@/lib/slides/export/render-rules";
import { safeImageSrc } from "@/lib/slides/model/safe-values";
import type { ImageElement, Pt } from "@/lib/slides/model/types";

/** Neutral colours of the missing-picture box; fixed, because a slide looks the same in light and dark mode. */
const MISSING_BG = "#e5e7eb";
const MISSING_INK = "#6b7280";

function radiusOf(mask: ImageElement["mask"], w: Pt, h: Pt): string | undefined {
  if (mask === "ellipse") return "50%";
  if (mask === "roundRect") return `${Math.min(w, h) * ROUND_RECT_RATIO}px`;
  return undefined;
}

function Outline({ el, w, h, ctx }: { el: ImageElement; w: Pt; h: Pt; ctx: ElementRenderContext }) {
  const stroke = el.stroke;
  if (!stroke || stroke.width <= 0) return null;
  const paint = {
    fill: "none",
    stroke: hexOf(stroke.color, ctx.theme),
    strokeOpacity: stroke.alpha,
    strokeWidth: stroke.width,
    strokeDasharray: dashArray(stroke.dash, stroke.width),
  };
  const r = el.mask === "roundRect" ? Math.min(w, h) * ROUND_RECT_RATIO : 0;
  const frame = paddedSvg(w, h, stroke.width);
  return (
    <div aria-hidden="true" style={frame.box}>
      <svg {...frame.svg}>
        <g transform={frame.origin}>
          {el.mask === "ellipse" ? (
            <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...paint} />
          ) : (
            <rect x={0} y={0} width={w} height={h} rx={r} ry={r} {...paint} />
          )}
        </g>
      </svg>
    </div>
  );
}

function Missing({ label, w, h }: { label: string; w: Pt; h: Pt }) {
  const icon = Math.max(8, Math.min(32, Math.min(w, h) * 0.3));
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        background: MISSING_BG,
        color: MISSING_INK,
        fontSize: Math.max(8, Math.min(14, h * 0.12)),
        textAlign: "center",
        overflow: "hidden",
      }}
    >
      <ImageOff width={icon} height={icon} color={MISSING_INK} aria-hidden="true" />
      {label ? <span>{label}</span> : null}
    </div>
  );
}

export function ImageView({ el, w, h, ctx }: { el: ImageElement; w: Pt; h: Pt; ctx: ElementRenderContext }) {
  const src = safeImageSrc(el.src);
  // The src that failed, so a changed src is tried again.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const radius = radiusOf(el.mask, w, h);
  const missing = src === "" || failedSrc === src || (ctx.unavailableImages?.has(src) ?? false);
  const { fullW, fullH, offX, offY } = cropFrame(w, h, el.crop);
  const flip = el.flipH || el.flipV ? `scale(${el.flipH ? -1 : 1}, ${el.flipV ? -1 : 1})` : undefined;
  return (
    <>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: radius }}>
        {missing ? (
          <Missing label={ctx.labels?.imageMissing ?? ""} w={w} h={h} />
        ) : (
          <div style={{ position: "absolute", inset: 0, transform: flip }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- user image at an absolute slide position, cropped by hand */}
            <img
              src={src}
              alt={el.alt}
              draggable={false}
              decoding="async"
              referrerPolicy="no-referrer"
              crossOrigin={ctx.mode === "export" ? "anonymous" : undefined}
              onError={() => setFailedSrc(src)}
              style={{
                position: "absolute",
                left: -offX,
                top: -offY,
                width: fullW,
                height: fullH,
                maxWidth: "none",
                maxHeight: "none",
                display: "block",
              }}
            />
          </div>
        )}
      </div>
      <Outline el={el} w={w} h={h} ctx={ctx} />
    </>
  );
}
