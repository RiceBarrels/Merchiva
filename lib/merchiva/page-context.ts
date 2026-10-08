"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useTabSlotId } from "@/lib/browser-shell";

/*
 * What the page in each browser-shell tab is showing, so Mr. Merchiva can answer about "this week",
 * "this person" or "this item" without asking. A page describes itself with useMerchivaPageContext;
 * the chat of the same tab reads it when a message is sent.
 *
 * Keyed like the dock's conversations: the keep-alive slot's tab id, or "__window__" outside the
 * browser shell. A hidden (background) tab's effects are cleaned up by <Activity>, so its context
 * is cleared while hidden and published again when the tab is shown.
 */

export const WINDOW_PAGE_SCOPE = "__window__";

export type PageContextValue = string | number | boolean | null;

export interface MerchivaPageContext {
  /** One short English sentence for the model: what the user is looking at right now. */
  summary: string;
  /** Facts worth acting on — the visible week, the open record's id and name, active filters. */
  params?: Record<string, PageContextValue>;
}

const MAX_SUMMARY = 300;
const MAX_PARAMS = 12;
const MAX_VALUE = 120;

const listeners = new Set<() => void>();
let contexts: ReadonlyMap<string, MerchivaPageContext> = new Map();

function emit(): void {
  for (const listener of Array.from(listeners)) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Trims a context to what is sent to the server: short summary, at most 12 scalar params. */
export function sanitizePageContext(input: MerchivaPageContext): MerchivaPageContext | null {
  const summary = input.summary.replace(/\s+/g, " ").trim().slice(0, MAX_SUMMARY);
  const params: Record<string, PageContextValue> = {};
  let n = 0;
  for (const [key, value] of Object.entries(input.params ?? {})) {
    if (n >= MAX_PARAMS) break;
    if (!/^[A-Za-z][\w-]{0,40}$/.test(key)) continue;
    if (typeof value === "string") {
      const trimmed = value.replace(/\s+/g, " ").trim();
      if (!trimmed) continue;
      params[key] = trimmed.slice(0, MAX_VALUE);
    } else if (typeof value === "number") {
      if (!Number.isFinite(value)) continue;
      params[key] = value;
    } else if (typeof value === "boolean" || value === null) {
      params[key] = value;
    } else {
      continue;
    }
    n++;
  }
  if (!summary && n === 0) return null;
  return n > 0 ? { summary, params } : { summary };
}

function sameContext(a: MerchivaPageContext | undefined, b: MerchivaPageContext): boolean {
  return !!a && JSON.stringify(a) === JSON.stringify(b);
}

export function setPageContext(scope: string, context: MerchivaPageContext): void {
  const clean = sanitizePageContext(context);
  if (!clean) {
    clearPageContext(scope);
    return;
  }
  if (sameContext(contexts.get(scope), clean)) return;
  const next = new Map(contexts);
  next.set(scope, clean);
  contexts = next;
  emit();
}

export function clearPageContext(scope: string): void {
  if (!contexts.has(scope)) return;
  const next = new Map(contexts);
  next.delete(scope);
  contexts = next;
  emit();
}

/** The context the page in `scope` published, read at send time. */
export function getPageContext(scope: string): MerchivaPageContext | null {
  return contexts.get(scope) ?? null;
}

const EMPTY: ReadonlyMap<string, MerchivaPageContext> = new Map();

/** Every published page context, for components that render it (e.g. a "sees: …" hint). */
export function usePageContexts(): ReadonlyMap<string, MerchivaPageContext> {
  return useSyncExternalStore(subscribe, () => contexts, () => EMPTY);
}

/**
 * Tells Mr. Merchiva what this page is showing. Call it from the page (or the component that owns
 * the state) with values that change as the user moves around; it re-publishes when they change
 * and clears when the page unmounts or its tab goes to the background.
 */
export function useMerchivaPageContext(context: MerchivaPageContext | null): void {
  const slot = useTabSlotId();
  const scope = slot ?? WINDOW_PAGE_SCOPE;
  const key = context ? JSON.stringify(context) : "";
  useEffect(() => {
    if (!key) return;
    setPageContext(scope, JSON.parse(key) as MerchivaPageContext);
    return () => clearPageContext(scope);
  }, [scope, key]);
}
