"use client";

// A slide, drawn (slides.md §5.1, §5.2). The one pure renderer behind the editor stage, rail thumbnails, the grid
// sorter, the presenter and speaker views, version previews and the PDF/PNG export host. The content is laid out
// at 1 CSS px = 1 pt in a `w`×`h` box and shown at `scale` through a CSS transform, so text and geometry scale
// together; the box is dir="ltr" (slides never mirror; each paragraph has its own dir).
//
// It reads no context and calls no i18n hook: every string arrives through `labels`, so the export host can mount
// it in a bare React root. Behind the slide's own elements sit its decor: the code-drawn theme decor
// (masterId "theme") or an imported master's elements. The theme's colours and fonts are also set as custom
// properties on the content box, which is how `theme:*` references in text (and in the pre-mounted editor) resolve.
import { memo, useMemo, type CSSProperties, type ReactNode } from "react";

import { ElementView, type ElementRenderContext } from "@/components/slides/canvas/element-view";
import { decorIdPrefix, useSvgIdPrefix } from "@/components/slides/canvas/svg-ids";
import { colorCssOf, cssLinearGradient, cssUrl, hexOf, slideBackground } from "@/lib/slides/export/render-rules";
import { SLIDES_ID_RE } from "@/lib/slides/constants";
import type { DeckState } from "@/lib/slides/model/deck-store";
import { safeImageSrc } from "@/lib/slides/model/safe-values";
import type { Fill, MasterSnapshot, PlaceholderRole, SlideElement, SlideSnapshot, ThemeSpec } from "@/lib/slides/model/types";
import { themeCssVars, themeDecorElements } from "@/lib/slides/themes/themes";

export interface SlideViewLabels {
  placeholders: Record<Exclude<PlaceholderRole, "">, string>;
  chart: string;
  imageMissing: string;
}

export type SlideViewMode = "edit" | "thumb" | "present" | "export";

export interface SlideViewProps {
  deck: Pick<DeckState, "meta" | "masters">;
  slide: SlideSnapshot;
  scale: number;
  mode: SlideViewMode;
  /** The single selected text-capable element, or `${tableId}/${cellKey}`: renderEditor draws it (§6.2). */
  editorTargetId?: string | null;
  /** Rendered in place of the element's text for editorTargetId. */
  renderEditor?: (el: SlideElement, cellKey?: string) => ReactNode;
  labels?: SlideViewLabels;
  /** Present mode only; absent = links render as plain styled text. */
  onLinkClick?: (href: string) => void;
  /** Picture srcs known not to load (the export host's decode check): drawn as the missing-picture box at once. */
  unavailableImages?: ReadonlySet<string>;
}

/** The master a slide's decor and background come from, if it names a stored one. */
function masterOf(deck: SlideViewProps["deck"], slide: SlideSnapshot): MasterSnapshot | null {
  return slide.masterId !== "" && slide.masterId !== "theme" ? (deck.masters.get(slide.masterId) ?? null) : null;
}

function backgroundStyle(fill: Fill, theme: ThemeSpec): CSSProperties {
  switch (fill.t) {
    case "solid":
      return { backgroundColor: colorCssOf(fill.color, theme, fill.alpha) };
    case "linear":
      return { backgroundImage: cssLinearGradient(fill, theme) };
    case "image": {
      const src = safeImageSrc(fill.src);
      if (src === "") return {};
      return {
        backgroundImage: cssUrl(src),
        backgroundSize: fill.mode === "cover" ? "cover" : "100% 100%",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      };
    }
    case "none":
      return {};
  }
}

function SlideViewImpl({ deck, slide, scale, mode, editorTargetId, renderEditor, labels, onLinkClick, unavailableImages }: SlideViewProps) {
  const prefix = useSvgIdPrefix();
  const { meta } = deck;
  const { theme } = meta;
  const { w, h } = meta.size;
  const master = masterOf(deck, slide);
  const decor = useMemo<readonly SlideElement[]>(() => {
    if (slide.masterId === "theme") return themeDecorElements(theme, meta.size, slide.layout);
    return master?.elements ?? [];
  }, [slide.masterId, slide.layout, theme, meta.size, master]);
  const background = slideBackground(slide, master, theme);
  const clip = mode !== "edit";
  const base = { theme, mode, labels, onLinkClick, unavailableImages };
  const slideCtx: ElementRenderContext = { ...base, idPrefix: prefix, decor: false, editorTargetId, renderEditor };
  const decorCtx: ElementRenderContext = { ...base, idPrefix: decorIdPrefix(prefix), decor: true };
  const content: CSSProperties = {
    ...(themeCssVars(theme) as CSSProperties),
    position: "absolute",
    left: 0,
    top: 0,
    width: w,
    height: h,
    overflow: clip ? "hidden" : "visible",
    transform: scale !== 1 ? `scale(${scale})` : undefined,
    transformOrigin: "0 0",
    color: hexOf("theme:text", theme),
    fontFamily: theme.fonts.body,
    ...backgroundStyle(background, theme),
  };
  return (
    <div
      data-slide-view={slide.id}
      data-mode={mode}
      style={{ position: "relative", width: w * scale, height: h * scale, overflow: clip ? "hidden" : "visible" }}
    >
      <div dir="ltr" style={content}>
        {decor.map((el) => (SLIDES_ID_RE.test(el.id) ? <ElementView key={`decor:${el.id}`} el={el} ctx={decorCtx} /> : null))}
        {slide.elements.map((el) => (SLIDES_ID_RE.test(el.id) ? <ElementView key={el.id} el={el} ctx={slideCtx} /> : null))}
      </div>
    </div>
  );
}

/**
 * Re-render only when something this slide shows changed: the store replaces a slide object, the meta object and a
 * master object only when they changed (deck-store.ts), so a publish that touched another slide skips this one.
 */
export function sameSlideViewProps(a: SlideViewProps, b: SlideViewProps): boolean {
  return (
    a.slide === b.slide &&
    a.deck.meta === b.deck.meta &&
    masterOf(a.deck, a.slide) === masterOf(b.deck, b.slide) &&
    a.scale === b.scale &&
    a.mode === b.mode &&
    (a.editorTargetId ?? null) === (b.editorTargetId ?? null) &&
    a.renderEditor === b.renderEditor &&
    a.labels === b.labels &&
    a.onLinkClick === b.onLinkClick &&
    a.unavailableImages === b.unavailableImages
  );
}

export const SlideView = memo(SlideViewImpl, sameSlideViewProps);
SlideView.displayName = "SlideView";
