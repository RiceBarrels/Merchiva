// Who else has a spreadsheet open (sheets.md §5.3): the avatars from its presence rows, and the lease holder's
// selection highlighted in a viewer's grid. Read again every presence heartbeat, so a stale row drops out.
//
// Pure: no React, no Univer runtime.

import type { DocPeer } from "@/lib/docs/sync-types";
import type { SheetLeaseController } from "@/lib/sheets/sync/lease-controller";
import type { SheetLiveSubscription } from "@/lib/sheets/sync/live/subscription";
import { samePeers, type SheetPresence } from "@/lib/sheets/sync/presence";
import type { SheetTimers } from "@/lib/sheets/sync/push-queue";
import type { SheetModelSync } from "@/lib/sheets/sync/remote-apply";
import type { SheetEmitter, SheetSessionEvents } from "./types";

export interface SheetPeersHost {
  readonly live: SheetLiveSubscription;
  readonly sync: SheetModelSync;
  readonly presence: SheetPresence;
  readonly events: SheetEmitter<SheetSessionEvents>;
  lease(): SheetLeaseController;
}

export class SheetSessionPeers {
  private value: DocPeer[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(
    private readonly host: SheetPeersHost,
    private readonly timers: SheetTimers,
    private readonly intervalMs: number,
  ) {}

  get peers(): DocPeer[] { return this.value; }

  /** Avatars, and the holder's selection highlighted for everyone else; re-run every interval for stale rows. */
  update(): void {
    const { live, presence, sync, events } = this.host;
    const conn = live.connection;
    if (!conn || !live.applied || this.disposed) return;
    const rows = [...conn.db.documentPresence.iter()];
    const peers = presence.peers(rows);
    if (!samePeers(peers, this.value)) {
      this.value = peers;
      events.emit("peers", peers);
    }
    const lease = this.host.lease();
    const row = lease.leaseRow;
    const holder = row && lease.heldEpoch === null ? presence.holderSelection(rows, row.holderConnectionId) : null;
    sync.model?.highlightPeer(holder ? { color: holder.color, selection: holder.selection } : null);
    this.stop();
    this.timer = this.timers.setTimeout(() => {
      this.timer = null;
      this.update();
    }, this.intervalMs);
  }

  /** The subscription went away: no re-read until the next update(). */
  stop(): void {
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.timer = null;
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
  }
}
