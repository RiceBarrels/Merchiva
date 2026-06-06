"use client";
// SpacetimeDB — settings

import { useCallback, useMemo, type Dispatch, type SetStateAction } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { usePermissions } from "@/lib/context/permissions";
import type { UserSettings } from "@/lib/db/settings";
import {
  parseAutonomyConfig,
  type AutonomyConfig,
} from "@/lib/merchiva/autonomy";
import { setAssistantConfig } from "@/lib/spacetimedb/actions";

export function useSettings() {
  const { organizationId } = usePermissions();

  const [rawSettings, isReady] = useTable(tables.settings);

  const settings = useMemo<UserSettings | null>(() => {
    if (!organizationId) return null;
    const row = rawSettings.find((r) => r.organizationId === organizationId);
    if (!row) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any;
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
      // Clover credentials stored in httpOnly cookies — detect via client-readable cookie
      cloverConnected:     typeof document !== "undefined"
        ? document.cookie.split("; ").some((c) => c.startsWith("clover_connected=true"))
        : false,
      cloverMerchantId:    null, // httpOnly — not readable from JS
      cloverLastSyncedAt:  null,
      locationLatitude:    r.locationLatitude ?? null,
      locationLongitude:   r.locationLongitude ?? null,
      googlePlacesId:      r.googlePlacesId ?? null,
      openingHours:        r.openingHours ?? null,
      countryCode:         r.countryCode ?? null,
      paymentTaxRate:      r.paymentTaxRate != null ? Number(r.paymentTaxRate) : null,
      paymentCurrency:     r.paymentCurrency ?? null,
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

/**
 * Mr. Merchiva autonomy config for the active org, parsed from the settings row.
 * Falls back to DEFAULT_AUTONOMY_CONFIG when the column is absent (pre-publish)
 * or the org has never configured it. `save` persists via the owner-only reducer.
 */
export function useAssistantConfig() {
  const { organizationId } = usePermissions();
  const [rawSettings, isReady] = useTable(tables.settings);

  const config = useMemo<AutonomyConfig>(() => {
    const row = organizationId
      ? rawSettings.find((r) => r.organizationId === organizationId)
      : undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = row ? (row as any).assistantConfig : null;
    return parseAutonomyConfig(raw);
  }, [rawSettings, organizationId]);

  const save = useCallback(
    (next: AutonomyConfig) => setAssistantConfig(next, organizationId ?? undefined),
    [organizationId],
  );

  return { config, isReady, loading: !isReady, save };
}
