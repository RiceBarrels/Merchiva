"use client";

// Whether the person using this screen has acknowledged the management-visibility notice on this
// surface, and how to acknowledge it (components/drive/notice/notice-ack-state.ts has the rules).
//
// Reads only the thin `drive_notice_ack` subscription (useDriveNoticeAckRows), so Docs home and
// the editors can gate without mounting all of Drive. acknowledge() stores a local copy first —
// the gate lifts at once, even offline or before the module has Drive — then records it on the
// server as the actor (the operator on /store). While the server row is missing, one retry loop
// per member, notice and surface re-sends it (every mounted consumer shares it).

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { usePermissions } from "@/lib/context/permissions";
import { mapDriveNoticeAck } from "@/lib/drive/mappers";
import type { DriveSurface } from "@/lib/drive/types";
import { acknowledgeDriveNotice } from "@/lib/spacetimedb/actions/drive";
import { useDriveNoticeAckRows } from "@/lib/spacetimedb/hooks";
import { useDriveBackendStatus } from "@/lib/spacetimedb/hooks/useDrive";
import { useDriveActorIds, useScopedTableReady } from "../drive-actor";
import { noticeAckState, noticeLocalKey, startAckRetryLoop, type AckRetryScheduler, type NoticeAckRow } from "./notice-ack-state";

export interface ManagementNoticeAck {
  /** needsAck can be trusted (the member and their acknowledgements are known). */
  ready: boolean;
  /** Block uploads and creates, and show the notice. */
  needsAck: boolean;
  /** Records the acknowledgement: locally at once, then on the server. Never rejects. */
  acknowledge(): Promise<void>;
  /** Who and where the answer is for (org, member, surface: noticeLocalKey); null while unknown. */
  scope: string | null;
}

// ── Local acknowledgements ───────────────────────────────────────────────────

// Keys acknowledged in this tab: the gate lifts even when localStorage is blocked (private window).
const memoryAcks = new Set<string>();
const listeners = new Set<() => void>();

function readLocalAck(key: string | null): boolean {
  if (key === null) return false;
  if (memoryAcks.has(key)) return true;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeLocalAck(key: string): void {
  memoryAcks.add(key);
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Storage blocked or full: the in-memory copy covers this tab, the server row every other one.
  }
  for (const listener of [...listeners]) listener();
}

function subscribeLocalAcks(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith("merchiva_drive_notice:")) onChange();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

// ── Server write retries ─────────────────────────────────────────────────────

const TIMERS: AckRetryScheduler = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const retries = new Map<string, { users: number; stop: () => void }>();

/** Joins (or starts) the retry loop of `key`; the returned release stops it when its last user leaves. */
function retainRetry(key: string, send: () => Promise<unknown>): () => void {
  const running = retries.get(key);
  if (running) {
    running.users += 1;
  } else {
    const entry = { users: 1, stop: () => {} };
    retries.set(key, entry);
    entry.stop = startAckRetryLoop({ send, pending: () => retries.get(key) === entry, scheduler: TIMERS });
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const entry = retries.get(key);
    if (!entry) return;
    entry.users -= 1;
    if (entry.users > 0) return;
    entry.stop();
    retries.delete(key);
  };
}

interface AckTarget {
  organizationId: string;
  surface: DriveSurface;
  actingMemberId: string;
}

function sendAck(target: AckTarget): Promise<void> {
  return acknowledgeDriveNotice({
    surface: target.surface,
    actingMemberId: target.actingMemberId,
    organizationId: target.organizationId,
  });
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useManagementNoticeAck(): ManagementNoticeAck {
  const { memberId, actingMemberId, surface } = useDriveActorIds();
  const { organizationId } = usePermissions();
  const status = useDriveBackendStatus();
  const published = status !== "not_published";
  const scopedOrgId = status === "ready" ? organizationId : null;
  const ackResult: readonly [readonly unknown[], boolean] = useDriveNoticeAckRows(scopedOrgId);
  const rawRows = ackResult[0];
  // A disabled subscription reports ready with no rows, and so does the render that enables it (it still returns
  // the disabled snapshot): only a snapshot taken for this store counts.
  const rowsReady = useScopedTableReady(scopedOrgId, ackResult);

  const key = memberId && organizationId ? noticeLocalKey(organizationId, memberId, surface) : null;
  const localAck = useSyncExternalStore(
    subscribeLocalAcks,
    () => readLocalAck(key),
    () => false,
  );

  // Already scoped to the store by the subscription.
  const rows = useMemo(() => {
    const out: NoticeAckRow[] = [];
    for (const raw of rawRows) {
      const ack = mapDriveNoticeAck(raw);
      if (ack) out.push(ack);
    }
    return out;
  }, [rawRows]);

  const state = noticeAckState({ rows, rowsReady, memberId, surface, localAck, published });

  const acknowledge = useCallback(async (): Promise<void> => {
    if (key === null || organizationId === null) return;
    writeLocalAck(key);
    if (!published) return;
    try {
      await sendAck({ organizationId, surface, actingMemberId });
    } catch (err) {
      // The retry loop takes over; the person is never held up by it.
      console.warn("[drive] notice acknowledgement not saved yet, retrying", err);
    }
  }, [key, organizationId, published, surface, actingMemberId]);

  const { needsServerWrite } = state;
  useEffect(() => {
    if (!needsServerWrite || key === null || organizationId === null) return;
    return retainRetry(key, () => sendAck({ organizationId, surface, actingMemberId }));
  }, [needsServerWrite, key, organizationId, surface, actingMemberId]);

  const { ready, needsAck } = state;
  return useMemo(() => ({ ready, needsAck, acknowledge, scope: key }), [ready, needsAck, acknowledge, key]);
}
