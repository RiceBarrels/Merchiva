"use client";
// SpacetimeDB migration layer — settings
// TODO: replace internals with:
//   const [settingsRows] = useTable(tables.settings.where(r => r.organizationId.eq(orgId)));

import { useState, useEffect, useCallback } from "react";
import { getSettings, type UserSettings } from "@/lib/db/settings";
import { getCached, setCache } from "@/lib/cache";

export function useSettings() {
  const [settings, setSettings] = useState<UserSettings | null>(
    () => getCached<UserSettings>("settings") ?? null
  );
  const [loading, setLoading] = useState(() => !getCached<UserSettings>("settings"));

  const refresh = useCallback(() => {
    getSettings()
      .then((s) => {
        setSettings(s);
        if (s) setCache("settings", s);
      })
      .catch((err) => console.error("[useSettings]", err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { settings, setSettings, loading, refresh } as const;
}
