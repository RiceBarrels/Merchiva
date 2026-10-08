// Element patches for the shape, line and picture format controls (slides.md §3, §7.3): fill, outline colour,
// weight and dash, line ends, vertical alignment, autofit and picture masks. Pure; each list goes to el.patch() as
// one undo step. A patch keeps the rest of the element's current value (a stroke's other fields, the text box's
// other settings), so two people changing different parts of it both keep their change. Locked elements are
// formatted too: locking only pins the position.
import { DEFAULT_STROKE } from "@/lib/slides/model/defaults";
import type {
  ColorValue, DashStyle, ElementPatchEntry, Fill, ImageElement, LineElement, LineEnd, ShapeElement, SlideElement, Stroke,
  TextBox, TextElement, VAlign,
} from "@/lib/slides/model/types";

/** Outline weights offered by the menus (pt). */
export const STROKE_WEIGHTS: readonly number[] = [0.5, 1, 2, 3, 4, 6, 8, 12];
export const DASH_STYLES: readonly DashStyle[] = ["solid", "dash", "dot", "dashDot"];
export const LINE_ENDS: readonly LineEnd[] = ["none", "arrow", "triangle", "stealth", "oval", "diamond"];
export const IMAGE_MASKS: readonly ImageElement["mask"][] = ["", "ellipse", "roundRect"];

type Stroked = TextElement | ShapeElement | ImageElement | LineElement;

function hasFill(el: SlideElement): el is TextElement | ShapeElement {
  return el.type === "text" || el.type === "shape";
}

function isStroked(el: SlideElement): el is Stroked {
  return el.type === "text" || el.type === "shape" || el.type === "image" || el.type === "line";
}

/** The fill colour the controls show: the first filled element's solid colour; null for none or a gradient. */
export function currentFill(els: readonly SlideElement[]): ColorValue | null {
  const el = els.find(hasFill);
  return el && el.fill.t === "solid" ? el.fill.color : null;
}

/** The first outlined element's stroke (null: no outline). */
export function currentStroke(els: readonly SlideElement[]): Stroke | null {
  const el = els.find(isStroked);
  return el ? el.stroke : null;
}

/** Solid fill `color` on text boxes and shapes; null removes the fill. A solid fill keeps its transparency. */
export function fillPatches(els: readonly SlideElement[], color: ColorValue | null): ElementPatchEntry[] {
  return els.filter(hasFill).map((el) => {
    const alpha = el.fill.t === "solid" ? el.fill.alpha : undefined;
    const fill: Fill = color === null ? { t: "none" } : alpha === undefined ? { t: "solid", color } : { t: "solid", color, alpha };
    return { id: el.id, patch: { fill } };
  });
}

/** `change` applied to each element's stroke (an element without one starts from the default outline). */
function strokePatches(els: readonly SlideElement[], change: Partial<Stroke>): ElementPatchEntry[] {
  return els.filter(isStroked).map((el) => ({ id: el.id, patch: { stroke: { ...(el.stroke ?? DEFAULT_STROKE), ...change } } }));
}

/** Outline or line colour; null removes the outline of boxes and pictures (a line always keeps its stroke). */
export function strokeColorPatches(els: readonly SlideElement[], color: ColorValue | null): ElementPatchEntry[] {
  if (color !== null) return strokePatches(els, { color });
  return els.filter((el) => isStroked(el) && el.type !== "line" && el.stroke !== null).map((el) => ({ id: el.id, patch: { stroke: null } }));
}

export function strokeWeightPatches(els: readonly SlideElement[], width: number): ElementPatchEntry[] {
  return strokePatches(els, { width });
}

export function strokeDashPatches(els: readonly SlideElement[], dash: DashStyle): ElementPatchEntry[] {
  return strokePatches(els, { dash });
}

/** Line start (`head`) or end (`tail`) marker, on lines only. */
export function lineEndPatches(els: readonly SlideElement[], end: "head" | "tail", value: LineEnd): ElementPatchEntry[] {
  return strokePatches(els.filter((el) => el.type === "line"), end === "head" ? { head: value } : { tail: value });
}

function boxPatches(els: readonly SlideElement[], change: Partial<TextBox>): ElementPatchEntry[] {
  return els.flatMap((el) => (el.type === "text" || el.type === "shape" ? [{ id: el.id, patch: { box: { ...el.box, ...change } } }] : []));
}

export function vAlignPatches(els: readonly SlideElement[], vAlign: VAlign): ElementPatchEntry[] {
  return boxPatches(els, { vAlign });
}

export function autofitPatches(els: readonly SlideElement[], autofit: TextBox["autofit"]): ElementPatchEntry[] {
  return boxPatches(els, { autofit });
}

export function maskPatches(els: readonly SlideElement[], mask: ImageElement["mask"]): ElementPatchEntry[] {
  return els.flatMap((el) => (el.type === "image" ? [{ id: el.id, patch: { mask } }] : []));
}
