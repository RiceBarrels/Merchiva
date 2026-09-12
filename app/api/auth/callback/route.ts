import { NextRequest, NextResponse } from "next/server";
import { workos, clientId } from "@/lib/auth/workos";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", req.url));
  }

  let redirectTo = "/manager/";
  // `desktop` covers the native shells, including legacy Electron state values
  // and Capacitor's in-app browser flow. They all register merchiva://.
  let client: "web" | "desktop" = "web";
  if (state) {
    try {
      const parsed = JSON.parse(
        Buffer.from(state, "base64url").toString("utf-8"),
      );
      if (parsed.redirectTo) redirectTo = parsed.redirectTo;
      if (
        parsed.client === "desktop" ||
        parsed.client === "electron" ||
        parsed.client === "capacitor"
      ) {
        client = "desktop";
      }
    } catch {}
  }

  try {
    const result = await workos.userManagement.authenticateWithCode({
      clientId,
      code,
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });

    const params = new URLSearchParams({
      access_token: result.accessToken!,
      refresh_token: result.refreshToken!,
      user: JSON.stringify({
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
      }),
      redirect_to: redirectTo,
    });

    // Native clients: hand the tokens back through the merchiva:// custom
    // protocol. The OS routes the URL to the app, which forwards the params to
    // the renderer through the shell/deep-link plugin. The browser tab serves a
    // tiny landing that triggers the protocol jump and closes itself.
    if (client === "desktop") {
      const protocolUrl = `merchiva://auth-callback?${params.toString()}`;
      const escaped = protocolUrl.replace(/"/g, "&quot;");
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Signing you in…</title><style>body{font-family:Inter,system-ui,sans-serif;background:#0c0a09;color:#fafaf9;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:24px}.box{max-width:420px}h1{font-size:18px;font-weight:600;margin:0 0 8px}p{font-size:14px;color:#a8a29e;margin:0 0 16px;line-height:1.5}a{color:#fafaf9;text-decoration:underline}</style></head><body><div class="box"><h1>Returning to Merchiva…</h1><p>If the desktop app doesn't open automatically, <a href="${escaped}">click here</a>.</p><p style="font-size:12px;opacity:.6">You can close this tab.</p></div><script>window.location.href = ${JSON.stringify(protocolUrl)};setTimeout(function(){window.close()},1500);</script></body></html>`;
      return new NextResponse(html, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return NextResponse.redirect(
      new URL(`/auth-callback?${params.toString()}`, req.url),
    );
  } catch (err: unknown) {
    console.error("[auth/callback] OAuth error:", err);
    return NextResponse.redirect(
      new URL("/login?error=oauth_failed", req.url),
    );
  }
}
