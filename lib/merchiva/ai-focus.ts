"use client";

import { useSyncExternalStore } from "react";
import type { AiTarget } from "@/lib/merchiva/tool-targets";

/*
 * Where each Mr. Merchiva in this window is working right now. Every browser-shell tab has its
 * own conversation (components/merchiva-dock), so focus is keyed by the chat's session scope —
 * the tab id, or "__window__" outside the shell. The chat writes it as tool calls and actions
 * happen; the presence layer reads it to move "<name>'s Mr. Merchiva" and to publish that cursor
 * to the rest of the org.
 *
 * When a reply finishes the cursor stays where it last worked for LINGER_MS, then goes away. A
 * cursor still working after WATCHDOG_MS without a sign of life finishes the same way.
 */

export interface AiFocus {
  scope: string;
  route: string;
  anchor: string;
  /** Tool or action name, for the cursor's activity label. */
  tool: string;
  kind: "tool" | "action";
  /** True while the reply is still running; false during the linger after it finished. */
  working: boolean;
  /** Bumps on every move, so the cursor can play its click. */
  seq: number;
  at: number;
}

export const AI_FOCUS_LINGER_MS = 4000;

/**
 * A working cursor that hears nothing for this long (no move, no touchAiFocus) finishes on its own.
 * The chat finishes it when a reply ends; this is the backstop for a reply it never sees end — a
 * server run that was killed, a chat that went away — which would otherwise leave "<name>'s
 * Mr. Merchiva" working on a page for the whole org, re-published on every presence heartbeat.
 */
export const AI_FOCUS_WATCHDOG_MS = 120_000;

const listeners = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let focus: readonly AiFocus[] = [];

function emit(): void {
  for (const listener of Array.from(listeners)) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function cancelTimer(scope: string): void {
  const timer = timers.get(scope);
  if (timer !== undefined) clearTimeout(timer);
  timers.delete(scope);
}

/** A scope has one timer: the watchdog while it works, the linger once it finished. */
function armWatchdog(scope: string): void {
  cancelTimer(scope);
  timers.set(scope, setTimeout(() => finishAiFocus(scope), AI_FOCUS_WATCHDOG_MS));
}

/** Mr. Merchiva of `scope` is now working on `target` (a tool call or an action). */
export function setAiFocus(scope: string, target: AiTarget, tool: string, kind: AiFocus["kind"]): void {
  armWatchdog(scope);
  const prev = focus.find((f) => f.scope === scope);
  const next: AiFocus = {
    scope,
    route: target.route,
    anchor: target.anchor,
    tool,
    kind,
    working: true,
    seq: (prev?.seq ?? 0) + 1,
    at: Date.now(),
  };
  focus = [...focus.filter((f) => f.scope !== scope), next];
  emit();
}

/** The reply of `scope` is still coming in: a working cursor stays where it is and restarts its watchdog. */
export function touchAiFocus(scope: string): void {
  if (focus.some((f) => f.scope === scope && f.working)) armWatchdog(scope);
}

/** The reply of `scope` finished: keep the cursor where it is for a moment, then remove it. */
export function finishAiFocus(scope: string): void {
  const prev = focus.find((f) => f.scope === scope);
  if (!prev) return;
  cancelTimer(scope);
  if (prev.working) {
    focus = focus.map((f) => (f.scope === scope ? { ...f, working: false, at: Date.now() } : f));
    emit();
  }
  timers.set(scope, setTimeout(() => clearAiFocus(scope), AI_FOCUS_LINGER_MS));
}

export function clearAiFocus(scope: string): void {
  cancelTimer(scope);
  if (!focus.some((f) => f.scope === scope)) return;
  focus = focus.filter((f) => f.scope !== scope);
  emit();
}

export function getAiFocusSnapshot(): readonly AiFocus[] {
  return focus;
}

const EMPTY: readonly AiFocus[] = [];

/** Every Mr. Merchiva in this window that is working, or lingering after a reply. */
export function useAiFocus(): readonly AiFocus[] {
  return useSyncExternalStore(subscribe, getAiFocusSnapshot, () => EMPTY);
}
