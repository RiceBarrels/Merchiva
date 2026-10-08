// app/api/team/send-invite-email: run in a child process (send-invite-email.test.ts)
// because it mocks lib/email/resend with mock.module.

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const sent: Array<Record<string, unknown>> = [];
mock.module("@/lib/email/resend", () => ({
  sendTeamInviteEmail: async (args: Record<string, unknown>) => { sent.push(args); },
}));

process.env.NEXT_PUBLIC_APP_URL = "https://app.merchiva.test";
const { POST } = await import("@/app/api/team/send-invite-email/route");

const TOKEN = "11111111-2222-4333-8444-555555555555";
const ORG = "b16e85ac-b740-4e64-8a43-fe8c17b9a7a0";
const ORG2 = "9721ea96-be6f-4459-823b-f920d2206242";
const FUTURE = (Date.now() + 86_400_000) * 1000;
const JUST_NOW = (Date.now() - 60_000) * 1000;
const LONG_AGO = (Date.now() - 3_600_000) * 1000;

interface World { callerRole: string | null; invite: unknown[] | null; badToken?: boolean }
let world: World;
const realFetch = globalThis.fetch;

beforeEach(() => {
  sent.length = 0;
  world = { callerRole: "manager", invite: [ORG, "new@shop.com", "staff", [FUTURE], [1, []], [JUST_NOW]] };
  globalThis.fetch = (async (_url: string, init: { body: string; headers: Record<string, string> }) => {
    if (world.badToken || init.headers.Authorization !== "Bearer caller-token") return new Response("no", { status: 401 });
    const q = init.body;
    const rows = q.includes("FROM org_invitation")
      ? (world.invite ? [world.invite] : [])
      : q.includes("SELECT role, permissions FROM org_member")
        ? (world.callerRole ? [[world.callerRole, "{}"]] : [])
        : q.includes("FROM organization")
          ? [["BJ Cafe"]]
          : q.includes("SELECT display_name, email FROM org_member")
            ? [["Mia", "mia@shop.com"]]
            : [];
    return new Response(JSON.stringify([{ schema: { elements: [] }, rows }]), { status: 200 });
  }) as unknown as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; });

function req(body: unknown, headers: Record<string, string> = { Authorization: "Bearer caller-token" }) {
  return new Request("https://app.merchiva.test/api/team/send-invite-email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://evil.example", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/team/send-invite-email", () => {
  test("no sign-in is refused, and nothing is sent", async () => {
    const res = await POST(req({ token: TOKEN, to: "victim@corp.com" }, {}));
    expect(res.status).toBe(401);
    expect(sent).toHaveLength(0);
  });

  test("an invalid caller token is 401", async () => {
    world.badToken = true;
    expect((await POST(req({ token: TOKEN }))).status).toBe(401);
  });

  test("a token the caller's store does not own is not found", async () => {
    world.invite = null;
    expect((await POST(req({ token: TOKEN }))).status).toBe(404);
    expect(sent).toHaveLength(0);
  });

  test("staff cannot send", async () => {
    world.callerRole = "staff";
    expect((await POST(req({ token: TOKEN }))).status).toBe(403);
    expect(sent).toHaveLength(0);
  });

  test("used and expired invitations are refused", async () => {
    world.invite = [ORG, "new@shop.com", "staff", [FUTURE], [0, [123]], [JUST_NOW]];
    expect((await POST(req({ token: TOKEN }))).status).toBe(409);
    world.invite = [ORG, "new@shop.com", "staff", [1000], [1, []], [JUST_NOW]];
    expect((await POST(req({ token: TOKEN }))).status).toBe(410);
  });

  test("everything in the email comes from the database; the body and Origin are ignored", async () => {
    const res = await POST(req({
      token: TOKEN, to: "victim@corp.com", orgName: "<a href=x>Payroll</a>", inviterEmail: "ceo@corp.com", role: "owner",
    }));
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    const mail = sent[0];
    expect(mail.to).toBe("new@shop.com");
    expect(mail.role).toBe("staff");
    expect(mail.orgName).toBe("BJ Cafe");
    expect(mail.inviterEmail).toBe("Mia");
    expect(mail.inviteUrl).toBe(`https://app.merchiva.test/invite/${TOKEN}?org=BJ+Cafe`);
  });

  test("an invitation is emailed only right after it was created", async () => {
    world.invite = [ORG, "new@shop.com", "staff", [FUTURE], [1, []], [LONG_AGO]];
    expect((await POST(req({ token: TOKEN }))).status).toBe(429);
    expect(sent).toHaveLength(0);
  });

  test("a store's sends are capped per hour", async () => {
    world.invite = [ORG2, "new@shop.com", "staff", [FUTURE], [1, []], [JUST_NOW]];
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) statuses.push((await POST(req({ token: TOKEN }))).status);
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
  });

  test("a role outside owner / manager / staff is never emailed", async () => {
    world.invite = [ORG, "new@shop.com", "staff. SECURITY NOTICE: verify at https://evil.example", [FUTURE], [1, []], [JUST_NOW]];
    expect((await POST(req({ token: TOKEN }))).status).toBe(422);
    expect(sent).toHaveLength(0);
  });

  test("a malformed token never reaches the SQL text", async () => {
    expect((await POST(req({ token: "x' OR '1'='1" }))).status).toBe(400);
  });
});
