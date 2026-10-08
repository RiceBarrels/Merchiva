// What a spreadsheet session is opened with and what it tells its binding (sheets.md §7.4), and the small typed
// emitter it tells it through. Pure: no React, no Univer runtime.

import type { DocPeer } from "@/lib/docs/sync-types";
import type { DocErrorCode } from "@/lib/docs/types";
import type { SHEET_TUNING } from "@/lib/sheets/constants";
import type { SheetLeaseView } from "@/lib/sheets/lease";
import type { SheetReleaseReason } from "@/lib/sheets/sync/lease-controller";
import type { SheetTimers } from "@/lib/sheets/sync/push-queue";
import type { SheetOpAcceptor, SheetReloadReason } from "@/lib/sheets/sync/remote-apply";
import type { SheetTransport } from "@/lib/sheets/sync/transport";
import type { SheetErrorCode, SheetSyncStatus } from "@/lib/sheets/types";

export interface SheetSessionOptions {
  documentId: string;
  organizationId: string;
  /** The signed-in account's member (the tablet account on /store). */
  memberId: string;
  /** Who edits: the PIN operator on /store, else = memberId. */
  actorMemberId: string;
  /** '' off /store. */
  actingMemberId: string;
  user: { name: string; color: string };
  canEdit: boolean;
  autoAcquire: boolean;
  transport: SheetTransport;
  /** lib/sheets/univer/mutation-filter.ts acceptRemoteOp: only ops it accepts are ever executed from the log. */
  acceptRemoteOp: SheetOpAcceptor;
  tuning?: Partial<typeof SHEET_TUNING>;
  now?: () => number;
  timers?: SheetTimers;
}

export type SheetSizeWarning = "near_limit" | "too_large" | "log_full";
export type SheetSessionErrorCode = SheetErrorCode | DocErrorCode | "subscription" | "decode" | "unknown";

/** Each warning shows once per change: a lower one never replaces a higher one. */
export const SHEET_SIZE_RANK: Readonly<Record<SheetSizeWarning, number>> = { near_limit: 0, log_full: 1, too_large: 2 };

export type SheetSessionEvents = {
  status: [SheetSyncStatus];
  loaded: [];
  lease: [SheetLeaseView];
  peers: [DocPeer[]];
  reloaded: [SheetReloadReason];
  leaseLost: [{ byName: string; discardedOps: number }];
  handOverRequested: [{ name: string; deadlineMs: number }];
  sizeWarning: [SheetSizeWarning];
  integrity: [{ skippedOps: number; skippedRows: number }];
  updateRequired: [{ app: string }];
  error: [{ code: SheetSessionErrorCode; message: string }];
  accessLost: [DocErrorCode];
  /** This session gave the lease up (idle / hidden → "Editing paused"). */
  released: [SheetReleaseReason];
  /** Some getter may have changed (the React binding re-reads them). */
  changed: [];
};

type Listener<A extends unknown[]> = (...args: A) => void;

/** Typed events; a throwing listener is re-thrown outside, so it never leaves the session half-updated. */
export class SheetEmitter<E extends { [K in keyof E]: unknown[] }> {
  private readonly handlers = new Map<keyof E, Set<Listener<never[]>>>();
  on<K extends keyof E>(event: K, fn: Listener<E[K]>): () => void {
    const set = this.handlers.get(event) ?? new Set<Listener<never[]>>();
    set.add(fn as unknown as Listener<never[]>);
    this.handlers.set(event, set);
    return () => set.delete(fn as unknown as Listener<never[]>);
  }
  emit<K extends keyof E>(event: K, ...args: E[K]): void {
    for (const fn of [...(this.handlers.get(event) ?? [])]) {
      try {
        (fn as unknown as Listener<E[K]>)(...args);
      } catch (err) {
        queueMicrotask(() => {
          throw err;
        });
      }
    }
  }
  clear(): void { this.handlers.clear(); }
}
