"use client";

// Whether a person is at this document: it is visible, it has focus, and it was
// used (pointer, keys, wheel, touch) within ATTENTION_IDLE_MS. Visibility alone
// is not attention: a desktop browser reports an unfocused window, or one on a
// second monitor, as visible, and a PC left on a page stays visible and focused
// until its screen locks. Reading a notification row there would cancel its
// push and its email (read before the email ⇒ no email), so the dots clear, and
// an alert is a toast rather than an OS notification, only while attended.
//
// AttentionTracker is the rule without the DOM (scripts/tests/notify/client-attention.test.ts);
// useDocumentAttended / documentAttended run one tracker for the page.

import { useSyncExternalStore } from "react";

/** No input for this long and the document is unattended. */
export const ATTENTION_IDLE_MS = 3 * 60_000;
/** Pointer moves count at most this often. */
const MOVE_THROTTLE_MS = 1000;

export interface AttentionEnv {
  now(): number;
  visible(): boolean;
  /** document.hasFocus(): true while focus is in this document or a frame inside it. */
  hasFocus(): boolean;
}

/** The attention rule over an environment. */
export class AttentionTracker {
  private lastInputAt: number;
  private pressedAt = Number.NEGATIVE_INFINITY;
  private blurredAt = Number.NEGATIVE_INFINITY;
  private attended: boolean;

  constructor(
    private readonly env: AttentionEnv,
    private readonly idleMs = ATTENTION_IDLE_MS,
  ) {
    // Opening the page is someone's doing.
    this.lastInputAt = env.now();
    this.attended = this.compute();
  }

  get value(): boolean {
    return this.attended;
  }

  /** Someone used the page. A press (pointer down, key, touch) also proves focus where hasFocus lags. */
  input(press = false): void {
    const now = this.env.now();
    this.lastInputAt = now;
    if (press) this.pressedAt = now;
  }

  /** The window lost focus (checked after the event: focus moving into a frame keeps it). */
  blur(): void {
    if (!this.env.hasFocus()) this.blurredAt = this.env.now();
  }

  /** Recomputes; true when the answer changed. */
  refresh(): boolean {
    const next = this.compute();
    const changed = next !== this.attended;
    this.attended = next;
    return changed;
  }

  /** How long until an attended document turns idle; Infinity when it is not attended. */
  msUntilIdle(): number {
    return this.attended ? Math.max(0, this.lastInputAt + this.idleMs - this.env.now()) : Number.POSITIVE_INFINITY;
  }

  private compute(): boolean {
    const focused = this.env.hasFocus() || this.pressedAt > this.blurredAt;
    return this.env.visible() && focused && this.env.now() - this.lastInputAt < this.idleMs;
  }
}

let tracker: AttentionTracker | null = null;
const listeners = new Set<() => void>();
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let lastMoveAt = 0;

function ensureTracker(): AttentionTracker {
  tracker ??= new AttentionTracker({
    now: () => Date.now(),
    visible: () => document.visibilityState === "visible",
    hasFocus: () => document.hasFocus(),
  });
  return tracker;
}

function update(): void {
  const t = ensureTracker();
  if (t.refresh()) for (const listener of listeners) listener();
  // One timer at a time: input only pushes the deadline later, so a timer that fires
  // early just re-arms for the rest.
  if (idleTimer === null && Number.isFinite(t.msUntilIdle())) {
    idleTimer = setTimeout(() => {
      idleTimer = null;
      update();
    }, t.msUntilIdle() + 50);
  }
}

function onPress(): void {
  ensureTracker().input(true);
  update();
}

function onActivity(event: Event): void {
  if (event.type === "pointermove") {
    const now = Date.now();
    if (now - lastMoveAt < MOVE_THROTTLE_MS) return;
    lastMoveAt = now;
  }
  ensureTracker().input();
  update();
}

function onFocus(): void {
  ensureTracker().input();
  update();
}

function onBlur(): void {
  // hasFocus() settles after the event when focus moves into a frame.
  setTimeout(() => {
    ensureTracker().blur();
    update();
  }, 0);
}

function onVisibility(): void {
  if (document.visibilityState === "visible") ensureTracker().input();
  update();
}

const PRESS_EVENTS = ["pointerdown", "keydown", "touchstart"] as const;
const ACTIVITY_EVENTS = ["pointermove", "wheel"] as const;
const LISTEN = { capture: true, passive: true } as const;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    for (const type of PRESS_EVENTS) window.addEventListener(type, onPress, LISTEN);
    for (const type of ACTIVITY_EVENTS) window.addEventListener(type, onActivity, LISTEN);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    update();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    for (const type of PRESS_EVENTS) window.removeEventListener(type, onPress, LISTEN);
    for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, onActivity, LISTEN);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("visibilitychange", onVisibility);
    if (idleTimer !== null) clearTimeout(idleTimer);
    idleTimer = null;
  };
}

/** Whether someone is at this document right now (for callbacks; components use useDocumentAttended). */
export function documentAttended(): boolean {
  if (typeof document === "undefined") return false;
  update();
  return ensureTracker().value;
}

/** Whether someone is at this document: visible, focused and used within ATTENTION_IDLE_MS. */
export function useDocumentAttended(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => ensureTracker().value,
    () => false,
  );
}
