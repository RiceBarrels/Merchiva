// Accepting an org invitation from /invite/[token].
//
// The invitee cannot read their invitation first: org_invitation is org-scoped
// RLS, readable only by members of the org that sent it. So the page never
// looks it up; acceptInvitation checks the token, expiry and address in the
// module, and this file turns its refusal into an InviteError the page can word.
//
// The module binds the token to the address it was sent to by comparing with
// the caller's `user.email`. WorkOS sign-ins never wrote that column (the
// onConnect row starts with '' and the setup flow calls createUser with ''),
// so every acceptance was refused as "a different email address". The signed-in
// account's email is recorded first, through createUser — the reducer whose job
// that is.

import { getConnection } from "@/lib/spacetimedb/client";

export type InviteErrorCode =
  | "invalid" | "used" | "expired" | "wrongEmail" | "alreadyMember" | "emailTaken" | "notConnected" | "failed";

export class InviteError extends Error {
  constructor(readonly code: InviteErrorCode, message: string) {
    super(message);
    this.name = "InviteError";
  }
}

/** The module's SenderError text → a code. Anything unrecognised is "failed", with the text kept. */
export function inviteErrorCode(message: string): InviteErrorCode {
  const m = message.toLowerCase();
  if (m.includes("invitation not found")) return "invalid";
  if (m.includes("already used")) return "used";
  if (m.includes("expired")) return "expired";
  if (m.includes("different email")) return "wrongEmail";
  if (m.includes("already a member")) return "alreadyMember";
  if (m.includes("already registered to another account")) return "emailTaken";
  return "failed";
}

/* eslint-disable @typescript-eslint/no-explicit-any -- SpacetimeDB row reads */
function identityHex(v: any): string {
  return typeof v?.toHexString === "function" ? v.toHexString() : String(v ?? "");
}

function micros(v: any): bigint {
  return typeof v?.microsSinceUnixEpoch === "bigint" ? v.microsSinceUnixEpoch : 0n;
}

/**
 * A reducer call on a socket that closes mid-flight never settles (SDK 2.10:
 * the reconnect builds a new connection and orphans the old callbacks), which
 * would leave the page on "Joining…" for good. Give up after this long.
 */
const REDUCER_TIMEOUT_MS = 20_000;

function settleWithin<T>(call: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new InviteError("notConnected", "No answer from the server")), REDUCER_TIMEOUT_MS);
  });
  return Promise.race([call, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Records `email` on the caller's user row (when it differs), accepts the
 * invitation, and resolves with the id of the organization just joined (read
 * from the live cache, which has the new membership once the reducer resolves),
 * or null when it cannot be told.
 *
 * `name` is the account's name from sign-in. acceptInvitation names the new
 * member `user.displayName ?? user.email`, so a user row without a name would
 * make the email address the person's name everywhere — and the manager
 * layout's name prompt only asks when the name is empty. A missing name is
 * therefore recorded as '' rather than left unset.
 */
export async function acceptInvitationAs(token: string, email: string | null, name?: string | null): Promise<string | null> {
  const c = getConnection();
  if (!c?.identity) throw new InviteError("notConnected", "Not connected");
  const me = c.identity.toHexString();
  const normalized = (email ?? "").trim().toLowerCase();
  const before = new Set<string>();
  for (const m of c.db.orgMember.iter() as Iterable<any>) {
    if (identityHex(m.userId) === me && m.status === "active") before.add(m.organizationId);
  }

  try {
    let own: any = null;
    for (const u of c.db.user.iter() as Iterable<any>) if (identityHex(u.identity) === me) own = u;
    const hasName = typeof own?.displayName === "string" && own.displayName.trim() !== "";
    const emailDiffers = normalized !== "" && String(own?.email ?? "").trim().toLowerCase() !== normalized;
    if (emailDiffers || !hasName) {
      await settleWithin(c.reducers.createUser({
        email: emailDiffers ? normalized : String(own?.email ?? normalized),
        passwordHash: undefined,
        // Keep a name the row already has; otherwise the sign-in name, or '' so the layout asks for one.
        displayName: hasName ? undefined : (name ?? "").trim(),
      }));
    }
    await settleWithin(c.reducers.acceptInvitation({ token }));
  } catch (err) {
    if (err instanceof InviteError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new InviteError(inviteErrorCode(message), message);
  }

  const after = getConnection();
  if (!after) return null;
  let joined: { org: string; at: bigint } | null = null;
  for (const m of after.db.orgMember.iter() as Iterable<any>) {
    if (identityHex(m.userId) !== me || m.status !== "active" || before.has(m.organizationId)) continue;
    const at = micros(m.joinedAt);
    if (!joined || at > joined.at) joined = { org: m.organizationId, at };
  }
  return joined?.org ?? null;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
