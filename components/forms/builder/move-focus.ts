"use client";

// Keeps keyboard focus on a "Move up" / "Move down" button after the row it moves is reordered. React moves a
// keyed row's DOM node when it goes down, which drops focus to <body>; this puts it back on the same row's button
// (or its other move button once the row reaches the end, where the pressed one turns disabled).

import { useLayoutEffect, useRef } from "react";

export type MoveDirection = "up" | "down";

/** Props for one move button: `data-*` attributes the hook finds it by. */
export function moveButtonProps(rowId: string, dir: MoveDirection): Record<string, string> {
  return { "data-move-row": rowId, "data-move-dir": dir };
}

export function useMoveFocus<T extends HTMLElement>() {
  const root = useRef<T>(null);
  const pending = useRef<{ rowId: string; dir: MoveDirection } | null>(null);

  useLayoutEffect(() => {
    const move = pending.current;
    const container = root.current;
    if (!move || !container) return;
    pending.current = null;
    const find = (dir: MoveDirection) => container.querySelector<HTMLButtonElement>(
      `[data-move-row="${CSS.escape(move.rowId)}"][data-move-dir="${dir}"]`,
    );
    const same = find(move.dir);
    const target = same && !same.disabled ? same : find(move.dir === "up" ? "down" : "up");
    if (target && document.activeElement !== target) target.focus();
  });

  /** Call with the row and direction just before applying the move. */
  const moved = (rowId: string, dir: MoveDirection) => {
    pending.current = { rowId, dir };
  };
  return { root, moved };
}
