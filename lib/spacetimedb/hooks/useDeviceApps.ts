"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

  /**
   * The list each write builds on.
   *
   * `installedIds` only refreshes once the reducer has committed and the
   * settings row has streamed back, and the App Store disables only the card
   * currently saving. So toggling a second app during that round trip used to
   * rebuild the list from the PRE-first-click snapshot and send it wholesale —
   * `setDeviceApps` is a full replacement, so the first install was undone
   * org-wide (and with it the manager routes that app owns), while both toasts
   * said "added". Writes now build on this ref, which is advanced locally the
   * moment one is issued.
   */
  const pendingIds = useRef<string[]>(installedIds);
  useEffect(() => {
    pendingIds.current = installedIds;
  }, [installedIds]);

  const setInstalled = useCallback(
    async (id: string, on: boolean) => {
      const base = pendingIds.current;
      const next = on ? [...base.filter((x) => x !== id), id] : base.filter((x) => x !== id);
      pendingIds.current = next;
      setSavingId(id);
      try {
        await persistDeviceApps(next, organizationId ?? undefined);
      } catch (err) {
        pendingIds.current = base;   // the write failed — do not keep its effect
        throw err;
      } finally {
        setSavingId(null);
      }
    },
    [organizationId],
  );

  return { installed, installedIds, isInstalled, setInstalled, savingId, isReady, loading: !isReady };
}
