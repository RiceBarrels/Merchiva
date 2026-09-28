// The six slide layouts (slides.md §8): placeholder text boxes designed on a 960×540 pt slide and scaled to the
// deck size (geometry by w/960 and h/540, font sizes by the smaller ratio). Placeholders carry no prompt text:
// an empty one shows "Click to add title" in the editor only (slides.placeholder.*).
import type { JSONContent } from "@tiptap/core";

import { DEFAULT_TEXT_BOX, DEFAULT_TEXT_DEFAULTS } from "@/lib/slides/model/defaults";
import type { LayoutKind, NewElement, PlaceholderRole, Pt, TextDefaults, VAlign } from "@/lib/slides/model/types";
import { blankTextJson } from "@/lib/slides/text/plain";

export type StarterLayout = Exclude<LayoutKind, "imported">;
type Role = Exclude<PlaceholderRole, "">;

export const LAYOUTS: readonly StarterLayout[] = ["title", "titleBody", "section", "twoColumn", "titleOnly", "blank"];

export const LAYOUT_LABEL_KEYS: Readonly<Record<StarterLayout, string>> = {
  title: "slides.layouts.title",
  titleBody: "slides.layouts.titleBody",
  section: "slides.layouts.section",
  twoColumn: "slides.layouts.twoColumn",
  titleOnly: "slides.layouts.titleOnly",
  blank: "slides.layouts.blank",
};

/** Layout a new slide gets when none is chosen. */
export const DEFAULT_NEW_SLIDE_LAYOUT: StarterLayout = "titleBody";

export function isLayoutKind(value: unknown): value is LayoutKind {
  return value === "imported" || (typeof value === "string" && (LAYOUTS as readonly string[]).includes(value));
}

type Slot = { role: Role; box: readonly [Pt, Pt, Pt, Pt]; vAlign: VAlign };

const TITLE_BAR: Slot = { role: "title", box: [60, 36, 840, 72], vAlign: "middle" };
const SLOTS: Readonly<Record<StarterLayout, readonly Slot[]>> = {
  title: [
    { role: "title", box: [80, 180, 800, 100], vAlign: "bottom" },
    { role: "subtitle", box: [80, 290, 800, 60], vAlign: "top" },
  ],
  titleBody: [TITLE_BAR, { role: "body", box: [60, 124, 840, 370], vAlign: "top" }],
  section: [
    { role: "title", box: [80, 210, 800, 90], vAlign: "bottom" },
    { role: "subtitle", box: [80, 300, 800, 50], vAlign: "top" },
  ],
  twoColumn: [
    TITLE_BAR,
    { role: "body", box: [60, 124, 410, 370], vAlign: "top" },
    { role: "body", box: [490, 124, 410, 370], vAlign: "top" },
  ],
  titleOnly: [TITLE_BAR],
  blank: [],
};

/** Text defaults of a placeholder role in a layout, at 960×540. */
export function placeholderTextDefaults(role: Role, layout: LayoutKind): TextDefaults {
  const centered = layout === "title";
  switch (role) {
    case "title":
      return {
        ...DEFAULT_TEXT_DEFAULTS,
        font: "theme:heading",
        size: layout === "title" ? 44 : layout === "section" ? 40 : 32,
        align: centered ? "center" : "left",
        lineHeight: 1.1,
      };
    case "subtitle":
      return { ...DEFAULT_TEXT_DEFAULTS, size: layout === "section" ? 20 : 22, color: "theme:muted", align: centered ? "center" : "left" };
    case "body":
      return { ...DEFAULT_TEXT_DEFAULTS, size: 20 };
  }
}

/** Empty body text: one empty bullet, so typing starts a bulleted list. */
function bodyText(): JSONContent {
  return { type: "doc", content: [{ type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph" }] }] }] };
}

/** The placeholders of `layout` for a slide of `size`, in paint order (ids and z keys are assigned on insert). */
export function layoutPlaceholders(layout: LayoutKind, size: { w: Pt; h: Pt }): NewElement[] {
  if (layout === "imported") return [];
  const sx = size.w / 960;
  const sy = size.h / 540;
  const fontScale = Math.min(sx, sy);
  const round = (n: number) => Math.round(n * 100) / 100;
  return SLOTS[layout].map((slot): NewElement => {
    const [x, y, w, h] = slot.box;
    const defaults = placeholderTextDefaults(slot.role, layout);
    return {
      type: "text",
      locked: false,
      name: "",
      link: "",
      placeholder: slot.role,
      x: round(x * sx),
      y: round(y * sy),
      w: round(w * sx),
      h: round(h * sy),
      rot: 0,
      geom: { kind: "preset", preset: "rect" },
      fill: { t: "none" },
      stroke: null,
      shadow: null,
      box: { ...DEFAULT_TEXT_BOX, vAlign: slot.vAlign },
      textStyle: { ...defaults, size: round(defaults.size * fontScale) },
      flipH: false,
      flipV: false,
      text: slot.role === "body" ? bodyText() : blankTextJson(),
    };
  });
}
