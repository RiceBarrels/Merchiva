"use client";

import { useCallback, useState, type MouseEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { RESULT_HINT_CLASS, RESULT_ROW_CLASS, RESULT_SECONDARY_CLASS } from "./chrome-classes";

/*
 * Listbox pieces shared by the omnibox and tab search. Both follow the WAI-ARIA 1.2
 * combobox pattern: focus stays in the text input, `aria-activedescendant` names the
 * highlighted option, rows never take focus (mousedown is prevented).
 */

export function optionDomId(listId: string, index: number): string {
  return `${listId}-option-${index}`;
}

/** Highlighted row index, clamped to `count` at render time. -1 when the list is empty. */
export function useResultNavigation(count: number): {
  index: number;
  setIndex(index: number): void;
  move(delta: 1 | -1): void;
  reset(): void;
} {
  const [raw, setRaw] = useState(0);
  const index = count === 0 ? -1 : Math.min(Math.max(raw, 0), count - 1);

  const move = useCallback(
    (delta: 1 | -1) => {
      if (count === 0) return;
      setRaw((prev) => {
        const current = Math.min(Math.max(prev, 0), count - 1);
        return (current + delta + count) % count;
      });
    },
    [count],
  );
  const setIndex = useCallback((next: number) => setRaw(next), []);
  const reset = useCallback(() => setRaw(0), []);

  return { index, setIndex, move, reset };
}

/** Scrolls the highlighted option into view (call from the key handler after moving). */
export function scrollOptionIntoView(listId: string, index: number): void {
  if (index < 0) return;
  window.requestAnimationFrame(() => {
    document.getElementById(optionDomId(listId, index))?.scrollIntoView({ block: "nearest" });
  });
}

export function ResultGroupLabel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div
      id={id}
      role="presentation"
      className="px-2.5 pt-2 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
    >
      {children}
    </div>
  );
}

export interface ResultRowProps {
  id: string;
  highlighted: boolean;
  icon: ReactNode;
  title: ReactNode;
  secondary?: ReactNode;
  hint?: ReactNode;
  trailing?: ReactNode;
  onHover(): void;
  onSelect(event: MouseEvent<HTMLDivElement>): void;
  /** Middle click. */
  onAuxSelect?(event: MouseEvent<HTMLDivElement>): void;
  className?: string;
}

export function ResultRow({
  id,
  highlighted,
  icon,
  title,
  secondary,
  hint,
  trailing,
  onHover,
  onSelect,
  onAuxSelect,
  className,
}: ResultRowProps) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={highlighted}
      data-highlighted={highlighted ? "" : undefined}
      className={cn(RESULT_ROW_CLASS, "group/result", className)}
      onMouseMove={highlighted ? undefined : onHover}
      onMouseDown={(event) => {
        // Keep focus in the input so the combobox stays open.
        event.preventDefault();
      }}
      onClick={onSelect}
      onAuxClick={(event) => {
        if (event.button !== 1 || !onAuxSelect) return;
        event.preventDefault();
        onAuxSelect(event);
      }}
    >
      <span className="flex size-4 shrink-0 items-center justify-center" aria-hidden>
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="min-w-0 truncate">{title}</span>
        {secondary ? (
          <span dir="ltr" className={RESULT_SECONDARY_CLASS}>
            {secondary}
          </span>
        ) : null}
      </span>
      {hint ? <span className={RESULT_HINT_CLASS}>{hint}</span> : null}
      {trailing}
    </div>
  );
}
