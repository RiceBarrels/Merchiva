import { NextRequest } from "next/server";
import { workos, clientId } from "@/lib/auth/workos";
import { handleOptions, jsonWithCors } from "@/lib/api-cors";

// `passkey` and `authkit` both route through AuthKit's hosted UI. WorkOS's
// Node SDK doesn't expose a direct passkey API — passkey sign-in is only
// available via the AuthKit page, which the user reaches by selecting
// "Sign in with passkey" there. Email is pre-filled via loginHint when the
// user kicks off the flow from /~/settings (enrollment).
const providerMap: Record<string, string> = {
  google: "GoogleOAuth",
  apple: "AppleOAuth",
  passkey: "authkit",
  authkit: "authkit",
};

export const OPTIONS = handleOptions;

export async function POST(req: NextRequest) {
  try {
    const { provider, redirectTo, client, loginHint, screenHint } = await req.json();

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
      provider: strategy,
      redirectUri: `${appUrl}/api/auth/callback`,
      state: Buffer.from(JSON.stringify(statePayload)).toString("base64url"),
      ...(loginHint ? { loginHint } : {}),
      ...(screenHint === "sign-in" || screenHint === "sign-up"
        ? { screenHint }
        : {}),
    });

    return jsonWithCors(req, { url: authorizationUrl });
  } catch (err: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const error = err as any;
    const message = error.message ?? "Failed to generate auth URL";
    return jsonWithCors(req, { error: message }, { status: 500 });
  }
}
