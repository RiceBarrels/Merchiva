import { SquareClient, SquareEnvironment } from "square";
import { createClient } from "@/lib/supabase/server";

/**
 * Returns a valid Square access token for the given user, refreshing if needed.
 * Returns null if the user has no Square credentials.
 */
export async function getValidSquareToken(
  userId: string
): Promise<string | null> {
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from("settings")
    .select(
      "square_access_token, square_refresh_token, square_token_expires_at"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (!settings?.square_access_token) return null;

  // If no expiry info or token is still valid for > 24h, return as-is
  if (settings.square_token_expires_at) {
    const expiresAt = new Date(settings.square_token_expires_at);
    const oneDayFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000);

    if (expiresAt > oneDayFromNow) {
      return settings.square_access_token;
    }

    // Token is expiring soon or expired — try to refresh
    if (settings.square_refresh_token) {
      try {
        const square = new SquareClient({
          environment: SquareEnvironment.Production,
        });

        const response = await square.oAuth.obtainToken({
          clientId: process.env.SQUARE_APP_ID!,
          clientSecret: process.env.SQUARE_APP_SECRET!,
          refreshToken: settings.square_refresh_token,
          grantType: "refresh_token",
        });

        if (response.accessToken) {
          await supabase
            .from("settings")
            .update({
              square_access_token: response.accessToken,
              square_token_expires_at: response.expiresAt ?? null,
            })
            .eq("user_id", userId);

          return response.accessToken;
        }
      } catch (err) {
        console.error("[square/token] refresh failed:", err);
        // Fall through to return the existing (possibly expired) token
      }
    }
  }

  return settings.square_access_token;
}
