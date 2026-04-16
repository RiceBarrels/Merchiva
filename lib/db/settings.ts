// @ts-nocheck
import { getConnection, getActiveOrgId } from "@/lib/spacetimedb/client";

export interface UserSettings {
  id: string;
  userId: string;
  businessName: string | null;
  businessType: string | null;
  timezone: string;
  squareConnected: boolean;
  squareMerchantId: string | null;
  squareLocationId: string | null;
  squareLastSyncedAt: string | null;
  cloverConnected: boolean;
  cloverMerchantId: string | null;
  cloverLastSyncedAt: string | null;
}

export async function getSettings(): Promise<UserSettings | null> {
  const c = getConnection();
  if (!c) return null;
  const orgId = getActiveOrgId();
  const rows = (c as any).db.settings.iter();
  for (const r of rows) {
    if (r.organizationId === orgId) {
      return {
        id: r.id.toString(),
        userId: r.organizationId, // org-scoped, no per-user id in STDB schema
        businessName: r.businessName ?? null,
        businessType: r.businessType ?? null,
        timezone: r.timezone ?? "America/Los_Angeles",
        squareConnected: Boolean(r.squareConnected),
        squareMerchantId: r.squareMerchantId ?? null,
        squareLocationId: r.squareLocationId ?? null,
        squareLastSyncedAt: r.squareLastSyncedAt ? String(r.squareLastSyncedAt) : null,
        cloverConnected: false,
        cloverMerchantId: null,
        cloverLastSyncedAt: null,
      };
    }
  }
  return null;
}

export async function upsertSettings(
  userId: string,
  updates: {
    businessName?: string;
    businessType?: string | null;
    timezone?: string;
    squareConnected?: boolean;
    squareLocationId?: string | null;
    squareLastSyncedAt?: string | null;
  }
): Promise<void> {
  console.warn("[settings] upsertSettings: writes not yet supported via SpacetimeDB client");
}

export async function disconnectSquare(userId: string): Promise<void> {
  console.warn("[settings] disconnectSquare: writes not yet supported via SpacetimeDB client");
}

export async function disconnectClover(userId: string): Promise<void> {
  console.warn("[settings] disconnectClover: writes not yet supported via SpacetimeDB client");
}
