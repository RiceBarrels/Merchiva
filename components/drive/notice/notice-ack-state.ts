// The management-visibility notice ("your store's management can see your files"): whether the
// person using this screen still has to acknowledge it, and the retry loop that records the
// acknowledgement on the server.
//
// Pure (no React). One acknowledgement per member, notice and surface: the module keys
// `drive_notice_ack` rows `${memberId}:${notice}:${surface}` (CONTRACTS C23), so an ack on the
// phone does not cover the store tablet. A local copy (localStorage, keyed the same way) releases
// the gate at once and survives an offline moment; the loop then re-sends until the server row
// shows up in the subscription.

import { DRIVE_NOTICE_ID, type DriveSurface } from "@/lib/drive/types";

/** Waits between re-sends of an acknowledgement the server has not shown yet. */
export const NOTICE_ACK_RETRY_DELAYS_MS: readonly number[] = [5_000, 15_000, 60_000, 300_000];

/** The localStorage key of a local acknowledgement: `merchiva_drive_notice:<notice>:<surface>:<org>:<member>`. */
export function noticeLocalKey(organizationId: string, memberId: string, surface: DriveSurface): string {
  return `merchiva_drive_notice:${DRIVE_NOTICE_ID}:${surface}:${organizationId.trim().toLowerCase()}:${memberId.trim().toLowerCase()}`;
}

/** Member ids compare case- and dash-insensitively: an id read through `toHexString` has no dashes. */
function sameMemberId(a: string, b: string): boolean {
  const norm = (id: string) => id.trim().toLowerCase().replace(/-/g, "");
  return norm(a) !== "" && norm(a) === norm(b);
}

export interface NoticeAckRow {
  memberId: string;
  notice: string;
  surface: string;
}

export interface NoticeAckInput {
  /** The org's `drive_notice_ack` rows this client can read (its own, plus those this device recorded). */
  rows: readonly NoticeAckRow[];
  /** The rows' subscription has applied (false while the backend is still being probed). */
  rowsReady: boolean;
  /** Who is using the screen (the PIN operator on /store); null while unknown. */
  memberId: string | null;
  surface: DriveSurface;
  /** This device already recorded an acknowledgement for the member, notice and surface. */
  localAck: boolean;
  /** The module has Drive; false = only the local acknowledgement exists. */
  published: boolean;
}

export interface NoticeAckState {
  /** Whether needsAck can be trusted: the member is known and either their rows or a local ack are in. */
  ready: boolean;
  serverAck: boolean;
  /** Show the blocking notice. */
  needsAck: boolean;
  /** Acknowledged here, but the server has no row yet: keep re-sending. */
  needsServerWrite: boolean;
}

export function noticeAckState(input: NoticeAckInput): NoticeAckState {
  const { memberId, surface, localAck, published } = input;
  const rowsReady = !published || input.rowsReady;
  const serverAck =
    published &&
    memberId !== null &&
    input.rows.some((row) => row.notice === DRIVE_NOTICE_ID && row.surface === surface && sameMemberId(row.memberId, memberId));
  const ready = memberId !== null && (rowsReady || localAck);
  return {
    ready,
    serverAck,
    needsAck: ready && !serverAck && !localAck,
    needsServerWrite: memberId !== null && published && input.rowsReady && localAck && !serverAck,
  };
}

/** What a lite host's notice gate shows: loading, the notice, or the app. */
export type LiteNoticeView = "loading" | "notice" | "app";

export interface LiteNoticeGateState {
  view: LiteNoticeView;
  /** The scope the app has been let through for, kept across renders by the gate. */
  clearedScope: string | null;
}

/**
 * The lite gate for `ack` (ready / needsAck, and the scope they answer for: org, member and surface), given the
 * scope it already let through. Once the app has shown for a scope it stays: `ready` drops back to false on a
 * reconnect (the ack rows re-subscribe, the member may be unknown for a moment), and swapping the app for the
 * loading screen would unmount the whole lite router with its screen stack, an open drawer and a picker in flight.
 * Only someone else (another operator on /store) is gated again, before their own first acknowledgement.
 */
export function liteNoticeGate(
  ack: { ready: boolean; needsAck: boolean; scope?: string | null },
  clearedScope: string | null,
): LiteNoticeGateState {
  const scope = ack.scope ?? null;
  const open = ack.ready && !ack.needsAck;
  let cleared = scope !== null && scope !== clearedScope ? null : clearedScope;
  if (open && scope !== null) cleared = scope;
  if (open || cleared !== null) return { view: "app", clearedScope: cleared };
  return { view: ack.ready ? "notice" : "loading", clearedScope: cleared };
}

/** Delay before re-send number `attempt` (0-based): 5 s, 15 s, 1 min, then every 5 min. */
export function nextAckRetryDelay(attempt: number): number {
  const delays = NOTICE_ACK_RETRY_DELAYS_MS;
  const index = Number.isFinite(attempt) ? Math.max(0, Math.floor(attempt)) : 0;
  return delays[Math.min(index, delays.length - 1)];
}

export interface AckRetryScheduler {
  set(run: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface AckRetryOptions {
  /** One acknowledgement write; a rejection only schedules the next try. */
  send(): Promise<unknown>;
  /** False once the server row is visible: nothing more is sent. */
  pending(): boolean;
  scheduler: AckRetryScheduler;
}

/**
 * Re-sends an acknowledgement after nextAckRetryDelay(0), (1), … until `pending()` turns false
 * or the returned stop function runs. The first send waits a full delay: the caller has just
 * sent one (acknowledge()), or the row may still be on its way from the subscription.
 */
export function startAckRetryLoop(opts: AckRetryOptions): () => void {
  let stopped = false;
  let attempt = 0;
  let handle: unknown = null;

  const schedule = () => {
    if (stopped) return;
    handle = opts.scheduler.set(tick, nextAckRetryDelay(attempt));
    attempt += 1;
  };

  function tick(): void {
    handle = null;
    if (stopped) return;
    if (!opts.pending()) {
      stopped = true;
      return;
    }
    Promise.resolve()
      .then(() => opts.send())
      .catch(() => {
        // Never blocks the person: the next tick tries again.
      })
      .finally(schedule);
  }

  schedule();
  return () => {
    stopped = true;
    if (handle !== null) opts.scheduler.clear(handle);
    handle = null;
  };
}

/** The Base UI change details the notice dialog reads (a subset of AlertDialogRoot.ChangeEventDetails). */
export interface NoticeOpenChangeDetails {
  reason?: string;
  cancel(): void;
}

/**
 * The dialog's onOpenChange. While it asks for the acknowledgement, every close request —
 * Escape, an outside press, focus leaving, an imperative close — is cancelled: only its two
 * buttons end it. The info dialog closes normally.
 */
export function guardNoticeOpenChange(
  mode: "acknowledge" | "info",
  onOpenChange: (open: boolean) => void,
): (open: boolean, details: NoticeOpenChangeDetails) => void {
  return (open, details) => {
    if (mode === "acknowledge" && !open) {
      details.cancel();
      return;
    }
    onOpenChange(open);
  };
}
