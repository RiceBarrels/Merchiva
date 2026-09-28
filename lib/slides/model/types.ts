// Plain model types: the currency of read/build, import/export, clipboard and version restore (slides.md §2.3).
// Coordinates and sizes are pt; a stage CSS px equals one pt (§5.1).
import type { JSONContent } from "@tiptap/core";

export type Pt = number;
export type ThemeColorSlot =
  | "bg" | "text" | "muted" | "surface"
  | "accent1" | "accent2" | "accent3" | "accent4" | "accent5" | "accent6"
  | "link";
/** Stored form: a lowercase `#rrggbb`, or a reference to the deck theme. */
export type ColorValue = `#${string}` | `theme:${ThemeColorSlot}`;
/** `theme:heading` / `theme:body`, or a validated CSS font stack. */
export type FontRef = "theme:heading" | "theme:body" | string;
export type LayoutKind = "title" | "titleBody" | "section" | "twoColumn" | "titleOnly" | "blank" | "imported";
export type PlaceholderRole = "" | "title" | "subtitle" | "body";
export type VAlign = "top" | "middle" | "bottom";
export type LineEnd = "none" | "arrow" | "triangle" | "stealth" | "oval" | "diamond";
export type DashStyle = "solid" | "dash" | "dot" | "dashDot";
export type ShapePreset =
  | "rect" | "roundRect" | "ellipse" | "triangle" | "rtTriangle" | "diamond" | "parallelogram" | "trapezoid"
  | "pentagon" | "hexagon" | "octagon" | "star4" | "star5" | "rightArrow" | "leftArrow" | "upArrow" | "downArrow"
  | "leftRightArrow" | "chevron" | "homePlate" | "plus" | "heart" | "donut" | "wedgeRectCallout" | "wedgeRoundRectCallout";

export type Fill =
  | { t: "none" }
  | { t: "solid"; color: ColorValue; alpha?: number } // alpha 0..1
  | { t: "linear"; angle: number; stops: ReadonlyArray<{ pos: number; color: ColorValue; alpha?: number }> }
  | { t: "image"; src: string; mode: "cover" | "stretch" };
export interface Stroke { color: ColorValue; width: Pt; dash: DashStyle; alpha?: number; head?: LineEnd; tail?: LineEnd }
export interface Shadow { x: Pt; y: Pt; blur: Pt; color: ColorValue; alpha: number }
/** `inset` is [left, top, right, bottom]. */
export interface TextBox {
  vAlign: VAlign;
  inset: readonly [Pt, Pt, Pt, Pt];
  autofit: "none" | "grow";
  fontScale: number;
  wrap: boolean;
  vertical: boolean;
}
export interface TextDefaults {
  font: FontRef;
  size: Pt;
  color: ColorValue;
  bold: boolean;
  align: "left" | "center" | "right" | "justify";
  lineHeight: number;
}
export type ShapeGeom =
  | { kind: "preset"; preset: ShapePreset }
  | { kind: "path"; d: string; vw: number; vh: number; srcPreset: string }; // imported; srcPreset = pptx shapType
export interface SlideTransition { type: "none" | "fade"; durationMs: number; srcType?: string }
export type StarterThemeId = "simple-light" | "simple-dark" | "paper" | "coastal" | "market" | "mono";
export interface ThemeSpec {
  id: StarterThemeId | "imported";
  colors: Readonly<Record<ThemeColorSlot, `#${string}`>>;
  fonts: { heading: string; body: string }; // CSS stacks
  background: Fill;
  decor: "none" | "accentBar" | "topBand" | "cornerBlock";
}
export interface DeckSource { kind: "pptx"; fileName: string; importedAt: number; driveItemId?: string }
export interface DeckMeta { schemaVersion: number; size: { w: Pt; h: Pt }; theme: ThemeSpec; source: DeckSource | null }

interface ElementBase { id: string; z: string; locked: boolean; name: string; link: string; placeholder: PlaceholderRole }
interface BoxBase extends ElementBase { x: Pt; y: Pt; w: Pt; h: Pt; rot: number }
export interface TextElement extends BoxBase {
  type: "text";
  geom: ShapeGeom;
  fill: Fill;
  stroke: Stroke | null;
  shadow: Shadow | null;
  box: TextBox;
  textStyle: TextDefaults;
  flipH: boolean;
  flipV: boolean;
  text: JSONContent;
}
export interface ShapeElement extends Omit<TextElement, "type"> { type: "shape" }
export interface LineElement extends ElementBase { type: "line"; x1: Pt; y1: Pt; x2: Pt; y2: Pt; stroke: Stroke }
export interface ImageElement extends BoxBase {
  type: "image";
  src: string;
  crop: { l: number; t: number; r: number; b: number };
  mask: "" | "ellipse" | "roundRect";
  alt: string;
  stroke: Stroke | null;
  flipH: boolean;
  flipV: boolean;
}
export interface TableCellSnapshot {
  rowId: string;
  colId: string;
  text: JSONContent;
  fill: ColorValue | null;
  rowSpan: number;
  colSpan: number;
  covered: boolean;
  vAlign: VAlign;
}
export interface TableStyle { border: { color: ColorValue; width: Pt }; headerRow: boolean; banded: boolean; textStyle: TextDefaults }
export interface TableElement extends BoxBase {
  type: "table";
  rows: ReadonlyArray<{ id: string; order: string; h: Pt }>;
  cols: ReadonlyArray<{ id: string; order: string; w: Pt }>;
  cells: ReadonlyArray<TableCellSnapshot>;
  style: TableStyle;
}
export interface ChartData {
  kind: string;
  title: string;
  categories: string[];
  series: ReadonlyArray<{ name: string; values: number[] }>;
  colors: string[];
}
export interface ChartElement extends BoxBase { type: "chart"; chart: ChartData }
export type SlideElement = TextElement | ShapeElement | LineElement | ImageElement | TableElement | ChartElement;
export type SlideElementType = SlideElement["type"];

/** `elements` sorted by (z, id). */
export interface SlideSnapshot {
  id: string;
  order: string;
  layout: LayoutKind;
  masterId: string;
  hidden: boolean;
  background: Fill | null;
  transition: SlideTransition | null;
  notes: JSONContent;
  elements: readonly SlideElement[];
}
export interface MasterSnapshot { id: string; name: string; background: Fill | null; elements: readonly SlideElement[] }
/** `slides` sorted by (order, id); `masters` by id. */
export interface DeckSnapshot { meta: DeckMeta; masters: readonly MasterSnapshot[]; slides: readonly SlideSnapshot[] }

/** `Omit` that keeps a union a union (the plain `Omit` of a union only keeps the members' common keys). */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/**
 * An element before `addElements` gives it an id and a z key (layout placeholders, inserts, paste). Declared here so
 * the layouts and geometry helpers can use it; `lib/slides/model/ops-elements.ts` re-exports it.
 */
export type NewElement = DistributiveOmit<SlideElement, "id" | "z"> & { id?: string };
/** Keys an edit may set on an element (never `id`, `type` or the text fragment). */
export type ElementPatch =
  | Partial<Omit<TextElement, "id" | "type" | "text">>
  | Partial<Omit<LineElement, "id" | "type">>
  | Partial<Omit<ImageElement, "id" | "type">>;
export interface ElementPatchEntry { id: string; patch: ElementPatch }
