import { createClient } from "@/lib/supabase/client";

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromDb(row: any): UserSettings {
  return {
    id: row.id,
    userId: row.user_id,
    businessName: row.business_name ?? null,
    businessType: row.business_type ?? null,
    timezone: row.timezone ?? "America/Los_Angeles",
    squareConnected: Boolean(row.square_connected),
    squareMerchantId: row.square_merchant_id ?? null,
    squareLocationId: row.square_location_id ?? null,
    squareLastSyncedAt: row.square_last_synced_at ?? null,
    cloverConnected: Boolean(row.clover_connected),
    cloverMerchantId: row.clover_merchant_id ?? null,
    cloverLastSyncedAt: row.clover_last_synced_at ?? null,
  };
}

export async function getSettings(): Promise<UserSettings | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("settings")
    // Exclude the raw access token — it's only readable via the secure RPC
    .select("id, user_id, business_name, timezone, square_connected, square_merchant_id, square_location_id, square_last_synced_at, clover_connected, clover_merchant_id, clover_last_synced_at")
    .maybeSingle();
  if (error) throw error;
  return data ? fromDb(data) : null;
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
  const supabase = createClient();
  const payload: Record<string, unknown> = { user_id: userId };
  if (updates.businessName !== undefined) payload.business_name = updates.businessName;
  if (updates.businessType !== undefined) payload.business_type = updates.businessType;
  if (updates.timezone !== undefined) payload.timezone = updates.timezone;
  if (updates.squareConnected !== undefined) payload.square_connected = updates.squareConnected;
  if (updates.squareLocationId !== undefined) payload.square_location_id = updates.squareLocationId;
  if (updates.squareLastSyncedAt !== undefined) payload.square_last_synced_at = updates.squareLastSyncedAt;
  const { error } = await supabase
    .from("settings")
    .upsert(payload, { onConflict: "user_id" });
  if (error) throw error;
}

export async function disconnectSquare(userId: string): Promise<void> {
  const supabase = createClient();

  // Revoke the token on Square's side
  const { data: settings } = await supabase
    .from("settings")
    .select("square_access_token")
    .eq("user_id", userId)
    .maybeSingle();

  if (settings?.square_access_token && process.env.SQUARE_APP_SECRET) {
    try {
      const { SquareClient, SquareEnvironment } = await import("square");
      const square = new SquareClient({
        token: process.env.SQUARE_APP_SECRET,
        environment: SquareEnvironment.Production,
      });
      await square.oAuth.revokeToken({
        clientId: process.env.SQUARE_APP_ID,
        accessToken: settings.square_access_token,
      });
    } catch (err) {
      console.error("[settings] Square token revoke failed:", err);
    }
  }

  const { error } = await supabase
    .from("settings")
    .update({
      square_access_token: null,
      square_refresh_token: null,
      square_token_expires_at: null,
      square_merchant_id: null,
      square_location_id: null,
      square_connected: false,
      square_last_synced_at: null,
    })
    .eq("user_id", userId);
  if (error) throw error;
}

export async function disconnectClover(userId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("settings")
    .update({
      clover_access_token: null,
      clover_merchant_id: null,
      clover_connected: false,
      clover_last_synced_at: null,
    })
    .eq("user_id", userId);
  if (error) throw error;
}
