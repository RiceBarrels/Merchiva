// lib/spacetimedb/actions/invite.ts: accepting from /invite/[token] without
// reading the invitation (org_invitation is org-scoped RLS — the invitee can
// never see it). The module compares the caller's user.email with the
// invitation's address, and WorkOS sign-ins left that column '', so the
// account's email is recorded first.

import { afterEach, describe, expect, test } from "bun:test";
import { acceptInvitationAs, inviteErrorCode, InviteError } from "@/lib/spacetimedb/actions/invite";
import { clearConnection, setConnection } from "@/lib/spacetimedb/client";

const ME = "ab".repeat(32);
const id = (hex: string) => ({ toHexString: () => hex });

function fakeConn(o: { userEmail: string; userName?: string; acceptError?: string; joins?: string; hang?: boolean }) {
  const calls: string[] = [];
  const members: Array<Record<string, unknown>> = [
    { userId: id(ME), organizationId: "old-org", status: "active", joinedAt: { microsSinceUnixEpoch: 1n } },
  ];
  const conn = {
    identity: id(ME),
    db: {
      orgMember: { iter: () => members.values() },
      user: { iter: () => [{ identity: id(ME), email: o.userEmail, displayName: o.userName }].values() },
    },
    reducers: {
      createUser: async (args: { email: string; displayName?: string }) => {
        calls.push(`createUser:${args.email}:${args.displayName === undefined ? "(keep)" : JSON.stringify(args.displayName)}`);
      },
      acceptInvitation: async (args: { token: string }) => {
        calls.push(`accept:${args.token}`);
        if (o.hang) return new Promise<void>(() => {});
        if (o.acceptError) throw new Error(o.acceptError);
        if (o.joins) members.push({ userId: id(ME), organizationId: o.joins, status: "active", joinedAt: { microsSinceUnixEpoch: 9n } });
      },
    },
  };
  setConnection(conn as never);
  return calls;
}

afterEach(() => clearConnection());

describe("acceptInvitationAs", () => {
  test("records the signed-in email and name before accepting, and returns the store just joined", async () => {
    const calls = fakeConn({ userEmail: "", joins: "new-org" });
    expect(await acceptInvitationAs("tok", " Ann@Example.com ", "Ann Lee")).toBe("new-org");
    expect(calls).toEqual(['createUser:ann@example.com:"Ann Lee"', "accept:tok"]);
  });

  test("with no sign-in name, records '' so the member is asked for one instead of being named by email", async () => {
    const calls = fakeConn({ userEmail: "" });
    await acceptInvitationAs("tok", "ann@example.com", null);
    expect(calls[0]).toBe('createUser:ann@example.com:""');
  });

  test("keeps an existing name, and skips createUser when email and name are already there", async () => {
    let calls = fakeConn({ userEmail: "", userName: "Annie" });
    await acceptInvitationAs("tok", "ann@example.com", "Ann Lee");
    expect(calls[0]).toBe("createUser:ann@example.com:(keep)");
    calls = fakeConn({ userEmail: "ann@example.com", userName: "Annie", joins: "new-org" });
    await acceptInvitationAs("tok", "ann@example.com", "Ann Lee");
    expect(calls).toEqual(["accept:tok"]);
  });

  test("the module's refusal becomes a coded InviteError", async () => {
    fakeConn({ userEmail: "ann@example.com", userName: "Ann", acceptError: "Invitation already used" });
    const err = await acceptInvitationAs("tok", "ann@example.com").catch((e) => e);
    expect(err).toBeInstanceOf(InviteError);
    expect((err as InviteError).code).toBe("used");
  });

  test("a reducer call that never answers gives up as notConnected", async () => {
    fakeConn({ userEmail: "ann@example.com", userName: "Ann", hang: true });
    const realSetTimeout = globalThis.setTimeout;
    // Fire the 20 s give-up timer at once.
    globalThis.setTimeout = ((fn: () => void) => realSetTimeout(fn, 0)) as typeof setTimeout;
    try {
      const err = await acceptInvitationAs("tok", "ann@example.com").catch((e) => e);
      expect((err as InviteError).code).toBe("notConnected");
    } finally {
      globalThis.setTimeout = realSetTimeout;
    }
  });

  test("no connection is notConnected, not a crash", async () => {
    clearConnection();
    const err = await acceptInvitationAs("tok", "a@b.c").catch((e) => e);
    expect((err as InviteError).code).toBe("notConnected");
  });
});

describe("inviteErrorCode", () => {
  test("maps every acceptInvitation / createUser refusal", () => {
    expect(inviteErrorCode("Invitation not found")).toBe("invalid");
    expect(inviteErrorCode("Invitation already used")).toBe("used");
    expect(inviteErrorCode("Invitation expired")).toBe("expired");
    expect(inviteErrorCode("This invitation was sent to a different email address")).toBe("wrongEmail");
    expect(inviteErrorCode("You are already a member of this organization")).toBe("alreadyMember");
    expect(inviteErrorCode("That email is already registered to another account")).toBe("emailTaken");
    expect(inviteErrorCode("Must be logged in")).toBe("failed");
  });
});
