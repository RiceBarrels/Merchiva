"use client";

// DOM ids for SVG defs (slides.md §5.2). The same slide is often mounted several times at once (stage, rail
// thumbnail, sorter, presenter, speaker view, version preview, export host), so every SlideView instance takes its
// own prefix from useId(), and every gradient, marker, filter and pattern lives in a <defs> inside the <svg> that
// references it. A url(#…) therefore never resolves into another, possibly hidden, instance, and html2canvas (which
// serializes each <svg> on its own) finds its defs.
import { useId } from "react";

export type SvgDefKind = "grad" | "head" | "tail" | "clip" | "shadow" | "pattern";

/**
 * A per-instance prefix: the useId() value reduced to [A-Za-z0-9_], ending in "-", e.g. "s_R_1_-". Neither the
 * reduced id nor an element id (SLIDES_ID_RE) contains "-", so every def id splits back into its parts
 * unambiguously: instance, element, kind.
 */
export function useSvgIdPrefix(): string {
  const id = useId();
  return `s${id.replace(/[^A-Za-z0-9_]/g, "")}-`;
}

/** The id of one def: `${prefix}${elementId}-${kind}`. `elementId` must have passed SLIDES_ID_RE. */
export function svgDefId(prefix: string, elementId: string, kind: SvgDefKind): string {
  return `${prefix}${elementId}-${kind}`;
}

/**
 * The prefix for master and theme decor elements: one more "-" segment, so a decor def never takes the id of a
 * slide element's def, even when their element ids are equal.
 */
export function decorIdPrefix(prefix: string): string {
  return `${prefix}d-`;
}

export function svgUrl(id: string): string {
  return `url(#${id})`;
}

/**
 * An <svg> that draws in a `w`×`h` box but may paint up to `pad` outside it (half a stroke, a shadow, an arrowhead,
 * a callout tail). `box` goes on a wrapping <div> (the box grown by the padding and moved out by it), `svg` on the
 * <svg> and `origin` on a <g> around the drawing, so coordinates inside stay the box's own.
 *
 * Both details are for the PDF/PNG export. html2canvas rasterizes each <svg> as a standalone image cut to its
 * viewport, so `overflow: visible` alone would lose what lies outside the box. And it serializes the <svg> with its
 * `style` attribute, which then applies inside that image: a `left`/`top` offset on the <svg> itself would move
 * the drawing within its own picture. Hence the offset lives on the <div>, and the <svg> carries no position.
 */
export function paddedSvg(w: number, h: number, pad: number) {
  const p = Math.max(1, Math.ceil(pad));
  const width = Math.max(0, w) + p * 2;
  const height = Math.max(0, h) + p * 2;
  return {
    box: { position: "absolute", left: -p, top: -p, width, height, pointerEvents: "none" } as const,
    svg: { width, height, overflow: "visible", style: { display: "block", overflow: "visible" } as const },
    origin: `translate(${p} ${p})`,
  };
}
