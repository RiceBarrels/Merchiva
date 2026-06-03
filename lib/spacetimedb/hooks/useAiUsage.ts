"use client";

import { useMemo } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { usePermissions } from "@/lib/context/permissions";

export interface AiUsageEntry {
  id: string;
  organizationId: string;
  userId: string;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
  cost: number;
  day: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  createdAtMs: number;
  description: string | null;
}

export interface AiUsageQuota {
  organizationId: string;
  monthlyTokenLimit: number | null;
  monthlyCostLimit: number | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tsToMs(raw: any): number {
  if (raw && typeof raw === "object" && "microsSinceUnixEpoch" in raw) {
    return Number((raw as { microsSinceUnixEpoch: bigint }).microsSinceUnixEpoch) / 1000;
  }
  const n = new Date(String(raw)).getTime();
  return Number.isFinite(n) ? n : 0;
}

/**
 * All AI usage rows for the current organization, newest first. Subscribes to
 * the public `ai_usage` table (the provider sets up the subscription) and maps
 * raw rows to typed entries.
 */
export function useAiUsage(): { entries: AiUsageEntry[]; isReady: boolean } {
  const { organizationId } = usePermissions();
  const [rawRows, isReady] = useTable(tables.aiUsage);

  const entries = useMemo<AiUsageEntry[]>(() => {
    if (!organizationId) return [];
    return rawRows
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((r: any) => r.organizationId === organizationId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => ({
        id: r.id?.toString?.() ?? String(r.id),
        organizationId: r.organizationId,
        userId: r.userId ?? "",
        feature: r.feature ?? "unknown",
        model: r.model ?? "",
        inputTokens: Number(r.inputTokens) || 0,
        outputTokens: Number(r.outputTokens) || 0,
        inputCost: Number(r.inputCost) || 0,
        outputCost: Number(r.outputCost) || 0,
        cost: Number(r.cost) || 0,
        day: String(r.day ?? ""),
        month: String(r.month ?? ""),
        createdAtMs: tsToMs(r.createdAt),
        description: r.description ?? null,
      }))
      .sort((a, b) => b.createdAtMs - a.createdAtMs);
  }, [rawRows, organizationId]);

  return { entries, isReady };
}

/** The current org's quota, or null when none is set. */
export function useAiUsageQuota(): { quota: AiUsageQuota | null; isReady: boolean } {
  const { organizationId } = usePermissions();
  const [rawRows, isReady] = useTable(tables.aiUsageQuota);

  const quota = useMemo<AiUsageQuota | null>(() => {
    if (!organizationId) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = rawRows.find((r: any) => r.organizationId === organizationId);
    if (!row) return null;
    return {
      organizationId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      monthlyTokenLimit: (row as any).monthlyTokenLimit ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      monthlyCostLimit: (row as any).monthlyCostLimit ?? null,
    };
  }, [rawRows, organizationId]);

  return { quota, isReady };
}
