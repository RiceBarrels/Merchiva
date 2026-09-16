/**
 * Pagination: the editor is one continuous ProseMirror document, and this plugin is
 * what makes it *look* like a stack of sheets.
 *
 * Each pass measures the top-level blocks, subtracts the spacers it inserted last time so the numbers are in
 * gap-free "flow" coordinates, asks `paginate` where the page boundaries fall, and re-renders the spacers as
 * widget decorations. Because the input is gap-free the computation is a fixed point: a second pass over an
 * unchanged document produces the same layout and dispatches nothing.
 *
 * A paragraph that straddles a boundary is cut between two of its line boxes (`findLineSplit`), so long text
 * continues on the next page the way Word does; anything else (an image, a table, a list item) moves down whole,
 * and a block taller than the text column makes its own page grow instead of spilling onto the next sheet.
 *
 * Zoom: the canvas scales the sheet with CSS `zoom`, whose effect on `offsetTop` differs between engines. Both
 * scales are therefore derived from the one length we know exactly — the editor element is the text column, exactly
 * `pageWidth - marginLeft - marginRight` CSS px wide — so the measurements land in layout pixels either way.
 */
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

import { paginate, type PageBlockInput, type PageGap, type PaginationLayout } from "@/lib/docs/pagination/measure";

export interface PaginationMetrics {
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly marginTop: number;
  readonly marginRight: number;
  readonly marginBottom: number;
  readonly marginLeft: number;
  /** Visible space between two sheets. */
  readonly gap: number;
}

export interface PaginationController {
  /** Null turns pagination off (mobile, print portal, version preview). */
  metrics: PaginationMetrics | null;
  /** Called after every layout change, with the page rectangles the background layer draws. */
  onLayout: ((layout: PaginationLayout | null) => void) | null;
  /** Assigned by the plugin: re-measures on the next frame. */
  refresh(): void;
}

export function createPaginationController(): PaginationController {
  return { metrics: null, onLayout: null, refresh: () => {} };
}

export const paginationKey = new PluginKey<PaginationPluginState>("merchivaPagination");

interface PaginationPluginState {
  readonly layout: PaginationLayout | null;
  readonly decorations: DecorationSet;
}

/** Marks a spacer so the next measurement can subtract it again. */
export const PAGE_GAP_ATTR = "data-doc-page-gap";

const EMPTY: PaginationPluginState = { layout: null, decorations: DecorationSet.empty };

interface LayoutMeta {
  readonly layout: PaginationLayout | null;
}

function gapKey(gap: PageGap): string {
  return `${gap.pos}:${Math.round(gap.height)}:${gap.inline ? "i" : "b"}`;
}

function sameLayout(a: PaginationLayout | null, b: PaginationLayout | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.gaps.length !== b.gaps.length || a.pages.length !== b.pages.length) return false;
  if (Math.abs(a.totalHeight - b.totalHeight) > 0.5) return false;
  for (let i = 0; i < a.gaps.length; i++) if (gapKey(a.gaps[i]) !== gapKey(b.gaps[i])) return false;
  for (let i = 0; i < a.pages.length; i++) {
    if (Math.abs(a.pages[i].top - b.pages[i].top) > 0.5 || Math.abs(a.pages[i].height - b.pages[i].height) > 0.5) return false;
  }
  return true;
}

function buildDecorations(doc: ProseMirrorNode, layout: PaginationLayout | null): DecorationSet {
  if (!layout || layout.gaps.length === 0) return DecorationSet.empty;
  const size = doc.content.size;
  const decorations: Decoration[] = [];
  for (const gap of layout.gaps) {
    if (gap.pos < 0 || gap.pos > size) continue;
    const height = Math.max(0, Math.round(gap.height));
    decorations.push(
      Decoration.widget(
        gap.pos,
        () => {
          const el = document.createElement("div");
          el.setAttribute(PAGE_GAP_ATTR, "");
          el.className = "doc-page-gap";
          el.style.height = `${height}px`;
          el.contentEditable = "false";
          el.setAttribute("aria-hidden", "true");
          return el;
        },
        { side: -1, key: gapKey(gap), ignoreSelection: true, marks: [] },
      ),
    );
  }
  return DecorationSet.create(doc, decorations);
}

/** Distance from `el`'s border box to `root`'s padding box, following the offset chain (cells are positioned). */
function offsetTopIn(el: HTMLElement, root: HTMLElement): number {
  let top = 0;
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    top += node.offsetTop;
    const parent: Element | null = node.offsetParent;
    node = parent instanceof HTMLElement ? parent : null;
  }
  return top;
}

function sumGapHeights(scope: ParentNode): number {
  let total = 0;
  for (const el of Array.from(scope.querySelectorAll<HTMLElement>(`[${PAGE_GAP_ATTR}]`))) total += el.offsetHeight;
  return total;
}

/** Text blocks are the only ones cut between lines; everything else moves whole. */
function isSplittable(node: ProseMirrorNode): boolean {
  return node.type.name === "paragraph" || node.type.name === "heading";
}

interface Measured {
  readonly blocks: PageBlockInput[];
  readonly doms: (HTMLElement | null)[];
  /** Layout px per offset px (1 unless the engine scales `offsetTop` with CSS zoom). */
  readonly offsetScale: number;
  /** Client px per layout px. */
  readonly clientScale: number;
  readonly rootRect: DOMRect;
  /** Flow offset of a paged offset: the paged value minus every gap above it. */
  readonly toFlow: (pagedTop: number) => number;
}

function measure(view: EditorView, metrics: PaginationMetrics): Measured | null {
  const root = view.dom as HTMLElement;
  if (!root.isConnected) return null;
  const rootRect = root.getBoundingClientRect();
  if (rootRect.width <= 0) return null;

  // The editor element is the text column; the page margins live on its wrapper.
  const contentWidth = Math.max(1, metrics.pageWidth - metrics.marginLeft - metrics.marginRight);
  const offsetScale = root.offsetWidth > 0 ? root.offsetWidth / contentWidth : 1;
  const clientScale = rootRect.width / contentWidth;
  if (!Number.isFinite(offsetScale) || offsetScale <= 0 || !Number.isFinite(clientScale) || clientScale <= 0) return null;

  const gaps = Array.from(root.querySelectorAll<HTMLElement>(`[${PAGE_GAP_ATTR}]`))
    .map((el) => ({ top: offsetTopIn(el, root) / offsetScale, height: el.offsetHeight / offsetScale }))
    .sort((a, b) => a.top - b.top);

  const toFlow = (pagedTop: number): number => {
    let carried = 0;
    for (const gap of gaps) {
      if (gap.top >= pagedTop) break;
      carried += gap.height;
    }
    return pagedTop - carried;
  };

  const blocks: PageBlockInput[] = [];
  const doms: (HTMLElement | null)[] = [];
  let offset = 0;
  view.state.doc.forEach((node) => {
    const pos = offset;
    offset += node.nodeSize;
    const dom = view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) return;
    const pagedTop = offsetTopIn(dom, root) / offsetScale;
    const inner = sumGapHeights(dom) / offsetScale;
    blocks.push({
      pos,
      endPos: pos + node.nodeSize,
      top: toFlow(pagedTop),
      height: Math.max(0, dom.offsetHeight / offsetScale - inner),
      isPageBreak: node.type.name === "pageBreak",
      splittable: isSplittable(node),
    });
    doms.push(dom);
  });

  return { blocks, doms, offsetScale, clientScale, rootRect, toFlow };
}

/** Line boxes of `el`, as client rects, with any page spacer inside it removed. */
function lineRects(el: HTMLElement): DOMRect[] {
  const range = document.createRange();
  range.selectNodeContents(el);
  const spacers = Array.from(el.querySelectorAll<HTMLElement>(`[${PAGE_GAP_ATTR}]`)).map((gap) => gap.getBoundingClientRect());
  const rects = Array.from(range.getClientRects()).filter((rect) => {
    if (rect.height <= 0 || rect.width <= 0) return false;
    return !spacers.some((spacer) => rect.top >= spacer.top - 0.5 && rect.bottom <= spacer.bottom + 0.5);
  });
  range.detach();
  if (rects.length === 0) return [];

  // One line box can produce several rects (inline elements); merge the ones that share a baseline.
  rects.sort((a, b) => a.top - b.top || a.left - b.left);
  const lines: DOMRect[] = [rects[0]];
  for (const rect of rects.slice(1)) {
    const current = lines[lines.length - 1];
    if (rect.top < current.bottom - Math.min(current.height, rect.height) / 2) {
      lines[lines.length - 1] = new DOMRect(
        Math.min(current.left, rect.left),
        Math.min(current.top, rect.top),
        Math.max(current.right, rect.right) - Math.min(current.left, rect.left),
        Math.max(current.bottom, rect.bottom) - Math.min(current.top, rect.top),
      );
    } else {
      lines.push(rect);
    }
  }
  return lines;
}

/**
 * The first line of `el` that reaches past `limit` (flow px), as the position of its first character. Returns null
 * when the block has one line, when the split would orphan the first line, or when the position can't be resolved.
 */
function findLineSplit(view: EditorView, m: Measured, index: number, limit: number): { pos: number; top: number } | null {
  const el = m.doms[index];
  const block = m.blocks[index];
  if (!el) return null;
  const lines = lineRects(el);
  if (lines.length < 2) return null;

  const toFlowFromClient = (clientTop: number) => m.toFlow((clientTop - m.rootRect.top) / m.clientScale);

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Keep this line only if it ends above the limit.
    if (toFlowFromClient(line.bottom) <= limit) continue;
    const top = toFlowFromClient(line.top);
    if (top <= block.top) return null;
    const found = view.posAtCoords({ left: line.left + 1, top: line.top + line.height / 2 });
    if (!found) return null;
    const pos = found.pos;
    if (pos <= block.pos + 1 || pos >= block.endPos - 1) return null;
    return { pos, top };
  }
  return null;
}

export interface PaginationOptions {
  controller: PaginationController;
}

export const Pagination = Extension.create<PaginationOptions>({
  name: "pagination",

  addOptions() {
    return { controller: createPaginationController() };
  },

  addProseMirrorPlugins() {
    const controller = this.options.controller;

    return [
      new Plugin<PaginationPluginState>({
        key: paginationKey,
        state: {
          init: () => EMPTY,
          apply(tr, value) {
            const meta = tr.getMeta(paginationKey) as LayoutMeta | undefined;
            if (meta) {
              return meta.layout
                ? { layout: meta.layout, decorations: buildDecorations(tr.doc, meta.layout) }
                : EMPTY;
            }
            if (!tr.docChanged) return value;
            // Positions stay valid until the next measurement lands.
            return { layout: value.layout, decorations: value.decorations.map(tr.mapping, tr.doc) };
          },
        },
        props: {
          decorations: (state) => paginationKey.getState(state)?.decorations ?? DecorationSet.empty,
        },
        view(view) {
          let frame = 0;
          let disposed = false;

          const run = () => {
            frame = 0;
            if (disposed || view.isDestroyed) return;
            const metrics = controller.metrics;
            const current = paginationKey.getState(view.state)?.layout ?? null;

            if (!metrics) {
              if (current) {
                view.dispatch(view.state.tr.setMeta(paginationKey, { layout: null } satisfies LayoutMeta).setMeta("addToHistory", false));
                controller.onLayout?.(null);
              }
              return;
            }

            let layout: PaginationLayout | null = null;
            try {
              const measured = measure(view, metrics);
              if (!measured) return;
              layout = paginate(measured.blocks, {
                pageHeight: metrics.pageHeight,
                marginTop: metrics.marginTop,
                marginBottom: metrics.marginBottom,
                gap: metrics.gap,
                splitAt: (index, limit) => {
                  try {
                    return findLineSplit(view, measured, index, limit);
                  } catch {
                    // A split that can't be resolved just moves the block whole.
                    return null;
                  }
                },
              });
            } catch {
              return;
            }

            if (sameLayout(current, layout)) return;
            view.dispatch(view.state.tr.setMeta(paginationKey, { layout } satisfies LayoutMeta).setMeta("addToHistory", false));
            controller.onLayout?.(layout);
          };

          const schedule = () => {
            if (disposed || frame) return;
            frame = requestAnimationFrame(run);
          };

          controller.refresh = schedule;

          // Images, web fonts and a resized canvas all change where the boundaries fall.
          const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
          resize?.observe(view.dom);
          if (typeof document !== "undefined" && document.fonts?.ready) void document.fonts.ready.then(schedule).catch(() => {});
          schedule();

          return {
            update: schedule,
            destroy() {
              disposed = true;
              if (frame) cancelAnimationFrame(frame);
              resize?.disconnect();
              if (controller.refresh === schedule) controller.refresh = () => {};
              controller.onLayout?.(null);
            },
          };
        },
      }),
    ];
  },
});
