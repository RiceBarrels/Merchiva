import { NextRequest } from "next/server";
import { workos, clientId } from "@/lib/auth/workos";
import { handleOptions, jsonWithCors } from "@/lib/api-cors";

const providerMap: Record<string, string> = {
  google: "GoogleOAuth",
  apple: "AppleOAuth",
};

export const OPTIONS = handleOptions;

export async function POST(req: NextRequest) {
  try {
    const { provider, redirectTo, client } = await req.json();

    const strategy = providerMap[provider];
    if (!strategy) {
      return jsonWithCors(
        req,
        { error: `Unsupported provider: ${provider}` },
        { status: 400 },
      );
    }

    const appUrl =
      (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

    // `client === "electron"` makes /api/auth/callback redirect to the
    // merchiva:// custom protocol instead of the web /auth-callback page so
    // the Electron desktop app can pick up the tokens from the system browser.
    const statePayload = {
      redirectTo: redirectTo || "/~/dashboard",
      client: client === "electron" ? "electron" : "web",
    };

    const authorizationUrl = workos.userManagement.getAuthorizationUrl({
      clientId,
      provider: strategy as "GoogleOAuth" | "AppleOAuth",
      redirectUri: `${appUrl}/api/auth/callback`,
      state: Buffer.from(JSON.stringify(statePayload)).toString("base64url"),
    });

    return jsonWithCors(req, { url: authorizationUrl });
  } catch (err: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const error = err as any;
    const message = error.message ?? "Failed to generate auth URL";
    return jsonWithCors(req, { error: message }, { status: 500 });
  }
}
