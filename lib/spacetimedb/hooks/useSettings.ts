"use client";
// SpacetimeDB — settings

import { useMemo, type Dispatch, type SetStateAction } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { usePermissions } from "@/lib/context/permissions";
import type { UserSettings } from "@/lib/db/settings";

export function useSettings() {
  const { organizationId } = usePermissions();

  const [rawSettings, isReady] = useTable(tables.settings);

  const settings = useMemo<UserSettings | null>(() => {
    if (!organizationId) return null;
    const row = rawSettings.find((r) => r.organizationId === organizationId);
    if (!row) return null;
    return {
      id:                  row.id.toString(),
      userId:              organizationId, // settings are org-scoped in SpacetimeDB
      businessName:        row.businessName ?? null,
      businessType:        row.businessType ?? null,
      timezone:            row.timezone,
      squareConnected:     row.squareConnected,
      squareMerchantId:    row.squareMerchantId ?? null,
      squareLocationId:    row.squareLocationId ?? null,
      squareLastSyncedAt:  row.squareLastSyncedAt
        ? row.squareLastSyncedAt.toDate().toISOString()
        : null,
      // Clover integration not in SpacetimeDB schema
      cloverConnected:     false,
      cloverMerchantId:    null,
      cloverLastSyncedAt:  null,
    };
  }, [rawSettings, organizationId]);

  return {
    settings,
    isReady,
    loading: !isReady,
    // no-op — SpacetimeDB updates reactively
    setSettings: ((_v: SetStateAction<UserSettings | null>) => {}) as Dispatch<SetStateAction<UserSettings | null>>,
    refresh: () => {},
  };
}
