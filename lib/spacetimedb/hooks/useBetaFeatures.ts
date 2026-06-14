"use client";

import { useCallback, useMemo, useState } from "react";
import { useTable } from "spacetimedb/react";
import {
  betaFeaturesFromSettingsRow,
  type BetaFeatureKey,
  type BetaFeaturesConfig,
} from "@/lib/beta-features";
import { usePermissions } from "@/lib/context/permissions";
import { tables } from "@/lib/spacetimedb/generated";
import { setBetaFeatures as persistBetaFeatures } from "@/lib/spacetimedb/actions";

export function useBetaFeatures() {
  const { organizationId } = usePermissions();
  const [settingsRows, isReady] = useTable(tables.settings);
  const [savingKey, setSavingKey] = useState<BetaFeatureKey | null>(null);
  const [, setLocalRevision] = useState(0);

  const settingsRow = useMemo(
    () => settingsRows.find((row) => row.organizationId === organizationId),
    [settingsRows, organizationId],
  );

  const betaFeatures = betaFeaturesFromSettingsRow(settingsRow, organizationId);

  const setFeature = useCallback(
    async (key: BetaFeatureKey, enabled: boolean) => {
      const next: BetaFeaturesConfig = { ...betaFeatures, [key]: enabled };
      setSavingKey(key);
      try {
        await persistBetaFeatures(next, organizationId ?? undefined);
        setLocalRevision((value) => value + 1);
      } finally {
        setSavingKey(null);
      }
    },
    [betaFeatures, organizationId],
  );

  return {
    betaFeatures,
    isReady,
    loading: !isReady,
    savingKey,
    setFeature,
  };
}
