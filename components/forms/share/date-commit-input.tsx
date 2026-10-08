"use client";

// A `<input type="date">` that saves only a finished date. Typing a date with the keyboard fires onChange as soon
// as every segment holds a value, so "10/05/2" is already the value 0002-10-05: saving on every change would store a
// partial year, and disabling the field while that save runs would throw the person out of it mid-entry. This one
// keeps its own text while focused and commits on blur, on Enter, or after a pause on a plausible date; it is never
// disabled by a save in flight.

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { isValidDateKey } from "@/lib/forms/limits";

/** Years a person can mean here: a close or due date is never before 2000 or past 2999. */
const MIN_YEAR = 2000;
const MAX_YEAR = 2999;
/** A pause this long on a plausible date commits it, so picking from the calendar saves without a blur. */
const SETTLE_MS = 1_200;

/** The value to save for what the field holds: '' (cleared), a plausible `YYYY-MM-DD`, or null (not finished). */
export function committableDateKey(value: string): string | null {
  if (value === "") return "";
  if (!isValidDateKey(value)) return null;
  const year = Number(value.slice(0, 4));
  return year >= MIN_YEAR && year <= MAX_YEAR ? value : null;
}

export interface DateCommitInputProps {
  /** The saved `YYYY-MM-DD`, or '' for none. */
  value: string;
  /** Called with a finished date or '' once, when it differs from `value`. */
  onCommit: (value: string) => void;
  id?: string;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
  title?: string;
}

export function DateCommitInput({ value, onCommit, id, className, disabled, title, ...aria }: DateCommitInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The last value handed to onCommit during this focus, so a pause and then a blur never save it twice.
  const sent = useRef<string | null>(null);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clearTimer, []);

  const commit = (text: string | null) => {
    clearTimer();
    if (text === null) return;
    const next = committableDateKey(text);
    if (next === null || next === value || next === sent.current) return;
    sent.current = next;
    onCommit(next);
  };

  return (
    <Input
      id={id}
      type="date"
      className={className}
      disabled={disabled}
      title={title}
      aria-label={aria["aria-label"]}
      value={draft ?? value}
      onFocus={() => { sent.current = null; }}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        clearTimer();
        if (committableDateKey(text) !== null) timer.current = setTimeout(() => commit(text), SETTLE_MS);
      }}
      onBlur={() => {
        commit(draft);
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit(draft);
      }}
    />
  );
}
