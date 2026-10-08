"use client";

// Keyboard and clipboard for the Slides editor (slides.md §6.3, §7.2): one keydown, copy, cut and paste listener
// on the editor root (not a window capture listener, so other tabs and the shell keep their keys). The map itself
// is lib/slides/editor/keys.ts.
//
// Nothing here runs while a slide text box is being typed in, during an IME composition, or while focus is in any
// other text field (the stage's hidden keyboard target is the exception: it IS the stage). With one text box
// selected, a printable key or the first key of a composition moves focus into that box's pre-mounted editor during
// keydown and is NOT prevented, so the browser delivers the character or starts the composition there.
//
// Where the key comes from decides what it may do:
// - the stage (its hidden keyboard target, its viewport) or the editor root itself: every command;
// - the slide rail, which marks itself with SLIDES_RAIL_ATTR: Delete, Mod+D, Mod+A, Mod+C/X/V and Mod+↑/↓ act on
//   slides, and the arrows, Enter, Space and Tab are left to the rail;
// - anything else, e.g. a toolbar button, a menubar trigger or a line end handle reached with the keyboard: only the
//   Mod-chord globals (undo, redo, present, Ctrl+M). Enter, Space, Tab, the arrows, Delete and Escape stay with the
//   focused control, so it can be activated, left with Tab and navigated.
import { useEffect, useEffectEvent, type RefObject } from "react";

import { STAGE_KEYS_ATTR, STAGE_VIEWPORT_ATTR } from "@/components/slides/canvas/stage";
import { useSlidesEditor, type SlidesEditorContextValue } from "@/components/slides/editor/slides-context";
import { isTextCapable } from "@/lib/slides/editor/elements";
import { isApplePlatform, slidesKeyCommand, type SlidesKeyCommand } from "@/lib/slides/editor/keys";

/** Put on the slide rail's root: keys pressed inside it act on slides. */
export const SLIDES_RAIL_ATTR = "data-slides-rail";

/** Commands that act on the deck wherever focus is inside the editor: no focused control uses these chords. */
const GLOBAL_COMMANDS: ReadonlySet<SlidesKeyCommand["kind"]> = new Set(["undo", "redo", "present", "newSlide"]);

/** A text field the key belongs to (not the stage's own keyboard target). */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.hasAttribute(STAGE_KEYS_ATTR)) return false;
  if (target.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']")) return true;
  return false;
}

function inRail(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(`[${SLIDES_RAIL_ATTR}]`) !== null;
}

/**
 * The stage's own key targets: its hidden keyboard target, the editor root, and the viewport itself (a focusable
 * scroller). Controls inside the viewport (line end handles) are not.
 */
function isStageTarget(target: EventTarget | null, root: HTMLElement): boolean {
  if (!(target instanceof Element)) return false;
  return target === root || target.hasAttribute(STAGE_KEYS_ATTR) || target.hasAttribute(STAGE_VIEWPORT_ATTR);
}

/** The one selected element that typing goes into, if its editor is mounted. */
function textHandle(ctx: SlidesEditorContextValue) {
  const { ui, deck, refs } = ctx;
  if (ui.selection.length !== 1 || !ctx.canEditNow || deck.schemaTooNew) return null;
  const id = ui.selection[0];
  const slide = ui.currentSlideId ? deck.slides.get(ui.currentSlideId) : undefined;
  const el = slide?.elements.find((e) => e.id === id);
  const handle = refs.textEditor.current;
  return el && isTextCapable(el) && !el.locked && handle?.target === id ? handle : null;
}

function currentIndex(ctx: SlidesEditorContextValue): number {
  return ctx.ui.currentSlideId ? ctx.deck.slideIds.indexOf(ctx.ui.currentSlideId) : -1;
}

/** Runs `cmd`; true when it was handled (the caller then prevents the default). */
function runCommand(cmd: SlidesKeyCommand, ctx: SlidesEditorContextValue, rail: boolean): boolean {
  const { ui, deck, dispatch, el, actions, undo } = ctx;
  const slide = ui.currentSlideId ? deck.slides.get(ui.currentSlideId) : undefined;
  const hasSelection = ui.selection.length > 0;
  switch (cmd.kind) {
    case "undo":
      undo.undo();
      return true;
    case "redo":
      undo.redo();
      return true;
    case "duplicate":
      if (rail || !hasSelection) el.duplicateSlides();
      else el.duplicateSelection();
      return true;
    case "delete":
      if (rail) el.deleteSlides();
      else if (hasSelection) el.deleteSelection();
      else return false;
      return true;
    case "selectAll":
      if (rail) dispatch({ type: "selectSlides", slideIds: deck.slideIds, current: ui.currentSlideId ?? undefined });
      else dispatch({ type: "select", ids: slide?.elements.map((e) => e.id) ?? [] });
      return true;
    case "edit": {
      const handle = rail ? null : textHandle(ctx);
      if (!handle) return false;
      handle.enterEditing({ caret: "all" });
      return true;
    }
    case "escape":
      if (!hasSelection) return false;
      dispatch({ type: "select", ids: [] });
      return true;
    case "cycle": {
      const ids = slide?.elements.map((e) => e.id) ?? [];
      if (rail || !hasSelection || ids.length === 0) return false;
      const at = ids.indexOf(ui.selection[ui.selection.length - 1]);
      dispatch({ type: "select", ids: [ids[(at + cmd.dir + ids.length) % ids.length]] });
      return true;
    }
    case "nudge":
      if (rail || !hasSelection) return false;
      el.nudge(cmd.dx, cmd.dy);
      return true;
    case "newSlide":
      el.addSlide();
      return true;
    case "slide": {
      const next = deck.slideIds[currentIndex(ctx) + cmd.dir];
      if (next) dispatch({ type: "selectSlide", slideId: next });
      return true;
    }
    case "present":
      actions.present(cmd.fromStart ? "start" : "current");
      return true;
    case "arrange":
      if (!hasSelection) return false;
      el.arrange(cmd.op);
      return true;
    case "moveSlides": {
      const picked = new Set(ui.slideSelection.length > 0 ? ui.slideSelection : ui.currentSlideId ? [ui.currentSlideId] : []);
      const order = deck.slideIds;
      const positions = order.flatMap((id, i) => (picked.has(id) ? [i] : []));
      if (positions.length === 0) return true;
      if (cmd.dir < 0) {
        const first = positions[0];
        if (first > 0) el.moveSlides([...picked], order[first - 1]);
      } else {
        const last = positions[positions.length - 1];
        if (last < order.length - 1) el.moveSlides([...picked], order[last + 2] ?? null);
      }
      return true;
    }
    case "type": {
      const handle = rail ? null : textHandle(ctx);
      // Focus moves now; the key itself is NOT prevented, so its character or composition lands in the editor.
      handle?.enterEditing({ caret: "end" });
      return false;
    }
  }
}

export function useSlidesShortcuts(rootRef: RefObject<HTMLElement | null>): void {
  const ctx = useSlidesEditor();

  const onKeyDown = useEffectEvent((event: KeyboardEvent, root: HTMLElement) => {
    if (event.defaultPrevented || event.isComposing || ctx.ui.editing !== null || isTypingTarget(event.target)) return;
    const rail = inRail(event.target);
    const cmd = slidesKeyCommand(event, { isMac: isApplePlatform(typeof navigator === "undefined" ? undefined : navigator), inRail: rail });
    if (!cmd) return;
    if (!rail && !isStageTarget(event.target, root) && !GLOBAL_COMMANDS.has(cmd.kind)) return;
    const writes = cmd.kind !== "selectAll" && cmd.kind !== "escape" && cmd.kind !== "cycle" && cmd.kind !== "slide" && cmd.kind !== "present" && cmd.kind !== "type" && cmd.kind !== "edit";
    if (writes && (!ctx.canEditNow || ctx.deck.schemaTooNew)) return;
    if (runCommand(cmd, ctx, rail)) event.preventDefault();
  });

  const onClipboard = useEffectEvent((event: ClipboardEvent) => {
    if (event.defaultPrevented || ctx.ui.editing !== null || isTypingTarget(event.target)) return;
    const rail = inRail(event.target);
    if (!rail && ctx.ui.selection.length === 0 && event.type !== "paste") return;
    if (event.type === "copy") ctx.el.copy(event);
    else if (event.type === "cut") ctx.el.cut(event);
    else void ctx.el.paste(event);
  });

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const keydown = (event: KeyboardEvent) => onKeyDown(event, root);
    const clipboard = (event: ClipboardEvent) => onClipboard(event);
    root.addEventListener("keydown", keydown);
    root.addEventListener("copy", clipboard);
    root.addEventListener("cut", clipboard);
    root.addEventListener("paste", clipboard);
    return () => {
      root.removeEventListener("keydown", keydown);
      root.removeEventListener("copy", clipboard);
      root.removeEventListener("cut", clipboard);
      root.removeEventListener("paste", clipboard);
    };
  }, [rootRef]);
}
