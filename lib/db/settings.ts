import { createClient } from "@/lib/supabase/client";

export interface UserSettings {
  id: string;
  userId: string;
  businessName: string | null;
  timezone: string;
  squareConnected: boolean;
  squareLocationId: string | null;
  squareLastSyncedAt: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromDb(row: any): UserSettings {
  return {
    id: row.id,
    userId: row.user_id,
    businessName: row.business_name ?? null,
    timezone: row.timezone ?? "America/Los_Angeles",
    squareConnected: Boolean(row.square_connected),
    squareLocationId: row.square_location_id ?? null,
    squareLastSyncedAt: row.square_last_synced_at ?? null,
  };
}

export async function getSettings(): Promise<UserSettings | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("settings")
    // Exclude the raw access token — it's only readable via the secure RPC
    .select("id, user_id, business_name, timezone, square_connected, square_location_id, square_last_synced_at")
    .maybeSingle();
  if (error) throw error;
  return data ? fromDb(data) : null;
}

export async function upsertSettings(
  userId: string,
  updates: {
    businessName?: string;
    timezone?: string;
    squareConnected?: boolean;
    squareLocationId?: string | null;
    squareLastSyncedAt?: string | null;
  }
): Promise<void> {
  const supabase = createClient();
  const payload: Record<string, unknown> = { user_id: userId };
  if (updates.businessName !== undefined) payload.business_name = updates.businessName;
  if (updates.timezone !== undefined) payload.timezone = updates.timezone;
  if (updates.squareConnected !== undefined) payload.square_connected = updates.squareConnected;
  if (updates.squareLocationId !== undefined) payload.square_location_id = updates.squareLocationId;
  if (updates.squareLastSyncedAt !== undefined) payload.square_last_synced_at = updates.squareLastSyncedAt;
  const { error } = await supabase
    .from("settings")
    .upsert(payload, { onConflict: "user_id" });
  if (error) throw error;
}

/** Store Square credentials — this column is intentionally not returned by getSettings() */
export async function saveSquareCredentials(
  userId: string,
  accessToken: string,
  locationId: string
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("settings")
    .upsert(
      {
        user_id: userId,
        square_access_token: accessToken,
        square_location_id: locationId,
        square_connected: true,
      },
      { onConflict: "user_id" }
    );
  if (error) throw error;
}

export async function disconnectSquare(userId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("settings")
    .update({
      square_access_token: null,
      square_location_id: null,
      square_connected: false,
      square_last_synced_at: null,
    })
    .eq("user_id", userId);
  if (error) throw error;
}
