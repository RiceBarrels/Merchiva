// POST /api/team/send-invite-email — email a pending invitation.
//
// Body: { token: <invitation token> }. Header: Authorization: Bearer <the caller's token>.
//
// This route used to take the recipient, store name, inviter and role from the
// body, the link's host from the Origin header, and no sign-in at all: anyone
// could send a Merchiva-branded email from our sender to any address, with any
// text and a button to any site. Now nothing in the body but the invitation
// token is used. The database is asked AS the caller (RLS-scoped /sql, like
// lib/auth/verify-member.ts): org_invitation is readable only by members of the
// store it belongs to, and the caller must be that store's owner or a manager.
// The address, role, store name and inviter all come from those rows, and the
// link always points at this app.
//
// Anyone can sign up and own a store, so ownership alone does not stop a store
// named like a phishing line from mailing strangers in a loop. Two limits do:
// an invitation is emailed only within SEND_WINDOW_MS of being created (every
// caller sends right after inviteToOrg, and a new invitation for the same
// address needs the pending one cancelled first), and a store sends at most
// ORG_SENDS_PER_HOUR per hour from one server instance. The second is
// best-effort (per instance, in memory): a durable per-account cap needs a
// counter in the module.

import { handleOptions, jsonWithCors } from "@/lib/api-cors";
import { requestToken, verifyActiveMember } from "@/lib/auth/verify-member";
import { sendTeamInviteEmail } from "@/lib/email/resend";
import { spacetimeSql } from "@/lib/spacetimedb/sql";
import { firstRow, SQL_UUID_RE, sqlIsSome, sqlMicros } from "@/lib/spacetimedb/sql-values";

export const OPTIONS = handleOptions;

// inviteToOrg stores any role string; only these three are ever emailed (the
// email shows a fixed word for each, never the stored text).
const ROLES = new Set(["owner", "manager", "staff"]);
const SEND_WINDOW_MS = 15 * 60 * 1000;
const ORG_SENDS_PER_HOUR = 30;
const HOUR_MS = 60 * 60 * 1000;
const sendsByOrg = new Map<string, number[]>();

/** Records a send for `organizationId`; false when it already sent ORG_SENDS_PER_HOUR in the last hour. */
function takeOrgSend(organizationId: string, now: number): boolean {
  const recent = (sendsByOrg.get(organizationId) ?? []).filter((at) => now - at < HOUR_MS);
  if (recent.length >= ORG_SENDS_PER_HOUR) {
    sendsByOrg.set(organizationId, recent);
    return false;
  }
  recent.push(now);
  sendsByOrg.set(organizationId, recent);
  return true;
}

function appOrigin(request: Request): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin).replace(/\/+$/, "");
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  const caller = requestToken(undefined, request.headers.get("authorization"));
  if (!caller) return jsonWithCors(request, { error: "Sign in required" }, { status: 401 });

  const inviteToken = typeof body?.token === "string" ? body.token.trim() : "";
  if (!SQL_UUID_RE.test(inviteToken)) return jsonWithCors(request, { error: "Invalid invitation" }, { status: 400 });

  try {
    // Visible only to members of the invitation's own store (RLS_ORG_SCOPED).
    const invite = firstRow(await spacetimeSql(
      `SELECT organization_id, email, role, expires_at, accepted_at, created_at FROM org_invitation WHERE token = '${inviteToken}'`,
      { token: caller },
    ));
    if (!invite) return jsonWithCors(request, { error: "Invitation not found" }, { status: 404 });
    const [organizationId, email, role, expiresAt, acceptedAt, createdAt] = invite;
    if (typeof organizationId !== "string" || typeof email !== "string" || typeof role !== "string") {
      return jsonWithCors(request, { error: "Invitation unavailable" }, { status: 503 });
    }
    if (!ROLES.has(role)) return jsonWithCors(request, { error: "Invalid invitation role" }, { status: 422 });
    if (sqlIsSome(acceptedAt)) return jsonWithCors(request, { error: "Invitation already used" }, { status: 409 });
    const expires = sqlMicros(expiresAt);
    const now = Date.now();
    if (expires !== null && expires / 1000 < now) {
      return jsonWithCors(request, { error: "Invitation expired" }, { status: 410 });
    }
    const created = sqlMicros(createdAt);
    if (created === null || now - created / 1000 > SEND_WINDOW_MS) {
      return jsonWithCors(request, { error: "Invitation emails go out only when the invitation is created" }, { status: 429 });
    }

    const member = await verifyActiveMember(caller, organizationId);
    if (!member.ok) return jsonWithCors(request, { error: member.error }, { status: member.status });
    if (member.access.role !== "owner" && member.access.role !== "manager") {
      return jsonWithCors(request, { error: "Owner or manager required" }, { status: 403 });
    }

    const [orgRow, meRow] = await Promise.all([
      spacetimeSql(`SELECT name FROM organization WHERE org_id_text = '${organizationId}'`, { token: caller }).then(firstRow),
      spacetimeSql(
        `SELECT display_name, email FROM org_member WHERE organization_id = '${organizationId}' AND user_id = :sender AND status = 'active'`,
        { token: caller },
      ).then(firstRow),
    ]);
    const realName = typeof orgRow?.[0] === "string" ? orgRow[0].trim() : "";
    const orgName = realName || "your team";
    const inviter = [meRow?.[0], meRow?.[1]].find((v): v is string => typeof v === "string" && v.trim() !== "")?.trim() ?? "A teammate";

    // `org` only labels the invitation page (the invitee cannot read org_invitation).
    const inviteUrl = `${appOrigin(request)}/invite/${encodeURIComponent(inviteToken)}${realName ? `?${new URLSearchParams({ org: realName })}` : ""}`;
    if (!takeOrgSend(organizationId, now)) {
      return jsonWithCors(request, { error: "Too many invitation emails from this store; try again later" }, { status: 429 });
    }

    await sendTeamInviteEmail({ to: email, inviterEmail: inviter, orgName, role, inviteUrl });
    return jsonWithCors(request, { ok: true });
  } catch (err) {
    // spacetimeSql throws "SpacetimeDB SQL failed (401): …" for a bad or expired caller token.
    if (err instanceof Error && /SQL failed \((401|403)\)/.test(err.message)) {
      return jsonWithCors(request, { error: "Invalid or expired token" }, { status: 401 });
    }
    console.error("[api/team/send-invite-email]", err);
    return jsonWithCors(request, { error: "Failed to send invite email" }, { status: 500 });
  }
}
