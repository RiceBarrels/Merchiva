import { createClient } from "@/lib/supabase/server";

/**
 * Returns the Clover base URL depending on environment.
 * Set CLOVER_ENV=production to switch from sandbox.
 */
export function getCloverBaseUrl(): string {
  return process.env.CLOVER_ENV === "production"
    ? "https://www.clover.com"
    : "https://sandbox.dev.clover.com";
}

/**
 * Retrieves the stored Clover credentials for a user.
 * Returns null if the user has no Clover connection.
 */
export async function getCloverCredentials(
  userId: string
): Promise<{ token: string; merchantId: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("settings")
    .select("clover_access_token, clover_merchant_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data?.clover_access_token || !data?.clover_merchant_id) return null;
  return { token: data.clover_access_token, merchantId: data.clover_merchant_id };
}

/**
 * Makes an authenticated request to the Clover REST API.
 * path should start with "/" (e.g. "/items?limit=100")
 */
export async function cloverFetch(
  merchantId: string,
  token: string,
  path: string,
  options?: RequestInit
): Promise<Response> {
  const url = `${getCloverBaseUrl()}/v3/merchants/${merchantId}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
}
