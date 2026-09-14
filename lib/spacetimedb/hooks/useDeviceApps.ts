"use client";

import { useCallback, useMemo, useState } from "react";
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

  const setInstalled = useCallback(
    async (id: string, on: boolean) => {
      const next = on ? [...installedIds.filter((x) => x !== id), id] : installedIds.filter((x) => x !== id);
      setSavingId(id);
      try {
        await persistDeviceApps(next, organizationId ?? undefined);
      } finally {
        setSavingId(null);
      }
    },
    [installedIds, organizationId],
  );

  return { installed, installedIds, isInstalled, setInstalled, savingId, isReady, loading: !isReady };
}
