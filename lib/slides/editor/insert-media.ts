// Pictures and pastes for the editor's insert commands (slides.md §4.8, §12.2): the natural size of a picture (so a
// new one keeps its proportions), a text box for plain text pasted from outside the deck, and where pasted elements
// land.
import type { JSONContent } from "@tiptap/core";

import { newTextBox, type SlideSize } from "@/lib/slides/editor/elements";
import { SLIDES_MAX_TEXT_CHARS } from "@/lib/slides/constants";
import { elementBounds, unionBounds } from "@/lib/slides/geometry/arrange";
import { DUPLICATE_OFFSET } from "@/lib/slides/model/ops-elements";
import type { NewElement, SlideElement } from "@/lib/slides/model/types";

/** Longest wait for a picture to load before it is treated as unusable. */
const IMAGE_LOAD_MS = 10_000;

/** The natural size of the picture at `src` (CSS px), or null when it does not load as a picture. */
export function measureImage(src: string, timeoutMs = IMAGE_LOAD_MS): Promise<SlideSize | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(null);
      return;
    }
    const img = new window.Image();
    const done = (size: SlideSize | null) => {
      window.clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      resolve(size);
    };
    const timer = window.setTimeout(() => done(null), timeoutMs);
    img.onload = () => done(img.naturalWidth > 0 && img.naturalHeight > 0 ? { w: img.naturalWidth, h: img.naturalHeight } : null);
    img.onerror = () => done(null);
    img.referrerPolicy = "no-referrer";
    img.src = src;
  });
}

/** The natural size of a picture file (read locally, before it is uploaded), or null. */
export async function measureImageFile(file: File): Promise<SlideSize | null> {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return null;
  const url = URL.createObjectURL(file);
  try {
    return await measureImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Plain text as slide text: one paragraph per line (capped at the text limit). */
export function plainTextJson(text: string): JSONContent {
  const lines = text.replace(/\r\n?/g, "\n").slice(0, SLIDES_MAX_TEXT_CHARS).split("\n");
  return {
    type: "doc",
    content: lines.map((line) => (line === "" ? { type: "paragraph" } : { type: "paragraph", content: [{ type: "text", text: line }] })),
  };
}

/** A text box holding pasted plain text, centred, tall enough for its lines (at most the slide's height). */
export function plainTextElement(text: string, slide: SlideSize): NewElement {
  const base = newTextBox(slide);
  if (base.type !== "text") return base;
  const json = plainTextJson(text);
  const lines = json.content?.length ?? 1;
  const lineH = base.textStyle.size * base.textStyle.lineHeight;
  const h = Math.min(slide.h, Math.max(base.h, Math.round(lines * lineH + base.box.inset[1] + base.box.inset[3])));
  const w = Math.min(slide.w, base.w * 1.5);
  return { ...base, text: json, w, h, x: Math.round((slide.w - w) / 2), y: Math.round((slide.h - h) / 2) };
}

/**
 * Where pasted elements go: where they were, unless the slide already has an element of the same type at the same
 * place (a paste next to its own original), then one duplicate offset down and right.
 */
export function pasteOffset(onSlide: readonly SlideElement[], pasted: readonly SlideElement[]): { x: number; y: number } | null {
  const bounds = unionBounds(pasted);
  if (!bounds) return null;
  const key = (el: SlideElement) => {
    const b = elementBounds(el);
    return `${el.type}:${Math.round(b.x)}:${Math.round(b.y)}`;
  };
  const taken = new Set(onSlide.map(key));
  return pasted.some((el) => taken.has(key(el))) ? { x: bounds.x + DUPLICATE_OFFSET, y: bounds.y + DUPLICATE_OFFSET } : null;
}
