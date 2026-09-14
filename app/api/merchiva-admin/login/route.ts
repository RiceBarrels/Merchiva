import { NextRequest, NextResponse } from "next/server";
import { hashAdminPassword, normalizeAdminUsername } from "@/lib/merchiva-admin/password";
import { ADMIN_SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/merchiva-admin/session";
import { adminCall } from "@/lib/merchiva-admin/stdb";

// Best-effort brute-force throttle (per warm instance): 10 failures / 15 min / IP.
const failures = new Map<string, { count: number; resetAt: number }>();
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const now = Date.now();
  const entry = failures.get(ip);
  if (entry && entry.resetAt > now && entry.count >= MAX_FAILURES) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  let username = "";
  let password = "";
  try {
    const body = (await req.json()) as { username?: string; password?: string };
    username = normalizeAdminUsername(String(body.username ?? ""));
    password = String(body.password ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!username || !password) {
    return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
  }

  try {
    const passwordHash = hashAdminPassword(username, password);
    await adminCall("platformAdminVerify", { username, passwordHash });
  } catch (err) {
    const current = entry && entry.resetAt > now ? entry : { count: 0, resetAt: now + WINDOW_MS };
    failures.set(ip, { count: current.count + 1, resetAt: current.resetAt });
    const message = err instanceof Error ? err.message : "Login failed";
    const isCredential = /invalid username or password/i.test(message);
    return NextResponse.json(
      { error: isCredential ? "Invalid username or password" : message },
      { status: isCredential ? 401 : 500 },
    );
  }

  failures.delete(ip);
  const { token, expiresAt } = createSessionToken(username);
  const res = NextResponse.json({ ok: true, username });
  res.cookies.set(ADMIN_SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  return res;
}
