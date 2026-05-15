"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { BuilderToolbar, type BuilderTab } from "./toolbar";
import { HtmlLeftPanel } from "./html-left-panel";
import { HtmlCanvas, type HtmlSelectionInfo, type CanvasContextMenuEvent } from "./html-canvas";
import { HtmlElementPalette } from "./html-element-palette";
import { CanvasContextMenu, type CanvasMenuTarget } from "./canvas-context-menu-html";
import {
  deleteAt,
  duplicateAt,
  moveAt,
  wrapAt,
  insertAt,
  getOuterHtmlAt,
} from "@/lib/builder/html-mutations";
import { HtmlPropertiesPanel } from "./html-properties-panel";
import { BuilderAnimator } from "./builder-animator";
import { FlowFnEditor } from "./flowfn-editor";
import { MerchivaChat, type BuilderModeContext } from "@/components/merchiva-chat-dashboard";
import { useDefaultLayout } from "react-resizable-panels";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { createPage, updatePage, updateSite } from "@/lib/spacetimedb/actions";
import { buildPageTemplate, type PageTemplateId } from "@/lib/builder/page-templates";
import { registerHtmlBridge } from "@/lib/builder/html-bridge";
import { prettyPrintHtml } from "@/lib/builder/html-format";
import type { Site, SitePage, Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Layers, MousePointerSquareDashed, SlidersHorizontal } from "lucide-react";

interface HtmlBuilderEditorProps {
  site: Site;
  pages: SitePage[];
  products: Product[];
  organizationId: string;
}

// Per-page HTML state with bounded undo/redo history. On first load of a page
// that still has legacy JSON elements but no html, render those to HTML so the
// migration is invisible to the user.
function useHtmlState(activePage: SitePage | undefined) {
  const [html, setHtmlRaw] = useState<string>("");
  const lastPageId = useRef<string | null>(null);
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const [, force] = useState(0);

  useEffect(() => {
    if (!activePage) return;
    if (lastPageId.current !== activePage.id) {
      lastPageId.current = activePage.id;
      undoStack.current = [];
      redoStack.current = [];
      if (activePage.html && activePage.html.trim().length > 0) {
        setHtmlRaw(activePage.html);
      } else if (activePage.elements && activePage.elements.length > 0) {
        // Migrate legacy JSON elements to HTML on the fly. Auto-save will then
        // persist the HTML, completing the migration.
        setHtmlRaw(elementsToInitialHtml(activePage.elements as ReturnType<typeof buildPageTemplate>, activePage.name));
      } else {
        setHtmlRaw(`<section style="padding: 80px 24px; text-align: center;">
  <h1 style="font-size: 48px; font-weight: 700; margin: 0 0 16px;">${escapeHtml(activePage.name)}</h1>
  <p style="font-size: 18px; color: #57534e;">Start editing — drop in HTML or ask Mr. Merchiva.</p>
</section>`);
      }
    }
  }, [activePage]);

  const setHtml: React.Dispatch<React.SetStateAction<string>> = useCallback((next) => {
    setHtmlRaw((prev) => {
      const resolved = typeof next === "function" ? (next as (p: string) => string)(prev) : next;
      if (resolved !== prev) {
        undoStack.current.push(prev);
        if (undoStack.current.length > 50) undoStack.current.shift();
        redoStack.current = [];
      }
      return resolved;
    });
  }, []);

  const undo = useCallback(() => {
    setHtmlRaw((prev) => {
      const last = undoStack.current.pop();
      if (last == null) return prev;
      redoStack.current.push(prev);
      force((n) => n + 1);
      return last;
    });
  }, []);

  const redo = useCallback(() => {
    setHtmlRaw((prev) => {
      const last = redoStack.current.pop();
      if (last == null) return prev;
      undoStack.current.push(prev);
      force((n) => n + 1);
      return last;
    });
  }, []);

  return {
    html,
    setHtml,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
    undo,
    redo,
  };
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isMobile;
}

export function HtmlBuilderEditor({ site, pages, products: _products, organizationId: _organizationId }: HtmlBuilderEditorProps) {
  const [activePageId, setActivePageId] = useState(pages[0]?.id || "");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [rightPanel, setRightPanel] = useState<"design" | "animator" | "ai">("design");
  const [selected, setSelected] = useState<HtmlSelectionInfo | null>(null);
  const isMobile = useIsMobile();
  // Active view index on mobile: 0 = left (pages/layers), 1 = canvas, 2 = right (props/AI).
  const [mobileView, setMobileView] = useState<0 | 1 | 2>(1);

  // Auto-switch to "properties" when the user picks an element on mobile.
  const lastSelectedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isMobile) return;
    const selector = selected?.selector ?? null;
    if (selector && selector !== lastSelectedRef.current) {
      setMobileView(2);
      setRightPanel("design");
    }
    lastSelectedRef.current = selector;
  }, [isMobile, selected]);

  const activePage = pages.find((p) => p.id === activePageId);
  const { html, setHtml, canUndo, canRedo, undo, redo } = useHtmlState(activePage);

  // Bridge that lets the editBuilderHtml action read/write the current page HTML
  // synchronously. Ref keeps the getter pointing at the latest value across renders.
  const htmlRef = useRef(html);
  htmlRef.current = html;
  useEffect(() => {
    return registerHtmlBridge(
      () => htmlRef.current,
      // Re-format on every bridge write (editBuilderHtml find/replace) so the
      // result stays consistently indented even if the AI's old_string/new_string
      // straddled formatting boundaries.
      (next) => setHtml(prettyPrintHtml(next)),
    );
  }, [setHtml]);

  // ── Element picker for Mr. Merchiva chat ──────────────────────────────────
  // Chat dispatches `builder:set-pick-mode` when the user toggles the picker.
  // While pick mode is active, an iframe click does NOT update the inspector;
  // instead we dispatch `builder:element-picked` for the chat to attach.
  const [pickMode, setPickMode] = useState(false);
  const pickModeRef = useRef(pickMode);
  pickModeRef.current = pickMode;

  useEffect(() => {
    function onSetPick(e: Event) {
      const detail = (e as CustomEvent).detail as { active?: boolean } | undefined;
      setPickMode(Boolean(detail?.active));
    }
    window.addEventListener("builder:set-pick-mode", onSetPick);
    return () => window.removeEventListener("builder:set-pick-mode", onSetPick);
  }, []);

  const handleCanvasSelect = useCallback((info: HtmlSelectionInfo | null) => {
    if (pickModeRef.current && info) {
      window.dispatchEvent(new CustomEvent("builder:element-picked", { detail: info }));
      return;
    }
    setSelected(info);
  }, []);

  // Click-insert from the element palette. Insertion rules:
  //   - Nothing selected → append to root.
  //   - Selected is a text-like element → insert as the next sibling (so
  //     dropping a button next to a heading reads naturally).
  //   - Selected is a container → append as the last child (so dropping a
  //     section into a layout puts it inside).
  const PALETTE_TEXT_TAGS = useRef(new Set([
    "p","h1","h2","h3","h4","h5","h6","span","a","button","li","strong","em",
    "b","i","small","label","blockquote","cite","code","figcaption",
  ]));
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const handlePaletteInsert = useCallback((snippet: string) => {
    if (typeof window === "undefined") return;
    setHtml((cur) => {
      try {
        const parser = new DOMParser();
        // Wrap in #__merchiva_root so the iframe's selector format ("#__merchiva_root > …")
        // resolves directly via querySelector.
        const doc = parser.parseFromString(
          `<!DOCTYPE html><html><body><div id="__merchiva_root">${cur}</div></body></html>`,
          "text/html",
        );
        const root = doc.getElementById("__merchiva_root");
        if (!root) return cur;
        const wrapper = doc.createElement("div");
        wrapper.innerHTML = snippet;
        const fragment = doc.createDocumentFragment();
        while (wrapper.firstChild) fragment.appendChild(wrapper.firstChild);

        const sel = selectedRef.current?.selector;
        let target: Element | null = null;
        if (sel) {
          try { target = doc.querySelector(sel); } catch {}
        }

        if (!target) {
          root.appendChild(fragment);
        } else {
          const tag = target.tagName.toLowerCase();
          if (PALETTE_TEXT_TAGS.current.has(tag)) {
            // Insert after the selected text element
            target.parentNode?.insertBefore(fragment, target.nextSibling);
          } else {
            // Drop INTO the container as last child
            target.appendChild(fragment);
          }
        }
        return prettyPrintHtml(root.innerHTML);
      } catch (err) {
        console.error("[palette insert] failed:", err);
        return cur;
      }
    });
  }, [setHtml]);

  // ── Canvas right-click menu, clipboard, and inline-edit trigger ────────────
  const [contextMenu, setContextMenu] = useState<CanvasMenuTarget | null>(null);
  const [editTextSelector, setEditTextSelector] = useState<string | null>(null);
  // Internal HTML clipboard (separate from system clipboard so structured paste
  // works even when the user hasn't granted clipboard-write permission).
  const clipboardRef = useRef<string | null>(null);
  const [hasClipboard, setHasClipboard] = useState(false);

  const handleCanvasContextMenu = useCallback((e: CanvasContextMenuEvent) => {
    setSelected({ selector: e.selector, tag: e.tag, attrs: e.attrs, outerHtml: e.outerHtml });
    setContextMenu({ selector: e.selector, tag: e.tag, isText: e.isText, x: e.x, y: e.y });
  }, []);

  const closeMenu = useCallback(() => setContextMenu(null), []);

  // Action handlers — each works on the latest html via setHtml's updater form
  // so they remain correct even when clicks/keys arrive in quick succession.
  const actEditText = useCallback((t: CanvasMenuTarget) => {
    if (!t.isText) return;
    // Bump-by-suffix trick so re-triggering the same selector still fires the
    // useEffect in HtmlCanvas that posts the message into the iframe.
    setEditTextSelector(t.selector + "#" + Date.now());
    // The iframe message handler matches the actual CSS selector, so strip the
    // suffix on the way through.
    setTimeout(() => setEditTextSelector(t.selector), 0);
  }, []);

  const actDuplicate = useCallback((t: CanvasMenuTarget) => {
    setHtml((cur) => {
      const { html: next, newSelector } = duplicateAt(cur, t.selector);
      if (newSelector) {
        setSelected({ selector: newSelector, tag: t.tag, attrs: {}, outerHtml: "" });
      }
      return prettyPrintHtml(next);
    });
  }, [setHtml]);

  const actDelete = useCallback((t: CanvasMenuTarget) => {
    setHtml((cur) => prettyPrintHtml(deleteAt(cur, t.selector)));
    setSelected(null);
  }, [setHtml]);

  const actMoveUp = useCallback((t: CanvasMenuTarget) => {
    setHtml((cur) => {
      const { html: next, newSelector } = moveAt(cur, t.selector, "up");
      if (newSelector) setSelected({ selector: newSelector, tag: t.tag, attrs: {}, outerHtml: "" });
      return prettyPrintHtml(next);
    });
  }, [setHtml]);

  const actMoveDown = useCallback((t: CanvasMenuTarget) => {
    setHtml((cur) => {
      const { html: next, newSelector } = moveAt(cur, t.selector, "down");
      if (newSelector) setSelected({ selector: newSelector, tag: t.tag, attrs: {}, outerHtml: "" });
      return prettyPrintHtml(next);
    });
  }, [setHtml]);

  const actWrap = useCallback((t: CanvasMenuTarget) => {
    setHtml((cur) => {
      const { html: next, newSelector } = wrapAt(cur, t.selector, "div");
      if (newSelector) setSelected({ selector: newSelector, tag: "div", attrs: {}, outerHtml: "" });
      return prettyPrintHtml(next);
    });
  }, [setHtml]);

  const actCopy = useCallback((t: CanvasMenuTarget) => {
    const outer = getOuterHtmlAt(htmlRef.current, t.selector);
    if (!outer) return;
    clipboardRef.current = outer;
    setHasClipboard(true);
    // Best-effort write to system clipboard too (silently fail without permission).
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(outer).catch(() => {});
    }
  }, []);

  const actCut = useCallback((t: CanvasMenuTarget) => {
    actCopy(t);
    actDelete(t);
  }, [actCopy, actDelete]);

  const actPaste = useCallback((t: CanvasMenuTarget) => {
    const snippet = clipboardRef.current;
    if (!snippet) return;
    setHtml((cur) => {
      // Text targets paste as siblings; containers paste inside.
      const TEXT = PALETTE_TEXT_TAGS.current;
      const position = TEXT.has(t.tag) ? "after" : "inside";
      const { html: next, newSelector } = insertAt(cur, t.selector, snippet, position);
      if (newSelector) setSelected({ selector: newSelector, tag: "", attrs: {}, outerHtml: "" });
      return prettyPrintHtml(next);
    });
  }, [setHtml]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  // Both paths converge here:
  //   - Parent window keydown (focus on canvas chrome/sidebars)
  //   - iframe-forwarded merchiva:shortcut message (focus inside the canvas)
  const handleShortcut = useCallback((key: string, meta: boolean, shift: boolean) => {
    if (meta && (key === "z" || key === "Z") && !shift) { undo(); return; }
    if ((meta && (key === "y" || key === "Y")) || (meta && shift && (key === "z" || key === "Z"))) {
      redo();
      return;
    }
    const sel = selectedRef.current;
    if (!sel) return;
    const t: CanvasMenuTarget = {
      selector: sel.selector,
      tag: sel.tag,
      isText: PALETTE_TEXT_TAGS.current.has(sel.tag),
      x: 0, y: 0,
    };
    if (key === "Delete" || key === "Backspace") { actDelete(t); return; }
    if (meta && (key === "c" || key === "C")) { actCopy(t); return; }
    if (meta && (key === "x" || key === "X")) { actCut(t); return; }
    if (meta && (key === "v" || key === "V")) { actPaste(t); return; }
    if (meta && (key === "d" || key === "D")) { actDuplicate(t); return; }
    if (!meta && (key === "t" || key === "T")) {
      if (t.isText) actEditText(t);
      return;
    }
  }, [undo, redo, actDelete, actCopy, actCut, actPaste, actDuplicate, actEditText]);

  useEffect(() => {
    function isEditableTarget(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (el.isContentEditable) return true;
      return false;
    }
    function onKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;
      const meta = e.metaKey || e.ctrlKey;
      const handled =
        (e.key === "Delete" || e.key === "Backspace") ||
        (meta && /^[zZyYcCxXvVdD]$/.test(e.key)) ||
        (!meta && (e.key === "t" || e.key === "T"));
      if (!handled) return;
      e.preventDefault();
      handleShortcut(e.key, meta, e.shiftKey);
    }
    function onMessage(e: MessageEvent) {
      if (!e.data || typeof e.data !== "object") return;
      if (e.data.type !== "merchiva:shortcut") return;
      const p = e.data.payload as { key: string; meta: boolean; shift: boolean };
      handleShortcut(p.key, !!p.meta, !!p.shift);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("message", onMessage);
    };
  }, [handleShortcut]);

  // Persist resizable layout (left | canvas | right) across reloads — see
  // react-resizable-panels v4 docs: useDefaultLayout returns the props to
  // forward to the Group.
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "merchiva-builder-layout",
    panelIds: ["builder-left", "builder-canvas", "builder-right"],
  });

  // Tab system (single-page tab — keeps parity with BuilderEditor for now)
  const [tabs, setTabs] = useState<BuilderTab[]>(() => {
    const initial: BuilderTab[] = pages.slice(0, 1).map((p) => ({ kind: "page" as const, pageId: p.id }));
    return initial.length ? initial : [{ kind: "page" as const, pageId: pages[0]?.id || "" }];
  });
  const [activeTab, setActiveTab] = useState<BuilderTab>(tabs[0]);

  // ── Auto-save ─────────────────────────────────────────────────────────────
  const lastSavedRef = useRef<string>("");
  useEffect(() => {
    if (!activePage) return;
    if (html === lastSavedRef.current) return;
    if (html === (activePage.html ?? "")) {
      lastSavedRef.current = html;
      return;
    }
    const t = setTimeout(async () => {
      try {
        setSaving(true);
        await updatePage(activePage.id, {
          name: activePage.name,
          slug: activePage.slug,
          elements: activePage.elements ? JSON.stringify(activePage.elements) : "[]",
          sortOrder: activePage.sortOrder,
          html,
          metadata: undefined,
        });
        lastSavedRef.current = html;
        setSavedAt(Date.now());
      } catch (err) {
        console.error("HTML auto-save failed:", err);
      } finally {
        setSaving(false);
      }
    }, 800);
    return () => clearTimeout(t);
  }, [html, activePage]);

  // ── Page-properties queue (AI updateBuilderPage actions) ─────────────────
  // Coalesces partial patches (name, slug, metadata fields) so a burst of AI
  // actions ends as a single updatePage call merged on top of the latest state.
  const activePageRef = useRef(activePage);
  activePageRef.current = activePage;
  const pagePatchRef = useRef<{
    pending: { name?: string; slug?: string; metadata: Record<string, string | undefined>; pageId?: string };
    timer: ReturnType<typeof setTimeout> | null;
    flushing: boolean;
  }>({ pending: { metadata: {} }, timer: null, flushing: false });

  const flushPagePatch = useCallback(async () => {
    const q = pagePatchRef.current;
    if (q.flushing) return;
    q.flushing = true;
    try {
      while (Object.keys(q.pending.metadata).length > 0 || q.pending.name !== undefined || q.pending.slug !== undefined) {
        const patch = q.pending;
        q.pending = { metadata: {} };
        const page = activePageRef.current;
        if (!page || (patch.pageId && patch.pageId !== page.id)) continue;
        const nextName = patch.name ?? page.name;
        const nextSlugRaw = patch.slug ?? page.slug;
        const nextSlug = (nextSlugRaw || page.slug).toLowerCase().replace(/[^a-z0-9-]/g, "-");
        const mergedMeta: Record<string, string> = {};
        for (const [k, v] of Object.entries({ ...(page.metadata ?? {}), ...patch.metadata })) {
          if (v && String(v).trim()) mergedMeta[k] = String(v).trim();
        }
        try {
          await updatePage(page.id, {
            name: nextName.trim() || page.name,
            slug: nextSlug,
            elements: JSON.stringify(page.elements ?? []),
            sortOrder: page.sortOrder,
            html: page.html,
            metadata: Object.keys(mergedMeta).length > 0 ? JSON.stringify(mergedMeta) : undefined,
          });
        } catch (err) {
          console.error("[builder:update-page] flush failed:", err);
          break;
        }
      }
    } finally {
      q.flushing = false;
    }
  }, []);

  const schedulePagePatchFlush = useCallback(() => {
    const q = pagePatchRef.current;
    if (q.timer) return;
    q.timer = setTimeout(() => {
      q.timer = null;
      flushPagePatch();
    }, 80);
  }, [flushPagePatch]);

  // ── Site-properties queue (AI updateBuilderSite actions) ──────────────────
  const sitePatchRef = useRef<{
    pending: { name?: string; slug?: string; customDomain?: string | null; published?: boolean; features: Record<string, boolean> };
    timer: ReturnType<typeof setTimeout> | null;
    flushing: boolean;
  }>({ pending: { features: {} }, timer: null, flushing: false });

  const flushSitePatch = useCallback(async () => {
    const q = sitePatchRef.current;
    if (q.flushing) return;
    q.flushing = true;
    try {
      while (
        Object.keys(q.pending.features).length > 0 ||
        q.pending.name !== undefined ||
        q.pending.slug !== undefined ||
        q.pending.customDomain !== undefined ||
        q.pending.published !== undefined
      ) {
        const patch = q.pending;
        q.pending = { features: {} };
        const latest = siteRef.current;
        const data: Record<string, unknown> = {};
        if (patch.name !== undefined) data.name = patch.name.trim() || latest.name;
        if (patch.slug !== undefined) data.slug = (patch.slug.trim() || latest.slug).toLowerCase().replace(/[^a-z0-9-]/g, "-");
        if (patch.customDomain !== undefined) data.customDomain = patch.customDomain || null;
        if (patch.published !== undefined) data.published = patch.published;
        if (Object.keys(patch.features).length > 0) {
          const nextFeatures = {
            ...latest.features,
            ...(latest.values ? { _values: latest.values } : {}),
            ...patch.features,
          };
          data.features = JSON.stringify(nextFeatures);
        }
        try {
          await updateSite(latest.id, data);
        } catch (err) {
          console.error("[builder:update-site] flush failed:", err);
          break;
        }
      }
    } finally {
      q.flushing = false;
    }
  }, []);

  const scheduleSitePatchFlush = useCallback(() => {
    const q = sitePatchRef.current;
    if (q.timer) return;
    q.timer = setTimeout(() => {
      q.timer = null;
      flushSitePatch();
    }, 80);
  }, [flushSitePatch]);

  // ── Site values queue ─────────────────────────────────────────────────────
  // The AI can fire `setBuilderValue` many times in a single burst (e.g. when
  // creating all site-wide values at once). Without coalescing, each handler
  // would read the *stale* `site.values` from its closure and write back
  // `{...stale, justThisKey: value}` — the writes race and only the last one
  // sticks. We buffer key→value (or key→null for deletes), then flush once
  // with the merged result. Refs let us read the latest site at flush time
  // and survive re-renders without re-binding listeners.
  const siteRef = useRef(site);
  siteRef.current = site;
  const valuesQueueRef = useRef<{
    pending: Map<string, string | null>;
    timer: ReturnType<typeof setTimeout> | null;
    flushing: boolean;
  }>({ pending: new Map(), timer: null, flushing: false });

  const flushValuesQueue = useCallback(async () => {
    const q = valuesQueueRef.current;
    if (q.flushing) return;
    q.flushing = true;
    try {
      while (q.pending.size > 0) {
        const batch = q.pending;
        q.pending = new Map();
        const latest = siteRef.current;
        const merged = { ...(latest.values ?? {}) };
        for (const [k, v] of batch) {
          if (v === null) delete merged[k];
          else merged[k] = v;
        }
        const featuresWithValues = { ...latest.features, _values: merged };
        try {
          await updateSite(latest.id, { features: JSON.stringify(featuresWithValues) });
        } catch (err) {
          console.error("[builder:values] flush failed:", err);
          break;
        }
      }
    } finally {
      q.flushing = false;
    }
  }, []);

  const scheduleValuesFlush = useCallback(() => {
    const q = valuesQueueRef.current;
    if (q.timer) return;
    q.timer = setTimeout(() => {
      q.timer = null;
      flushValuesQueue();
    }, 80);
  }, [flushValuesQueue]);

  // ── AI event listeners (HTML actions from Mr. Merchiva) ────────────────────
  useEffect(() => {
    function setHtmlEvent(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (typeof detail?.html === "string") setHtml(prettyPrintHtml(detail.html));
    }
    function appendHtmlEvent(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (typeof detail?.html === "string") {
        setHtml((cur) => prettyPrintHtml(cur + "\n" + detail.html));
      }
    }
    function replaceFragmentEvent(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (!detail?.selector || typeof detail.html !== "string") return;
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(`<!DOCTYPE html><html><body>${html}</body></html>`, "text/html");
        const target = doc.querySelector(detail.selector);
        if (target) {
          const wrapper = doc.createElement("div");
          wrapper.innerHTML = detail.html;
          while (wrapper.firstChild) target.parentNode?.insertBefore(wrapper.firstChild, target);
          target.remove();
          setHtml(prettyPrintHtml(doc.body.innerHTML));
        }
      } catch (err) {
        console.error("[builder:html-replace] failed:", err);
      }
    }
    function deleteFragmentEvent(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (!detail?.selector) return;
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(`<!DOCTYPE html><html><body>${html}</body></html>`, "text/html");
        doc.querySelectorAll(detail.selector).forEach((el) => el.remove());
        setHtml(prettyPrintHtml(doc.body.innerHTML));
      } catch (err) {
        console.error("[builder:html-delete] failed:", err);
      }
    }
    // Mr. Merchiva can also generate / replace FlowFn functions while in HTML
    // mode. The legacy AiElementInserter (Craft.js) handled this; mirror it here.
    function addFunctionEvent(e: Event) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fn = (e as CustomEvent).detail as any;
      if (!fn || !fn.name) return;
      try {
        const raw = localStorage.getItem("flowfn:fns");
        const fns = raw ? JSON.parse(raw) : [];
        if (!fn.id) fn.id = "fn_" + Math.random().toString(36).slice(2, 8);
        if (!fn.nodes) fn.nodes = [];
        if (!fn.edges) fn.edges = [];
        if (!fn.tests) fn.tests = [];
        if (!fn.desc) fn.desc = "";
        // Replace any existing function with the same name (idempotent)
        const updated = fns.filter((f: { name: string }) => f.name !== fn.name);
        updated.push(fn);
        localStorage.setItem("flowfn:fns", JSON.stringify(updated));
        // Notify FlowFnEditor to reload its list
        window.dispatchEvent(new StorageEvent("storage", { key: "flowfn:fns", newValue: JSON.stringify(updated) }));
      } catch (err) {
        console.error("[flowfn:ai-add-function] failed:", err);
      }
    }
    function deleteFunctionEvent(e: Event) {
      const detail = (e as CustomEvent).detail as { name?: string } | undefined;
      const name = detail?.name;
      if (!name) return;
      try {
        const raw = localStorage.getItem("flowfn:fns");
        const fns = raw ? JSON.parse(raw) : [];
        const updated = fns.filter((f: { name: string }) => f.name !== name);
        if (updated.length === fns.length) return; // nothing to delete
        // Keep at least one function so FlowFnEditor doesn't blow up on activeId
        if (updated.length === 0) return;
        localStorage.setItem("flowfn:fns", JSON.stringify(updated));
        window.dispatchEvent(new StorageEvent("storage", { key: "flowfn:fns", newValue: JSON.stringify(updated) }));
      } catch (err) {
        console.error("[flowfn:ai-delete-function] failed:", err);
      }
    }
    // Mr. Merchiva can also create / remove site-wide custom values from chat.
    // Each event just appends to the coalescing queue; the queue flushes a
    // single merged updateSite so 6 rapid setBuilderValue calls don't race.
    async function setValueEvent(e: Event) {
      const detail = (e as CustomEvent).detail as { key?: string; value?: string } | undefined;
      const key = detail?.key?.trim();
      if (!key || /[^\w]/.test(key)) {
        console.warn("[builder:set-value] invalid key:", key);
        return;
      }
      const { SYSTEM_VALUE_KEYS } = await import("@/lib/builder/site-values");
      if (SYSTEM_VALUE_KEYS.has(key)) {
        console.warn("[builder:set-value] cannot overwrite system key:", key);
        return;
      }
      valuesQueueRef.current.pending.set(key, detail?.value ?? "");
      scheduleValuesFlush();
    }
    function deleteValueEvent(e: Event) {
      const detail = (e as CustomEvent).detail as { key?: string } | undefined;
      const key = detail?.key?.trim();
      if (!key) return;
      valuesQueueRef.current.pending.set(key, null);
      scheduleValuesFlush();
    }
    // AI page-property patch — stage and flush via pagePatchRef.
    function updatePageEvent(e: Event) {
      const detail = (e as CustomEvent).detail as Record<string, unknown> | undefined;
      if (!detail) return;
      const q = pagePatchRef.current.pending;
      if (typeof detail.pageId === "string" && detail.pageId) q.pageId = detail.pageId;
      if (typeof detail.name === "string") q.name = detail.name;
      if (typeof detail.slug === "string") q.slug = detail.slug;
      for (const key of ["title", "description", "keywords", "ogImage", "ogTitle", "ogDescription", "canonicalUrl", "robots"] as const) {
        if (typeof detail[key] === "string") q.metadata[key] = detail[key] as string;
      }
      schedulePagePatchFlush();
    }
    // AI site-property patch.
    function updateSiteEvent(e: Event) {
      const detail = (e as CustomEvent).detail as Record<string, unknown> | undefined;
      if (!detail) return;
      const q = sitePatchRef.current.pending;
      if (typeof detail.name === "string") q.name = detail.name;
      if (typeof detail.slug === "string") q.slug = detail.slug;
      if (typeof detail.customDomain === "string") q.customDomain = detail.customDomain;
      if (typeof detail.published === "boolean") q.published = detail.published;
      const plugins = detail.plugins;
      if (plugins && typeof plugins === "object" && !Array.isArray(plugins)) {
        const ALLOWED = new Set(["auth", "cart", "checkout", "products", "subscriptions", "rewards", "booking", "account"]);
        for (const [k, v] of Object.entries(plugins as Record<string, unknown>)) {
          if (ALLOWED.has(k) && typeof v === "boolean") q.features[k] = v;
        }
      }
      scheduleSitePatchFlush();
    }
    window.addEventListener("builder:html-set", setHtmlEvent);
    window.addEventListener("builder:html-append", appendHtmlEvent);
    window.addEventListener("builder:html-replace", replaceFragmentEvent);
    window.addEventListener("builder:html-delete", deleteFragmentEvent);
    window.addEventListener("flowfn:ai-add-function", addFunctionEvent);
    window.addEventListener("flowfn:ai-delete-function", deleteFunctionEvent);
    window.addEventListener("builder:set-value", setValueEvent);
    window.addEventListener("builder:delete-value", deleteValueEvent);
    window.addEventListener("builder:update-page", updatePageEvent);
    window.addEventListener("builder:update-site", updateSiteEvent);
    return () => {
      window.removeEventListener("builder:html-set", setHtmlEvent);
      window.removeEventListener("builder:html-append", appendHtmlEvent);
      window.removeEventListener("builder:html-replace", replaceFragmentEvent);
      window.removeEventListener("builder:html-delete", deleteFragmentEvent);
      window.removeEventListener("flowfn:ai-add-function", addFunctionEvent);
      window.removeEventListener("flowfn:ai-delete-function", deleteFunctionEvent);
      window.removeEventListener("builder:set-value", setValueEvent);
      window.removeEventListener("builder:delete-value", deleteValueEvent);
      window.removeEventListener("builder:update-page", updatePageEvent);
      window.removeEventListener("builder:update-site", updateSiteEvent);
    };
  }, [html, setHtml, scheduleValuesFlush, schedulePagePatchFlush, scheduleSitePatchFlush]);

  // ── Page management ────────────────────────────────────────────────────────
  const handlePageSwitch = useCallback((pageId: string) => {
    setActivePageId(pageId);
    setSelected(null);
    const existing = tabs.find((t) => t.kind === "page" && t.pageId === pageId);
    if (existing) {
      setActiveTab(existing);
    } else {
      const newTab: BuilderTab = { kind: "page", pageId };
      setTabs((t) => [...t, newTab]);
      setActiveTab(newTab);
    }
  }, [tabs]);

  const handleTabSwitch = useCallback((tab: BuilderTab) => {
    setActiveTab(tab);
    if (tab.kind === "page") {
      setActivePageId(tab.pageId);
      setSelected(null);
    }
  }, []);

  const handleTabClose = useCallback((tab: BuilderTab) => {
    setTabs((prev) => {
      const next = prev.filter((t) => {
        if (tab.kind === "functions" && t.kind === "functions") return false;
        if (tab.kind === "page" && t.kind === "page" && t.pageId === tab.pageId) return false;
        return true;
      });
      if (next.length === 0) {
        const fallback: BuilderTab = { kind: "page", pageId: pages[0]?.id || "" };
        next.push(fallback);
      }
      const wasActive = (tab.kind === "functions" && activeTab.kind === "functions") ||
        (tab.kind === "page" && activeTab.kind === "page" && tab.pageId === activeTab.pageId);
      if (wasActive) {
        const newActive = next[next.length - 1];
        setActiveTab(newActive);
        if (newActive.kind === "page") setActivePageId(newActive.pageId);
      }
      return next;
    });
  }, [activeTab, pages]);

  const handleTabOpen = useCallback((tab: BuilderTab) => {
    if (tab.kind === "functions" && tabs.some((t) => t.kind === "functions")) {
      setActiveTab(tabs.find((t) => t.kind === "functions")!);
      return;
    }
    if (tab.kind === "page" && tabs.some((t) => t.kind === "page" && t.pageId === tab.pageId)) {
      setActiveTab(tab);
      setActivePageId(tab.pageId);
      return;
    }
    setTabs((t) => [...t, tab]);
    setActiveTab(tab);
    if (tab.kind === "page") setActivePageId(tab.pageId);
  }, [tabs]);

  const handlePublish = useCallback(async () => {
    try {
      await updateSite(site.id, { published: true });
    } catch (err) {
      console.error("Publish failed:", err);
    }
  }, [site.id]);

  const handleAddPage = useCallback(
    async (name: string, templateId: PageTemplateId) => {
      try {
        const elements = buildPageTemplate(templateId);
        await createPage({
          siteId: site.id,
          name,
          slug: name.toLowerCase().replace(/\s+/g, "-"),
          sortOrder: pages.length,
          elements: "[]",
          html: elementsToInitialHtml(elements, name),
        });
      } catch (err) {
        console.error("Add page failed:", err);
      }
    },
    [site.id, pages.length],
  );

  // Theme CSS injected into the iframe so the user's site theme variables are available
  const themeCss = site.theme
    ? `:root {${Object.entries(site.theme as unknown as Record<string, unknown>)
        .filter(([, v]) => typeof v === "string" || typeof v === "number")
        .map(([k, v]) => `--theme-${k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())}: ${String(v)};`)
        .join(" ")}}`
    : "";

  // Read function names from localStorage for AI context. Re-read on every
  // render so the list stays roughly in sync after the AI adds/removes one.
  let functionNames: string[] = [];
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem("flowfn:fns");
      if (raw) functionNames = (JSON.parse(raw) as Array<{ name: string }>).map((f) => f.name);
    } catch {}
  }

  const builderContext: BuilderModeContext = {
    siteId: site.id,
    siteName: site.name,
    pageId: activePage?.id ?? "",
    pageName: activePage?.name ?? "(no page)",
    elements: [],
    theme: site.theme as unknown as Record<string, unknown> | undefined,
    html,
    selectedSelector: selected?.selector ?? null,
    customValues: site.values,
    pages: pages.map((p) => ({ id: p.id, name: p.name, slug: p.slug })),
    functions: functionNames,
    pageSlug: activePage?.slug,
    pageMetadata: activePage?.metadata as Record<string, string | undefined> | undefined,
    siteSlug: site.slug,
    customDomain: site.customDomain,
    sitePublished: site.published,
    siteFeatures: site.features as unknown as Record<string, boolean>,
  };

  const leftPanel = (
    <HtmlLeftPanel
      site={site}
      pages={pages}
      activePageId={activePageId}
      onPageSwitch={handlePageSwitch}
      onPublish={handlePublish}
      onAddPage={handleAddPage}
      html={html}
      selectedSelector={selected?.selector ?? null}
      onSelectElement={handleCanvasSelect}
    />
  );

  const canvasPanel = (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      {activeTab.kind === "page" ? (
        <>
          <HtmlElementPalette onInsert={handlePaletteInsert} />
          <div className="flex-1 min-h-0">
            <HtmlCanvas
              html={html}
              themeCss={themeCss}
              selectedSelector={selected?.selector ?? null}
              onChange={setHtml}
              onSelect={handleCanvasSelect}
              customValues={site.values}
              onContextMenu={handleCanvasContextMenu}
              editTextSelector={editTextSelector}
            />
          </div>
          <CanvasContextMenu
            target={contextMenu}
            hasClipboard={hasClipboard}
            onClose={closeMenu}
            onEditText={actEditText}
            onDuplicate={actDuplicate}
            onCopy={actCopy}
            onCut={actCut}
            onPaste={actPaste}
            onMoveUp={actMoveUp}
            onMoveDown={actMoveDown}
            onWrap={actWrap}
            onDelete={actDelete}
          />
        </>
      ) : (
        <div className="flex-1 min-w-0 overflow-hidden">
          <FlowFnEditor siteId={site.id} site={site} />
        </div>
      )}
      {pickMode && activeTab.kind === "page" && (
        <div className="pointer-events-none absolute top-12 left-1/2 -translate-x-1/2 z-30 inline-flex items-center gap-2 h-7 px-3 rounded-full bg-sky-500 text-white text-[11.5px] font-medium shadow-lg">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-75 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
          </span>
          Click any element to attach · press Esc to cancel
        </div>
      )}
    </div>
  );

  const rightSide = (
    <div className="flex h-full w-full flex-col border-l border-border bg-background">
      <div className="flex border-b border-border">
        <button
          className={`flex-1 py-1.5 text-center text-[11px] font-medium transition-colors ${rightPanel === "design" ? "text-foreground border-b-2 border-foreground" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => setRightPanel("design")}
        >
          Properties
        </button>
        <button
          className={`flex-1 py-1.5 text-center text-[11px] font-medium transition-colors ${rightPanel === "animator" ? "text-foreground border-b-2 border-foreground" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => setRightPanel("animator")}
        >
          Animator
        </button>
        <button
          className={`flex-1 py-1.5 text-center text-[11px] font-medium transition-colors ${rightPanel === "ai" ? "text-foreground border-b-2 border-foreground" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => setRightPanel("ai")}
        >
          Mr. Merchiva
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        {rightPanel === "design" ? (
          <HtmlPropertiesPanel
            selected={selected}
            html={html}
            onHtmlChange={setHtml}
            site={site}
            activePage={activePage}
          />
        ) : rightPanel === "animator" ? (
          <BuilderAnimator selected={selected} html={html} onHtmlChange={setHtml} />
        ) : (
          <MerchivaChat compact header={false} builderContext={builderContext} />
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <BuilderToolbar
        site={site}
        pages={pages}
        activePageId={activePageId}
        onPageSwitch={handlePageSwitch}
        saving={saving}
        savedAt={savedAt}
        tabs={tabs}
        activeTab={activeTab}
        onTabSwitch={handleTabSwitch}
        onTabClose={handleTabClose}
        onTabOpen={handleTabOpen}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
      />
      {isMobile ? (
        <MobileBuilderShell
          active={mobileView}
          onChange={setMobileView}
          views={[leftPanel, canvasPanel, rightSide]}
        />
      ) : (
        <ResizablePanelGroup
          orientation="horizontal"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
          className="flex-1 overflow-hidden"
        >
          <ResizablePanel id="builder-left" defaultSize="17%" minSize="10%" maxSize="35%">
            {leftPanel}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel id="builder-canvas" defaultSize="58%" minSize="30%">
            {canvasPanel}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel id="builder-right" defaultSize="25%" minSize="16%" maxSize="50%">
            {rightSide}
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  );
}

// ─── Mobile shell with swipe-able views + bottom nav bar ───────────────────

const MOBILE_VIEW_LABELS = ["Pages", "Canvas", "Properties"] as const;
const MOBILE_VIEW_ICONS = [Layers, MousePointerSquareDashed, SlidersHorizontal] as const;

function MobileBuilderShell({
  active,
  onChange,
  views,
}: {
  active: 0 | 1 | 2;
  onChange: (v: 0 | 1 | 2) => void;
  views: [React.ReactNode, React.ReactNode, React.ReactNode];
}) {
  const dragStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const dragDx = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0); // px during active drag

  // Threshold to commit a view change.
  const SWIPE_THRESHOLD = 60;

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Only handle "primary" pointer (touch/single finger).
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragStart.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    dragDx.current = 0;
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    // Lock to horizontal once intent is clear.
    if (!dragging && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      setDragging(true);
    }
    if (dragging || Math.abs(dx) > Math.abs(dy)) {
      dragDx.current = dx;
      setDragOffset(dx);
    }
  }, [dragging]);

  const handlePointerUp = useCallback(() => {
    if (!dragStart.current) return;
    const dx = dragDx.current;
    dragStart.current = null;
    setDragging(false);
    setDragOffset(0);
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;
    if (dx > 0 && active > 0) onChange((active - 1) as 0 | 1 | 2);
    else if (dx < 0 && active < 2) onChange((active + 1) as 0 | 1 | 2);
  }, [active, onChange]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Slide track: 3 views laid out horizontally, translated based on active. */}
      <div
        className="flex flex-1 overflow-hidden touch-pan-y"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div
          className={cn(
            "flex h-full w-[300%] shrink-0",
            !dragging && "transition-transform duration-200 ease-out",
          )}
          style={{
            transform: `translateX(calc(${-active * (100 / 3)}% + ${dragOffset}px))`,
          }}
        >
          {views.map((view, i) => (
            <div key={i} className="h-full w-1/3 shrink-0 overflow-hidden">
              {view}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom nav bar */}
      <div
        className="flex shrink-0 border-t border-border bg-background"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          touchAction: "pan-y",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {MOBILE_VIEW_LABELS.map((label, i) => {
          const Icon = MOBILE_VIEW_ICONS[i];
          const isActive = active === i;
          return (
            <button
              key={label}
              type="button"
              onClick={() => onChange(i as 0 | 1 | 2)}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className={cn("h-4 w-4 transition-transform", isActive && "scale-110")} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Light-weight stub: when a new page is created via "Add page", the existing
// page template builder produces JSON elements. We render them to a basic HTML
// scaffold so HTML mode has something to start with. Users can then edit freely
// or have Mr. Merchiva regenerate.
function elementsToInitialHtml(elements: ReturnType<typeof buildPageTemplate>, pageName: string): string {
  if (!elements || elements.length === 0) {
    return `<section style="padding: 80px 24px; text-align: center;">
  <h1 style="font-size: 48px; font-weight: 700; margin: 0 0 16px;">${escapeHtml(pageName)}</h1>
  <p style="font-size: 18px; color: #57534e;">Start editing this page — drop in HTML or ask Mr. Merchiva.</p>
</section>`;
  }
  // Naive renderer: walk the element tree, emit divs/text/images/buttons.
  return elements.map(renderEl).join("\n");
}

interface SiteEl {
  id?: string;
  type: string;
  props?: { content?: string; tag?: string; src?: string; alt?: string; href?: string; style?: Record<string, string | number> };
  children?: SiteEl[];
}

function renderEl(el: SiteEl): string {
  const props = el.props ?? {};
  const style = styleObjToString(props.style);
  const styleAttr = style ? ` style="${escapeAttr(style)}"` : "";
  switch (el.type) {
    case "text": {
      const tag = props.tag || "p";
      return `<${tag}${styleAttr}>${escapeHtml(props.content ?? "")}</${tag}>`;
    }
    case "image":
      return `<img src="${escapeAttr(props.src ?? "")}" alt="${escapeAttr(props.alt ?? "")}"${styleAttr} />`;
    case "button":
      return `<button${styleAttr}>${escapeHtml(props.content ?? "Button")}</button>`;
    case "layout":
    case "container":
    default: {
      const inner = (el.children ?? []).map(renderEl).join("\n");
      return `<div${styleAttr}>${inner}</div>`;
    }
  }
}

function styleObjToString(style?: Record<string, string | number>): string {
  if (!style) return "";
  return Object.entries(style)
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())}: ${v}`)
    .join("; ");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;");
}
