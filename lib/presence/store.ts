"use client";

import { useSyncExternalStore } from "react";
import { clockOffsetMs, viewersSignature, type NavViewer } from "./rows";

/*
 * State the one <PresenceLayer/> (app/manager/layout.tsx) shares with the nav badges it is not an
 * ancestor of — sidebar rows, the mobile Apps list. The layer owns the page_presence subscription;
 * the badges only read what it publishes here, so there is one subscription however many rows.
 */

type Listener = () => void;

function createSignal() {
  const listeners = new Set<Listener>();
  return {
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit(): void {
      for (const listener of Array.from(listeners)) listener();
    },
  };
}

// ─── Nav viewers ─────────────────────────────────────────────────────────────

const EMPTY: readonly NavViewer[] = Object.freeze([]);
const viewersSignal = createSignal();
let viewers: readonly NavViewer[] = EMPTY;
let signature = "";

/** Replaces who is on which nav row; identical content keeps the old snapshot (no re-render). */
export function publishNavViewers(next: readonly NavViewer[]): void {
  const nextSignature = viewersSignature(next);
  if (nextSignature === signature) return;
  signature = nextSignature;
  viewers = next.length === 0 ? EMPTY : next;
  viewersSignal.emit();
}

function getViewers(): readonly NavViewer[] {
  return viewers;
}

function getServerViewers(): readonly NavViewer[] {
  return EMPTY;
}

export function useNavViewers(): readonly NavViewer[] {
  return useSyncExternalStore(viewersSignal.subscribe, getViewers, getServerViewers);
}

// ─── Server clock ────────────────────────────────────────────────────────────

/** Offsets closer than this to the current one are latency jitter, not skew. */
const OFFSET_JITTER_MS = 1000;
const clockSignal = createSignal();
let offsetMs = 0;

/**
 * Records a stamp the server wrote for this window's own row just now: the difference to the local
 * clock is the skew that `useServerClockOffset` corrects row ages with.
 */
export function noteServerStamp(serverStampMs: number): void {
  const next = clockOffsetMs(serverStampMs, Date.now());
  if (!Number.isFinite(next) || Math.abs(next - offsetMs) < OFFSET_JITTER_MS) return;
  offsetMs = next;
  clockSignal.emit();
}

function getOffset(): number {
  return offsetMs;
}

function getServerOffset(): number {
  return 0;
}

/** Server clock minus local clock, in ms (0 until this window has seen its own row). */
export function useServerClockOffset(): number {
  return useSyncExternalStore(clockSignal.subscribe, getOffset, getServerOffset);
}
