"use client";

// Rubber-band selection on the Drive grid (desktop, fine pointer): drag on the empty space
// between cards to select every card the band touches; with Shift, Ctrl or Cmd held the band
// adds to the selection. A click on the empty space clears it. Drags that start on a card, a
// button, a link or a field are left alone (they open, move or edit).
//
// EntryGrid loads this with next/dynamic (ssr: false) and renders it next to the cards, so the
// grid never waits for the chunk. The container comes from the grid's callback ref held in
// state, so nothing here or there reads a ref during render (react-hooks/refs). Selectable
// elements are looked up inside that container only: other browser-shell tabs keep their own
// Drive grids mounted. Modifier keys are read from the pointer event, so no key listener is
// added to the window.

import { useCallback, useMemo } from "react";
import Selecto, { type OnSelectEnd } from "react-selecto";
import type { DriveSelection } from "./use-selection";

/** Where a band may not start: entries and anything interactive. */
const NO_BAND_START = "[data-drive-entry],a,button,input,label,textarea,select,[role=checkbox],[role=menu],[role=menuitem]";

function modifierHeld(input: unknown): boolean {
  return (
    typeof input === "object" &&
    input !== null &&
    (("shiftKey" in input && input.shiftKey === true) ||
      ("ctrlKey" in input && input.ctrlKey === true) ||
      ("metaKey" in input && input.metaKey === true))
  );
}

function startsOnSomething(input: unknown): boolean {
  const target = typeof input === "object" && input !== null && "target" in input ? input.target : null;
  return target instanceof Element && target.closest(NO_BAND_START) !== null;
}

function entryKeys(elements: ReadonlyArray<Element>): string[] {
  return elements.flatMap((element) => {
    const key = element.getAttribute("data-drive-entry");
    return key ? [key] : [];
  });
}

export interface DriveMarqueeProps {
  /** The grid element the band is drawn in and its cards are looked up in. */
  container: HTMLElement;
  selection: DriveSelection;
}

export function DriveMarquee({ container, selection }: DriveMarqueeProps) {
  const selectable = useMemo(() => [() => Array.from(container.querySelectorAll<HTMLElement>("[data-drive-entry]"))], [container]);
  const dragCondition = useCallback((event: { inputEvent: unknown }) => !startsOnSomething(event.inputEvent), []);
  const onSelectEnd = useCallback(
    (event: OnSelectEnd) => {
      const additive = modifierHeld(event.inputEvent);
      if (event.isClick) {
        if (!additive) selection.clear();
        return;
      }
      const keys = entryKeys(event.selected);
      selection.set(additive ? [...selection.keys, ...keys] : keys);
    },
    [selection],
  );

  return (
    <Selecto
      dragContainer={container}
      selectableTargets={selectable}
      selectByClick={false}
      selectFromInside={false}
      hitRate={0}
      className="border-foreground/50! bg-foreground/10!"
      dragCondition={dragCondition}
      onSelectEnd={onSelectEnd}
    />
  );
}
