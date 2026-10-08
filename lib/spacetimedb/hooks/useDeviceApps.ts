"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTable } from "spacetimedb/react";
import { deviceAppsFromSettingsRow, isDeviceAppInstalled } from "@/lib/device-apps";
import { usePermissions } from "@/lib/context/permissions";
import { tables } from "@/lib/spacetimedb/generated";
import { setDeviceApps as persistDeviceApps } from "@/lib/spacetimedb/actions";

/** Org-wide set of optional device apps installed from the device App Store. */
export function useDeviceApps() {
  const { organizationId } = usePermissions();
  const [settingsRows, isReady] = useTable(tables.settings);
  const [savingId, setSavingId] = useState<string | null>(null);

  const settingsRow = useMemo(
    () => settingsRows.find((row) => row.organizationId === organizationId),
    [settingsRows, organizationId],
  );
  const installedIds = useMemo(() => deviceAppsFromSettingsRow(settingsRow), [settingsRow]);
  const installed = useMemo(() => new Set(installedIds), [installedIds]);

  const isInstalled = useCallback((id: string) => isDeviceAppInstalled(id, installed), [installed]);

  // Each write builds on the org's shared DeviceAppWrites (below), never on this render's installedIds.
  const orgKey = organizationId ?? "";
  useEffect(() => {
    writesFor(orgKey, installedIds).observe(installedIds);
  }, [orgKey, installedIds]);

  const setInstalled = useCallback(
    async (id: string, on: boolean) => {
      const write = writesFor(orgKey, installedIds).begin(id, on);
      setSavingId(id);
      try {
        await persistDeviceApps(write.next, organizationId ?? undefined);
        write.settle(true);
      } catch (err) {
        write.settle(false);   // the write failed — do not keep its effect
        throw err;
      } finally {
        setSavingId(null);
      }
    },
    [orgKey, installedIds, organizationId],
  );

  return { installed, installedIds, isInstalled, setInstalled, savingId, isReady, loading: !isReady };
}

/**
 * The list device-app writes build on, for one org, shared by every useDeviceApps in this window.
 *
 * `installedIds` only refreshes once the reducer has committed and the settings row has streamed back, and
 * `setDeviceApps` is a full replacement. So a second toggle during that round trip used to rebuild the list from
 * the PRE-first-click snapshot and undo the first install org-wide (and with it the manager routes that app owns),
 * while both toasts said "added". Writes now build on this list, advanced the moment one is issued. It is shared
 * because the plugin store, a Drive prompt and other browser-shell tabs each hold their own hook. It adopts the
 * streamed row only while no write is in flight: a row that lands between two writes would drop the second.
 * Writes from another device can still cross; only the reducer could merge those.
 */
export class DeviceAppWrites {
  private ids: readonly string[];
  private inFlight = 0;

  constructor(ids: readonly string[]) {
    this.ids = ids;
  }

  /** The committed list streamed in. */
  observe(ids: readonly string[]): void {
    if (this.inFlight === 0) this.ids = ids;
  }

  /** Starts a write: the full list to send, and settle() once it is answered. */
  begin(id: string, on: boolean): { next: string[]; settle(ok: boolean): void } {
    const had = this.ids.includes(id);
    const next = on ? [...this.ids.filter((x) => x !== id), id] : this.ids.filter((x) => x !== id);
    this.ids = next;
    this.inFlight += 1;
    let settled = false;
    return {
      next,
      settle: (ok) => {
        if (settled) return;
        settled = true;
        this.inFlight -= 1;
        // A failed write undoes only its own toggle: another may have been issued on top of it.
        if (!ok) this.ids = had ? [...this.ids.filter((x) => x !== id), id] : this.ids.filter((x) => x !== id);
      },
    };
  }

  /** What the next write builds on. */
  current(): readonly string[] {
    return this.ids;
  }
}

const writesByOrg = new Map<string, DeviceAppWrites>();

function writesFor(orgKey: string, installedIds: readonly string[]): DeviceAppWrites {
  let writes = writesByOrg.get(orgKey);
  if (!writes) {
    writes = new DeviceAppWrites(installedIds);
    writesByOrg.set(orgKey, writes);
  }
  return writes;
}
