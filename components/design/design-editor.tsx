"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, ChevronDown, Maximize2, Palette, Redo2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { useDefaultLayout } from "react-resizable-panels";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  HtmlCanvas,
  type HtmlSelectionInfo,
} from "@/components/builder/html-canvas";
import { HtmlElementPalette } from "@/components/builder/html-element-palette";
import { HtmlPropertiesPanel } from "@/components/builder/html-properties-panel";
import { prettyPrintHtml } from "@/lib/builder/html-format";
import { updateDesign } from "@/lib/spacetimedb/actions";
import { DESIGN_PRESETS, findPreset, type DesignPreset } from "@/lib/design/presets";
import { hapticLight } from "@/lib/haptics";
import { useT } from "@/lib/i18n/context";
import type { Design } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DesignMerchivaChat } from "./design-merchiva-chat";
import { Spinner } from "@/components/ui/loaders/geometric";

interface DesignEditorProps {
  design: Design;
}

// Designs are static — link insertion is suppressed.
const HIDE_PALETTE_ITEMS = ["link"];

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function initialHtmlFor(d: Design): string {
  if (d.html && d.html.trim().length > 0) return d.html;
  return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#fafaf9;color:#1c1917;font-family:Inter,sans-serif">
  <div style="text-align:center;padding:48px">
    <h1 style="font-size:48px;font-weight:700;margin:0 0 12px">${escapeHtml(d.name)}</h1>
    <p style="color:#78716c;margin:0">${d.width} × ${d.height}</p>
  </div>
</div>`;
}

// HTML state with bounded undo/redo (mirrors useHtmlState in html-editor).
function useHtmlState(initial: string) {
  const [html, setHtmlRaw] = useState(initial);
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const [, force] = useState(0);

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

  const reset = useCallback((next: string) => {
    undoStack.current = [];
    redoStack.current = [];
    setHtmlRaw(next);
  }, []);

  return {
    html, setHtml, undo, redo, reset,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
  };
}

export function DesignEditor({ design: initialDesign }: DesignEditorProps) {
  const t = useT();

  const [design, setDesign] = useState<Design>(initialDesign);
  const { html, setHtml, undo, redo, canUndo, canRedo, reset: resetHtml } = useHtmlState(initialHtmlFor(initialDesign));
  const [selected, setSelected] = useState<HtmlSelectionInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rightPanel, setRightPanel] = useState<"properties" | "ai">("properties");
  const [presetMenu, setPresetMenu] = useState(false);
  const [nameEditing, setNameEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(design.name);

  // Reset when a different design loads (e.g. route param change).
  useEffect(() => {
    setDesign(initialDesign);
    resetHtml(initialHtmlFor(initialDesign));
    setNameDraft(initialDesign.name);
  }, [initialDesign, resetHtml]);

  // ── Auto-fit zoom on mount/resize/preset change ───────────────────────────
  const stageRef = useRef<HTMLDivElement>(null);
  // Track latest zoom in a ref so wheel/touch handlers stay registered once
  // and always read the current value (avoids 60+ listener re-registrations).
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  useEffect(() => {
    function fit() {
      const el = stageRef.current;
      if (!el) return;
      const padding = 48;
      const availW = el.clientWidth - padding;
      const availH = el.clientHeight - padding;
      if (availW <= 0 || availH <= 0) return;
      const v = Math.min(availW / design.width, availH / design.height, 1);
      setZoom(Math.max(0.05, Math.min(4, v)));
    }
    fit();
    const ro = new ResizeObserver(fit);
    if (stageRef.current) ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, [design.width, design.height]);

  // ── Figma-style gestures: pinch-zoom + wheel-zoom centered on cursor ──────
  // Trackpad pinch on macOS/Chrome arrives as a `wheel` event with ctrlKey=true.
  // Cmd/Ctrl + wheel works the same way. Touch pinch is handled via
  // touchstart/touchmove on devices that send touch events directly to this
  // container (the iframe owns its own touches, but areas around the canvas
  // and the canvas margin do propagate).
  const applyZoomAtPoint = useCallback((nextZoom: number, clientX: number, clientY: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const clamped = Math.max(0.05, Math.min(4, nextZoom));
    const prev = zoomRef.current;
    if (clamped === prev) return;
    // World coords of the cursor inside the scrollable content (pre-zoom).
    const worldX = (clientX - rect.left + stage.scrollLeft) / prev;
    const worldY = (clientY - rect.top + stage.scrollTop) / prev;
    setZoom(clamped);
    // After React commits the new layout, anchor the same world point under
    // the cursor by adjusting scroll. rAF gives the layout effect time to run.
    requestAnimationFrame(() => {
      const s = stageRef.current;
      if (!s) return;
      s.scrollLeft = worldX * clamped - (clientX - rect.left);
      s.scrollTop = worldY * clamped - (clientY - rect.top);
    });
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    function onWheel(e: WheelEvent) {
      // Trackpad pinch ⇒ ctrlKey is synthesized true. Cmd/Ctrl+wheel ⇒ zoom.
      // Plain wheel (no modifier) ⇒ let the container scroll naturally (pan).
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      // Exponential zoom feels Figma-like — small deltas at low zoom, larger
      // at high. deltaY < 0 = pinch out / scroll up = zoom in.
      const factor = Math.exp(-e.deltaY * 0.01);
      applyZoomAtPoint(zoomRef.current * factor, e.clientX, e.clientY);
    }

    // Touch pinch — 2 fingers anywhere on the stage gutter zoom in/out.
    let pinch: { dist: number; zoom: number; cx: number; cy: number } | null = null;

    function dist(a: Touch, b: Touch): number {
      const dx = a.clientX - b.clientX;
      const dy = a.clientY - b.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        const a = e.touches[0]; const b = e.touches[1];
        pinch = {
          dist: dist(a, b),
          zoom: zoomRef.current,
          cx: (a.clientX + b.clientX) / 2,
          cy: (a.clientY + b.clientY) / 2,
        };
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const a = e.touches[0]; const b = e.touches[1];
      const d = dist(a, b);
      const ratio = d / pinch.dist;
      const cx = (a.clientX + b.clientX) / 2;
      const cy = (a.clientY + b.clientY) / 2;
      applyZoomAtPoint(pinch.zoom * ratio, cx, cy);
    }

    function onTouchEnd(e: TouchEvent) {
      if (e.touches.length < 2) pinch = null;
    }

    // Safari (macOS) emits these for trackpad pinch as well — handle as
    // a fallback so Safari users get smooth zoom too.
    let gesture: { zoom: number; cx: number; cy: number } | null = null;

    function onGestureStart(e: Event) {
      const ge = e as unknown as { clientX: number; clientY: number; scale: number; preventDefault: () => void };
      ge.preventDefault();
      gesture = { zoom: zoomRef.current, cx: ge.clientX, cy: ge.clientY };
    }
    function onGestureChange(e: Event) {
      const ge = e as unknown as { clientX: number; clientY: number; scale: number; preventDefault: () => void };
      if (!gesture) return;
      ge.preventDefault();
      applyZoomAtPoint(gesture.zoom * ge.scale, ge.clientX, ge.clientY);
    }
    function onGestureEnd() { gesture = null; }

    stage.addEventListener("wheel", onWheel, { passive: false });
    stage.addEventListener("touchstart", onTouchStart, { passive: false });
    stage.addEventListener("touchmove", onTouchMove, { passive: false });
    stage.addEventListener("touchend", onTouchEnd, { passive: false });
    stage.addEventListener("touchcancel", onTouchEnd, { passive: false });
    stage.addEventListener("gesturestart", onGestureStart as EventListener, { passive: false });
    stage.addEventListener("gesturechange", onGestureChange as EventListener, { passive: false });
    stage.addEventListener("gestureend", onGestureEnd as EventListener);
    return () => {
      stage.removeEventListener("wheel", onWheel);
      stage.removeEventListener("touchstart", onTouchStart);
      stage.removeEventListener("touchmove", onTouchMove);
      stage.removeEventListener("touchend", onTouchEnd);
      stage.removeEventListener("touchcancel", onTouchEnd);
      stage.removeEventListener("gesturestart", onGestureStart as EventListener);
      stage.removeEventListener("gesturechange", onGestureChange as EventListener);
      stage.removeEventListener("gestureend", onGestureEnd as EventListener);
    };
  }, [applyZoomAtPoint]);

  // ── Space-bar + drag pan (Figma convention) ───────────────────────────────
  // While space is held, the cursor turns into a grab hand and dragging pans
  // the canvas. Implemented as scroll delta so it composes with the native
  // overflow-auto scroll.
  const [panMode, setPanMode] = useState(false);
  useEffect(() => {
    function isEditableTarget(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (el.isContentEditable) return true;
      return false;
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "Space" && !isEditableTarget(e.target)) {
        e.preventDefault();
        setPanMode(true);
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "Space") setPanMode(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !panMode) return;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    function onDown(e: MouseEvent) {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      stage!.style.cursor = "grabbing";
    }
    function onMove(e: MouseEvent) {
      if (!dragging) return;
      e.preventDefault();
      stage!.scrollLeft -= e.clientX - lastX;
      stage!.scrollTop -= e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
    }
    function onUp() {
      dragging = false;
      stage!.style.cursor = panMode ? "grab" : "";
    }
    stage.style.cursor = "grab";
    stage.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      stage.style.cursor = "";
      stage.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [panMode]);

  // ── Auto-save (debounced) ─────────────────────────────────────────────────
  const lastSavedRef = useRef<string>(initialDesign.html ?? "");
  const lastSavedMetaRef = useRef<string>(
    JSON.stringify({ name: initialDesign.name, width: initialDesign.width, height: initialDesign.height, preset: initialDesign.preset }),
  );
  useEffect(() => {
    const metaKey = JSON.stringify({ name: design.name, width: design.width, height: design.height, preset: design.preset });
    if (html === lastSavedRef.current && metaKey === lastSavedMetaRef.current) return;
    const timer = setTimeout(async () => {
      try {
        setSaving(true);
        await updateDesign(design.id, {
          name: design.name, width: design.width, height: design.height, html, preset: design.preset,
        });
        lastSavedRef.current = html;
        lastSavedMetaRef.current = metaKey;
        setSavedAt(Date.now());
      } catch (err) {
        console.error("design auto-save failed:", err);
      } finally {
        setSaving(false);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [html, design.id, design.name, design.width, design.height, design.preset]);

  // ── Keyboard shortcuts (cmd-z / cmd-shift-z) ──────────────────────────────
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
      if (meta && (e.key === "z" || e.key === "Z") && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if ((meta && (e.key === "y" || e.key === "Y")) || (meta && e.shiftKey && (e.key === "z" || e.key === "Z"))) {
        e.preventDefault(); redo(); return;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  // ── Mr. Merchiva chat → canvas action dispatch ────────────────────────────
  // The chat component sends one of: set | replace | append | delete actions.
  // We mutate the html state in place; this respects undo/redo because setHtml
  // pushes onto the undo stack.
  const htmlRef = useRef(html);
  htmlRef.current = html;

  const applyChatAction = useCallback(
    (action: { action: string; html?: string; selector?: string }) => {
      const kind = action.action;
      if (kind === "set" && typeof action.html === "string") {
        setHtml(prettyPrintHtml(action.html));
        return;
      }
      if (kind === "append" && typeof action.html === "string") {
        setHtml((cur) => prettyPrintHtml(`${cur}\n${action.html}`));
        return;
      }
      if (kind === "replace" && action.selector && typeof action.html === "string") {
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(
            `<!DOCTYPE html><html><body><div id="__merchiva_root">${htmlRef.current}</div></body></html>`,
            "text/html",
          );
          const root = doc.getElementById("__merchiva_root");
          const target = root?.querySelector(action.selector);
          if (root && target) {
            const wrapper = doc.createElement("div");
            wrapper.innerHTML = action.html;
            while (wrapper.firstChild) target.parentNode?.insertBefore(wrapper.firstChild, target);
            target.remove();
            setHtml(prettyPrintHtml(root.innerHTML));
          }
        } catch (err) {
          console.error("[design chat] replace failed:", err);
        }
        return;
      }
      if (kind === "delete" && action.selector) {
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(
            `<!DOCTYPE html><html><body><div id="__merchiva_root">${htmlRef.current}</div></body></html>`,
            "text/html",
          );
          const root = doc.getElementById("__merchiva_root");
          root?.querySelectorAll(action.selector).forEach((el) => el.remove());
          if (root) setHtml(prettyPrintHtml(root.innerHTML));
        } catch (err) {
          console.error("[design chat] delete failed:", err);
        }
        return;
      }
      console.warn("[design chat] unknown action:", kind);
    },
    [setHtml],
  );

  // ── Preset / size handling ────────────────────────────────────────────────
  const applyPreset = useCallback((p: DesignPreset) => {
    setDesign((cur) => ({ ...cur, width: p.width, height: p.height, preset: p.id }));
    setPresetMenu(false);
  }, []);

  const applyCustomSize = useCallback((w: number, h: number) => {
    if (!Number.isFinite(w) || !Number.isFinite(h)) return;
    const width = Math.max(50, Math.min(8000, Math.round(w)));
    const height = Math.max(50, Math.min(8000, Math.round(h)));
    setDesign((cur) => ({ ...cur, width, height, preset: null }));
  }, []);

  const commitName = useCallback(() => {
    const next = nameDraft.trim() || design.name;
    setDesign((cur) => ({ ...cur, name: next }));
    setNameEditing(false);
  }, [nameDraft, design.name]);

  const handlePaletteInsert = useCallback((snippet: string) => {
    setHtml((cur) => {
      try {
        const parser = new DOMParser();
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
        // Designs are flat — append at root level.
        root.appendChild(fragment);
        return prettyPrintHtml(root.innerHTML);
      } catch (err) {
        console.error("[design palette insert] failed:", err);
        return cur;
      }
    });
  }, [setHtml]);

  const presetGroups = useMemo(() => ({
    social: DESIGN_PRESETS.filter((p) => p.category === "social"),
    print: DESIGN_PRESETS.filter((p) => p.category === "print"),
    signage: DESIGN_PRESETS.filter((p) => p.category === "signage"),
  }), []);

  const currentPreset = findPreset(design.preset);

  // Persist 3-panel layout across reloads
  // Bumped suffix when the 3-panel layout became a 2-panel layout — old
  // stored layouts would misapply size constraints across the wrong ids.
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "merchiva-design-layout-v2",
    panelIds: ["design-canvas", "design-right"],
  });

  function formatSavedAt(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // ── Top toolbar ───────────────────────────────────────────────────────────
  const toolbar = (
    <div className="flex h-10 items-center border-b border-border bg-background text-foreground">
      <Link
        href="/~/design"
        className="flex h-10 w-10 shrink-0 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground border-r border-border"
      >
        <ArrowLeft className="h-4 w-4" />
      </Link>

      {/* Design name */}
      <div className="flex h-full items-center gap-2 px-3 border-r border-border min-w-0">
        <Palette className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        {nameEditing ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") { setNameDraft(design.name); setNameEditing(false); }
            }}
            className="h-7 rounded-[0.3rem] border border-border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring max-w-[220px]"
          />
        ) : (
          <button
            onClick={() => setNameEditing(true)}
            className="text-xs font-medium hover:bg-accent rounded-[0.3rem] px-2 py-1 max-w-[220px] truncate"
            title={design.name}
          >
            {design.name}
          </button>
        )}
      </div>

      {/* Size / preset picker */}
      <div className="relative h-full flex items-center px-2 border-r border-border">
        <button
          onClick={() => setPresetMenu((v) => !v)}
          className="inline-flex items-center gap-1.5 h-7 px-2 rounded-[0.3rem] text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <span className="font-mono">
            {currentPreset ? t(`design.preset.${currentPreset.labelKey}`) : `${design.width} × ${design.height}`}
          </span>
          <ChevronDown className="h-3 w-3" />
        </button>
        {presetMenu && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setPresetMenu(false)} />
            <div className="absolute left-2 top-9 z-40 w-64 rounded-[0.3rem] border border-border bg-background shadow-md p-1 max-h-[440px] overflow-y-auto">
              <PresetGroupHeader label={t("design.preset.groupSocial")} />
              {presetGroups.social.map((p) => (
                <PresetRow key={p.id} preset={p} active={design.preset === p.id} onClick={() => applyPreset(p)} t={t} />
              ))}
              <PresetGroupHeader label={t("design.preset.groupPrint")} />
              {presetGroups.print.map((p) => (
                <PresetRow key={p.id} preset={p} active={design.preset === p.id} onClick={() => applyPreset(p)} t={t} />
              ))}
              <PresetGroupHeader label={t("design.preset.groupSignage")} />
              {presetGroups.signage.map((p) => (
                <PresetRow key={p.id} preset={p} active={design.preset === p.id} onClick={() => applyPreset(p)} t={t} />
              ))}
              <PresetGroupHeader label={t("design.preset.groupCustom")} />
              <CustomSizeRow width={design.width} height={design.height} onApply={applyCustomSize} t={t} />
            </div>
          </>
        )}
      </div>

      <div className="flex-1" />

      {/* Right section: save status + undo/redo */}
      <div className="flex h-full shrink-0 items-center gap-1 border-l border-border px-2">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {saving ? (
            <><Spinner size={12} /><span>{t("design.editor.saving")}</span></>
          ) : savedAt ? (
            <><Check className="h-3 w-3 text-green-600" /><span>{t("design.editor.saved")} {formatSavedAt(savedAt)}</span></>
          ) : null}
        </div>

        <div className="h-4 w-px bg-border" />

        <button
          onClick={() => { hapticLight(); undo(); }}
          disabled={!canUndo}
          title="Undo"
          className="flex h-7 w-7 items-center justify-center rounded-[0.3rem] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          onClick={() => { hapticLight(); redo(); }}
          disabled={!canRedo}
          title="Redo"
          className="flex h-7 w-7 items-center justify-center rounded-[0.3rem] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
        >
          <Redo2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  // ── Canvas panel: palette + scaled fixed-size stage ───────────────────────
  const canvasPanel = (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      <HtmlElementPalette onInsert={handlePaletteInsert} hideItems={HIDE_PALETTE_ITEMS} />
      <div ref={stageRef} className="flex-1 min-h-0 relative overflow-auto bg-stone-200/70">
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-[0.3rem] border border-border bg-background px-1.5 py-1 shadow-sm">
          <button
            onClick={() => setZoom((z) => Math.max(0.1, z - 0.1))}
            className="h-6 w-6 rounded-[0.3rem] hover:bg-accent inline-flex items-center justify-center"
            title={t("design.editor.zoomOut")}
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="font-mono text-[10px] w-10 text-center text-muted-foreground">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
            className="h-6 w-6 rounded-[0.3rem] hover:bg-accent inline-flex items-center justify-center"
            title={t("design.editor.zoomIn")}
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => {
              const el = stageRef.current;
              if (!el) return;
              const padding = 48;
              const v = Math.min((el.clientWidth - padding) / design.width, (el.clientHeight - padding) / design.height, 1);
              setZoom(Math.max(0.1, Math.min(2, v)));
            }}
            className="h-6 w-6 rounded-[0.3rem] hover:bg-accent inline-flex items-center justify-center"
            title={t("design.editor.fit")}
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <div
          className="mx-auto my-6"
          style={{
            width: design.width * zoom,
            height: design.height * zoom,
            // Stop the browser from running its own pinch-to-zoom on the
            // iframe content — our wheel/touch handlers do the zoom and pan.
            touchAction: "pan-x pan-y",
          }}
        >
          <div
            className="relative shadow-md ring-1 ring-stone-300 bg-white origin-top-left"
            style={{ width: design.width, height: design.height, transform: `scale(${zoom})` }}
          >
            <HtmlCanvas
              html={html}
              selectedSelector={selected?.selector ?? null}
              onChange={setHtml}
              onSelect={setSelected}
              hideViewToolbar
            />
          </div>
        </div>
      </div>
    </div>
  );

  // ── Right panel: Properties / Mr. Merchiva tabs ───────────────────────────
  const rightSide = (
    <div className="flex h-full w-full flex-col border-l border-border bg-background">
      <div className="flex border-b border-border">
        <button
          className={cn(
            "flex-1 py-1.5 text-center text-[11px] font-medium transition-colors",
            rightPanel === "properties" ? "text-foreground border-b-2 border-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setRightPanel("properties")}
        >
          {t("design.editor.properties")}
        </button>
        <button
          className={cn(
            "flex-1 py-1.5 text-center text-[11px] font-medium transition-colors",
            rightPanel === "ai" ? "text-foreground border-b-2 border-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setRightPanel("ai")}
        >
          Mr. Merchiva
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        {rightPanel === "properties" ? (
          <HtmlPropertiesPanel selected={selected} html={html} onHtmlChange={setHtml} />
        ) : (
          <DesignMerchivaChat
            designId={design.id}
            designName={design.name}
            width={design.width}
            height={design.height}
            getHtml={() => htmlRef.current}
            onApply={applyChatAction}
          />
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      {toolbar}
      <ResizablePanelGroup
        orientation="horizontal"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
        className="flex-1 overflow-hidden"
      >
        <ResizablePanel id="design-canvas" defaultSize="72%" minSize="40%">
          {canvasPanel}
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel id="design-right" defaultSize="28%" minSize="18%" maxSize="55%">
          {rightSide}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

// ─── Preset menu rows ───────────────────────────────────────────────────────

function PresetGroupHeader({ label }: { label: string }) {
  return (
    <div className="px-2 pt-2 pb-1 text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
      {label}
    </div>
  );
}

function PresetRow({
  preset,
  active,
  onClick,
  t,
}: {
  preset: DesignPreset;
  active: boolean;
  onClick: () => void;
  t: (k: string) => string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-[0.3rem] text-xs hover:bg-accent text-left",
        active && "bg-accent",
      )}
    >
      <span className="truncate">{t(`design.preset.${preset.labelKey}`)}</span>
      <span className="font-mono text-[10px] text-muted-foreground shrink-0">
        {preset.width}×{preset.height}
      </span>
      {active && <Check className="h-3 w-3 shrink-0" />}
    </button>
  );
}

function CustomSizeRow({
  width,
  height,
  onApply,
  t,
}: {
  width: number;
  height: number;
  onApply: (w: number, h: number) => void;
  t: (k: string) => string;
}) {
  const [w, setW] = useState(String(width));
  const [h, setH] = useState(String(height));
  useEffect(() => { setW(String(width)); setH(String(height)); }, [width, height]);
  return (
    <div className="px-2 py-2 flex items-center gap-1.5">
      <input
        type="number" value={w} onChange={(e) => setW(e.target.value)}
        className="w-16 rounded-[0.3rem] border border-border bg-background px-2 py-1 text-xs font-mono outline-none focus:ring-1 focus:ring-ring"
        min={50} max={8000}
      />
      <span className="text-[10px] text-muted-foreground">×</span>
      <input
        type="number" value={h} onChange={(e) => setH(e.target.value)}
        className="w-16 rounded-[0.3rem] border border-border bg-background px-2 py-1 text-xs font-mono outline-none focus:ring-1 focus:ring-ring"
        min={50} max={8000}
      />
      <button
        onClick={() => onApply(Number(w), Number(h))}
        className="ml-auto h-6 px-2 rounded-[0.3rem] text-[11px] bg-foreground text-background hover:bg-foreground/90"
      >
        {t("design.preset.apply")}
      </button>
    </div>
  );
}
