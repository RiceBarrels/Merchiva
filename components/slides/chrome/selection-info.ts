// What the chrome (toolbar, menus) acts on (slides.md §7.3): the current slide, the selected elements grouped by
// what the format controls can do with them, and whether anything may be written right now. Pure; the menus and
// the toolbar read it through useSlidesSelection() so they agree on what is enabled.
import type { DeckState } from "@/lib/slides/model/deck-store";
import type {
  ImageElement, LineElement, ShapeElement, SlideElement, SlideSnapshot, TableElement, TextElement,
} from "@/lib/slides/model/types";
import type { SlidesUiState } from "@/lib/slides/editor/ui-state";

export type TextCapable = TextElement | ShapeElement;
/** Elements with an optional outline (the border controls). */
export type Outlined = TextElement | ShapeElement | ImageElement;

export interface SlidesSelectionInfo {
  /** The slide the editor shows (the current one, else the first); null for an empty deck. */
  slide: SlideSnapshot | null;
  /** The selected elements that are on that slide, in stacking order. */
  selected: readonly SlideElement[];
  /** Selected text boxes and shapes. */
  texts: readonly TextCapable[];
  /** The selected table when it is the only selected element. */
  table: TableElement | null;
  lines: readonly LineElement[];
  images: readonly ImageElement[];
  /** Selected text boxes, shapes and pictures (fill applies to the first two, borders to all three). */
  outlined: readonly Outlined[];
  /** Every selected element is locked (and at least one is selected). */
  allLocked: boolean;
  /** A text box, shape or table cell is being typed in. */
  editing: boolean;
  /** The deck may be changed now: the viewer can edit, the deck is not from a newer version, no version preview. */
  writable: boolean;
  /** The text commands have a target: something is being typed in, or a text box, shape or table is selected. */
  hasText: boolean;
}

export interface SelectionInputs {
  deck: Pick<DeckState, "slideIds" | "slides" | "schemaTooNew">;
  ui: Pick<SlidesUiState, "currentSlideId" | "selection" | "editing" | "previewVersionId">;
  canEditNow: boolean;
}

export function currentSlide(deck: SelectionInputs["deck"], currentSlideId: string | null): SlideSnapshot | null {
  const id = currentSlideId && deck.slides.has(currentSlideId) ? currentSlideId : deck.slideIds[0];
  return (id ? deck.slides.get(id) : undefined) ?? null;
}

export function selectionInfo({ deck, ui, canEditNow }: SelectionInputs): SlidesSelectionInfo {
  const slide = currentSlide(deck, ui.currentSlideId);
  const ids = new Set(ui.selection);
  const selected = slide ? slide.elements.filter((el) => ids.has(el.id)) : [];
  const texts: TextCapable[] = [];
  const lines: LineElement[] = [];
  const images: ImageElement[] = [];
  const outlined: Outlined[] = [];
  for (const el of selected) {
    if (el.type === "text" || el.type === "shape") {
      texts.push(el);
      outlined.push(el);
    } else if (el.type === "image") {
      images.push(el);
      outlined.push(el);
    } else if (el.type === "line") lines.push(el);
  }
  const table = selected.length === 1 && selected[0].type === "table" ? selected[0] : null;
  const editing = ui.editing !== null;
  return {
    slide,
    selected,
    texts,
    table,
    lines,
    images,
    outlined,
    allLocked: selected.length > 0 && selected.every((el) => el.locked),
    editing,
    writable: canEditNow && !deck.schemaTooNew && ui.previewVersionId === null,
    hasText: editing || texts.length > 0 || table !== null,
  };
}
