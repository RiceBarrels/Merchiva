"use client";

/**
 * Header/footer content as static HTML, one string per active zone/variant.
 *
 * Every page draws its header and footer from these strings; only the box the member is editing hosts a real
 * editor. The HTML comes from our own schema serializer, so it is safe to inject — and because it is derived from
 * the same Y.XmlFragment the editor is bound to, typing in a header updates every other page as you go.
 *
 * The fragments are an external store (`useSyncExternalStore`), and re-serializing is debounced to one frame so a
 * burst of remote updates costs one pass.
 */
import { useMemo, useSyncExternalStore } from "react";
import type * as Y from "yjs";

import { headerFooterHtml } from "./header-footer-content";
import {
  activeVariants,
  headerFooterField,
  HEADER_FOOTER_ZONES,
  type HeaderFooterOptions,
  type HeaderFooterVariant,
  type HeaderFooterZone,
} from "./header-footer";

/** Keyed by `headerFooterField(zone, variant)`; a missing key means that box is empty. */
export type HeaderFooterHtml = Readonly<Record<string, string>>;

const EMPTY: HeaderFooterHtml = Object.freeze({});

interface Box {
  readonly zone: HeaderFooterZone;
  readonly variant: HeaderFooterVariant;
  readonly field: string;
}

function readAll(ydoc: Y.Doc, boxes: readonly Box[]): HeaderFooterHtml {
  const next: Record<string, string> = {};
  for (const box of boxes) {
    const value = headerFooterHtml(ydoc, box.zone, box.variant);
    if (value) next[box.field] = value;
  }
  return next;
}

function same(a: HeaderFooterHtml, b: HeaderFooterHtml): boolean {
  const keys = Object.keys(b);
  return keys.length === Object.keys(a).length && keys.every((key) => a[key] === b[key]);
}

interface HeaderFooterStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): HeaderFooterHtml;
}

function createStore(ydoc: Y.Doc | null, boxes: readonly Box[]): HeaderFooterStore {
  let snapshot = ydoc ? readAll(ydoc, boxes) : EMPTY;
  const listeners = new Set<() => void>();
  let frame = 0;

  const read = () => {
    frame = 0;
    if (!ydoc) return;
    const next = readAll(ydoc, boxes);
    if (same(snapshot, next)) return;
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(read);
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      const detach = (ydoc ? boxes : []).map((box) => {
        const fragment = (ydoc as Y.Doc).getXmlFragment(box.field);
        fragment.observeDeep(schedule);
        return () => fragment.unobserveDeep(schedule);
      });
      return () => {
        listeners.delete(listener);
        for (const off of detach) off();
        if (listeners.size === 0 && frame) {
          cancelAnimationFrame(frame);
          frame = 0;
        }
      };
    },
    getSnapshot: () => snapshot,
  };
}

export function useHeaderFooterHtml(ydoc: Y.Doc | null, options: HeaderFooterOptions): HeaderFooterHtml {
  const { differentFirstPage, differentOddEven } = options;
  const boxes = useMemo<Box[]>(() => {
    const variants = activeVariants({ differentFirstPage, differentOddEven });
    const out: Box[] = [];
    for (const zone of HEADER_FOOTER_ZONES) {
      for (const variant of variants) out.push({ zone, variant, field: headerFooterField(zone, variant) });
    }
    return out;
  }, [differentFirstPage, differentOddEven]);

  const store = useMemo(() => createStore(ydoc, boxes), [ydoc, boxes]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => EMPTY);
}
