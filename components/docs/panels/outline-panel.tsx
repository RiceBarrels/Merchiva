"use client";

/**
 * Document outline (docs-editor-ui spec §4.9, F9). Read-only: headings come from `editor.state.doc`, and nothing is
 * ever written to the document (no heading ids, unlike the TOC extension).
 *
 * Props:
 * - `editor` — the live editor, or the preview editor while a version is previewed. Null while loading.
 * - `variant`:
 *   - `"gutter"` — desktop, beside the page sheet: `sticky top-6 w-[208px]`, own header with a "Hide outline" button.
 *   - `"panel"` — inside `SidePanelFrame side="start"` when the canvas is narrow (the frame supplies the header).
 *   - `"sheet"` — the mobile Outline page (DynamicUIElement); rows are 44px tall.
 * - `scrollContainerRef` — the canvas scroller (DocCanvas / MobileCanvas). The active row is the last heading whose
 *   `coordsAtPos(pos).top` is above the scroller's top + 80 (rAF-throttled scroll listener). Clicking a row runs
 *   `editor.chain().setTextSelection(pos + 1).run()` and then scrolls the heading to 64px below the scroller's top.
 * - `onClose` — "Hide outline" (`gutter` only); omit to hide the button.
 * - `onNavigate` — after a row click (the mobile page closes itself here).
 *
 * Headings: paragraphs with `docStyle` title (level 0) or subtitle (level 1), and `heading` levels 1–3, skipping empty
 * text. The list refreshes 150 ms after document changes.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { ListTree, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

export type OutlineVariant = "gutter" | "panel" | "sheet";

export interface OutlineHeading {
  /** Document position of the block (stable key while the doc is unchanged). */
  readonly pos: number;
  /** 0 = title, 1 = subtitle or H1, 2 = H2, 3 = H3. */
  readonly level: 0 | 1 | 2 | 3;
  readonly kind: "title" | "subtitle" | "heading";
  readonly text: string;
}

export interface OutlinePanelProps {
  editor: Editor | null;
  variant: OutlineVariant;
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  onClose?: () => void;
  onNavigate?: (heading: OutlineHeading) => void;
}

const REFRESH_DELAY_MS = 150;
const ACTIVE_OFFSET_PX = 80;
const JUMP_OFFSET_PX = 64;
const MAX_TEXT = 200;

const INDENT: Readonly<Record<OutlineHeading["level"], string>> = {
  0: "ps-2",
  1: "ps-[18px]",
  2: "ps-[28px]",
  3: "ps-[38px]",
};

/** Top-level title/subtitle paragraphs and H1–H3 in document order. */
export function extractOutline(doc: ProseMirrorNode): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  doc.forEach((node, offset) => {
    let kind: OutlineHeading["kind"];
    let level: OutlineHeading["level"];
    if (node.type.name === "heading") {
      const value = Number(node.attrs.level);
      if (value !== 1 && value !== 2 && value !== 3) return;
      kind = "heading";
      level = value;
    } else if (node.type.name === "paragraph" && (node.attrs.docStyle === "title" || node.attrs.docStyle === "subtitle")) {
      kind = node.attrs.docStyle === "title" ? "title" : "subtitle";
      level = kind === "title" ? 0 : 1;
    } else {
      return;
    }
    const text = node.textContent.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
    if (text) headings.push({ pos: offset, level, kind, text });
  });
  return headings;
}

function sameHeadings(a: readonly OutlineHeading[], b: readonly OutlineHeading[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].pos !== b[i].pos || a[i].level !== b[i].level || a[i].text !== b[i].text || a[i].kind !== b[i].kind) return false;
  }
  return true;
}

// ── Heading store (one per editor, shared by every mounted outline) ──────────

interface OutlineStore {
  doc: ProseMirrorNode | null;
  headings: readonly OutlineHeading[];
  listeners: Set<() => void>;
  detach: (() => void) | null;
}

const EMPTY: readonly OutlineHeading[] = [];
const stores = new WeakMap<Editor, OutlineStore>();

function storeFor(editor: Editor): OutlineStore {
  let store = stores.get(editor);
  if (!store) {
    store = { doc: null, headings: EMPTY, listeners: new Set(), detach: null };
    stores.set(editor, store);
  }
  return store;
}

function refresh(store: OutlineStore, editor: Editor): boolean {
  if (editor.isDestroyed) return false;
  const doc = editor.state.doc;
  if (doc === store.doc) return false;
  store.doc = doc;
  const next = extractOutline(doc);
  if (sameHeadings(next, store.headings)) return false;
  store.headings = next;
  return true;
}

function subscribeOutline(editor: Editor, listener: () => void): () => void {
  const store = storeFor(editor);
  store.listeners.add(listener);
  if (!store.detach) {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const notify = () => {
      for (const l of [...store.listeners]) l();
    };
    const onUpdate = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (refresh(store, editor)) notify();
      }, REFRESH_DELAY_MS);
    };
    editor.on("update", onUpdate);
    store.detach = () => {
      editor.off("update", onUpdate);
      if (timer) clearTimeout(timer);
    };
    if (refresh(store, editor)) queueMicrotask(notify);
  }
  return () => {
    store.listeners.delete(listener);
    if (store.listeners.size === 0 && store.detach) {
      store.detach();
      store.detach = null;
    }
  };
}

function readOutline(editor: Editor): readonly OutlineHeading[] {
  const store = storeFor(editor);
  if (!store.detach || store.doc === null) refresh(store, editor);
  return store.headings;
}

const noopSubscribe = () => () => {};
const readEmpty = () => EMPTY;

function useOutlineHeadings(editor: Editor | null): readonly OutlineHeading[] {
  const live = editor && !editor.isDestroyed ? editor : null;
  const subscribe = useCallback((listener: () => void) => (live ? subscribeOutline(live, listener) : () => {}), [live]);
  const getSnapshot = useCallback(() => (live ? readOutline(live) : EMPTY), [live]);
  return useSyncExternalStore(live ? subscribe : noopSubscribe, live ? getSnapshot : readEmpty, readEmpty);
}

function headingTop(editor: Editor, pos: number): number | null {
  if (editor.isDestroyed) return null;
  try {
    const size = editor.state.doc.content.size;
    return editor.view.coordsAtPos(Math.min(pos + 1, size)).top;
  } catch {
    return null;
  }
}

export function OutlinePanel({ editor, variant, scrollContainerRef, onClose, onNavigate }: OutlinePanelProps): React.JSX.Element {
  const t = useT();
  const headings = useOutlineHeadings(editor);
  const [activePos, setActivePos] = useState<number | null>(null);
  const frameRef = useRef(0);

  const measure = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = 0;
      const container = scrollContainerRef.current;
      if (!editor || editor.isDestroyed || headings.length === 0) {
        setActivePos(null);
        return;
      }
      const limit = (container ? container.getBoundingClientRect().top : 0) + ACTIVE_OFFSET_PX;
      let active: number | null = null;
      for (const heading of headings) {
        const top = headingTop(editor, heading.pos);
        if (top === null) continue;
        if (top <= limit) active = heading.pos;
        else break;
      }
      setActivePos(active ?? headings[0].pos);
    });
  }, [editor, headings, scrollContainerRef]);

  useEffect(() => {
    measure();
    const container = scrollContainerRef.current;
    const target: HTMLElement | Window = container ?? window;
    target.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      target.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    };
  }, [measure, scrollContainerRef]);

  const navigate = (heading: OutlineHeading) => {
    if (!editor || editor.isDestroyed) return;
    try {
      const size = editor.state.doc.content.size;
      editor.chain().setTextSelection(Math.min(heading.pos + 1, size)).run();
    } catch {
      return;
    }
    const container = scrollContainerRef.current;
    const top = headingTop(editor, heading.pos);
    if (container && top !== null) {
      const offset = top - container.getBoundingClientRect().top - JUMP_OFFSET_PX;
      container.scrollTo({ top: container.scrollTop + offset, behavior: "smooth" });
    } else {
      editor.commands.scrollIntoView();
    }
    setActivePos(heading.pos);
    onNavigate?.(heading);
  };

  return (
    <nav
      aria-label={t("docs.outline.title")}
      data-variant={variant}
      className={cn(
        "flex flex-col",
        variant === "gutter" ? "sticky top-6 max-h-[calc(100dvh-9rem)] w-[208px] self-start" : "w-full",
        variant === "panel" && "p-2",
      )}
    >
      {variant === "gutter" && (
        <div className="flex h-8 shrink-0 items-center gap-1 ps-2">
          <Eyebrow as="h3" className="min-w-0 flex-1 truncate">
            {t("docs.outline.title")}
          </Eyebrow>
          {onClose && (
            <Button type="button" variant="ghost" size="icon-xs" aria-label={t("docs.outline.hide")} title={t("docs.outline.hide")} onClick={onClose}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}
      {!editor ? (
        <div className="flex justify-center p-4" role="status" aria-label={t("common.loading")}>
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : headings.length === 0 ? (
        <EmptyState compact icon={ListTree} description={t("docs.outline.empty")} />
      ) : (
        <ul className={cn("min-h-0 overflow-y-auto", variant === "sheet" ? "space-y-0.5" : "space-y-px")}>
          {headings.map((heading) => {
            const active = heading.pos === activePos;
            return (
              <li key={`${heading.pos}:${heading.text}`}>
                <button
                  type="button"
                  title={heading.text}
                  aria-current={active ? "location" : undefined}
                  onClick={() => navigate(heading)}
                  className={cn(
                    "block w-full truncate rounded pe-2 text-start transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    INDENT[heading.level],
                    variant === "sheet" ? "min-h-11 py-2.5 text-[15px]" : "py-1 text-[12.5px]",
                    active ? "bg-muted font-medium text-foreground" : "text-muted-foreground",
                    heading.kind === "title" && "font-medium",
                  )}
                >
                  {heading.text}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
