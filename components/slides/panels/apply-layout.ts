// Theme panel ▸ Layouts (slides.md §7.3, §8): give the current slide another layout. Its placeholders move to the
// new layout's slots, role by role in stacking order (a title stays the title, the first body fills the first body
// slot); a slot with no placeholder of its role gets a new, empty one; a placeholder the new layout has no slot for
// stays where it is when it holds text, and is removed when it is empty. The layout's size, alignment and line
// spacing apply; the placeholder's own font, colour and weight are kept. Locked elements are left alone.
//
// planLayoutChange is pure; applyLayoutChange writes the plan in one transaction, so the change is one undo step.
import type * as Y from "yjs";

import { isTextCapable } from "@/lib/slides/editor/elements";
import { addElements, deleteElements, updateElements } from "@/lib/slides/model/ops-elements";
import { setSlidesProps, transactSlides } from "@/lib/slides/model/ops-slides";
import type { ElementPatchEntry, NewElement, Pt, ShapeElement, SlideSnapshot, TextElement } from "@/lib/slides/model/types";
import { layoutPlaceholders, type StarterLayout } from "@/lib/slides/themes/layouts";
import { isEmptyText } from "@/lib/slides/text/plain";

export interface LayoutChangePlan {
  patches: ElementPatchEntry[];
  removals: string[];
  additions: NewElement[];
}

type Placeholder = TextElement | ShapeElement;

/** What changing `slide` to `layout` does, for a deck of `size`. */
export function planLayoutChange(slide: SlideSnapshot, layout: StarterLayout, size: { w: Pt; h: Pt }): LayoutChangePlan {
  const free: Placeholder[] = slide.elements.filter((el): el is Placeholder => isTextCapable(el) && el.placeholder !== "" && !el.locked);
  const patches: ElementPatchEntry[] = [];
  const additions: NewElement[] = [];
  for (const slot of layoutPlaceholders(layout, size)) {
    if (slot.type !== "text") continue;
    const at = free.findIndex((el) => el.placeholder === slot.placeholder);
    if (at < 0) {
      additions.push(slot);
      continue;
    }
    const [el] = free.splice(at, 1);
    patches.push({
      id: el.id,
      patch: {
        x: slot.x,
        y: slot.y,
        w: slot.w,
        h: slot.h,
        rot: 0,
        box: { ...el.box, vAlign: slot.box.vAlign },
        textStyle: { ...el.textStyle, size: slot.textStyle.size, align: slot.textStyle.align, lineHeight: slot.textStyle.lineHeight },
      },
    });
  }
  const removals = free.filter((el) => isEmptyText(el.text)).map((el) => el.id);
  return { patches, removals, additions };
}

/**
 * Writes the layout change of `slide` (one transaction). The new placeholders go first: adding is the step that can
 * refuse (tooManyElements), and it then refuses before anything else is written.
 */
export function applyLayoutChange(doc: Y.Doc, slide: SlideSnapshot, layout: StarterLayout, size: { w: Pt; h: Pt }): void {
  const plan = planLayoutChange(slide, layout, size);
  transactSlides(doc, () => {
    addElements(doc, slide.id, plan.additions);
    updateElements(doc, slide.id, plan.patches);
    deleteElements(doc, slide.id, plan.removals);
    setSlidesProps(doc, [slide.id], { layout });
  });
}
