// Asks the server to email an invitation. Only the invitation's token goes
// over: the route reads the address, role, store name and inviter from the
// database AS the caller, and refuses anyone but an owner or manager of the
// store the invitation belongs to (app/api/team/send-invite-email/route.ts).
// Through apiUrl(), so native builds (which have no API routes) reach it too.

import { apiUrl } from "@/lib/api-client";
import { currentAuthToken } from "@/lib/auth/token-bridge";

export type InviteEmailResult = { ok: true } | { ok: false; status: number; error: string };

export async function sendInviteEmail(
  inviteToken: string,
  opts: { getToken?: () => Promise<string | null> } = {},
): Promise<InviteEmailResult> {
  const token = await (opts.getToken ?? currentAuthToken)().catch(() => null);
  if (!token) return { ok: false, status: 401, error: "Not signed in" };
  try {
    const res = await fetch(apiUrl("/api/team/send-invite-email"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ token: inviteToken }),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
    return { ok: false, status: res.status, error: typeof body?.error === "string" ? body.error : `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : "Network error" };
  }
}
