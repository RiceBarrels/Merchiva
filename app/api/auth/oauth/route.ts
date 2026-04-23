import { NextRequest, NextResponse } from "next/server";
import { workos, clientId } from "@/lib/auth/workos";

const providerMap: Record<string, string> = {
  google: "GoogleOAuth",
  apple: "AppleOAuth",
};

export async function POST(req: NextRequest) {
  try {
    const { provider, redirectTo } = await req.json();

    const strategy = providerMap[provider];
    if (!strategy) {
      return NextResponse.json(
        { error: `Unsupported provider: ${provider}` },
        { status: 400 },
      );
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const authorizationUrl = workos.userManagement.getAuthorizationUrl({
      clientId,
      provider: strategy as "GoogleOAuth" | "AppleOAuth",
      redirectUri: `${appUrl}/api/auth/callback`,
      state: Buffer.from(JSON.stringify({ redirectTo: redirectTo || "/dashboard" })).toString("base64url"),
    });

    return NextResponse.json({ url: authorizationUrl });
  } catch (err: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const error = err as any;
    const message = error.message ?? "Failed to generate auth URL";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
