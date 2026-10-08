import { afterEach, describe, expect, test } from "bun:test";
import { memberCheckQuery, requestToken, verifyActiveMember } from "@/lib/auth/verify-member";

const ORG = "3f1c2a9e-8d44-4c1b-9a51-2b7f0e6d1c42";
const realFetch = globalThis.fetch;

type Seen = { url: string; init: RequestInit };

function stubFetch(respond: (seen: Seen) => Response | Promise<Response>): Seen[] {
  const seen: Seen[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const entry = { url: String(input), init: init ?? {} };
    seen.push(entry);
    return respond(entry);
  }) as typeof fetch;
  return seen;
}

function sqlResult(rows: unknown[][]): Response {
  return new Response(JSON.stringify([{ schema: { elements: [] }, rows }]), { status: 200 });
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("verifyActiveMember", () => {
  test("asks the database as the caller, for the caller's own active row of the org", async () => {
    const seen = stubFetch(() => sqlResult([["manager", JSON.stringify({ sales: { view: false } })]]));
    const check = await verifyActiveMember("jwt-token", ORG);
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toEndWith("/sql");
    expect((seen[0].init.headers as Record<string, string>).Authorization).toBe("Bearer jwt-token");
    expect(seen[0].init.body).toBe(memberCheckQuery(ORG));
    expect(memberCheckQuery(ORG)).toBe(
      `SELECT role, permissions FROM org_member WHERE organization_id = '${ORG}' AND user_id = :sender AND status = 'active'`,
    );
    // The role and permissions come from that row, merged like the client merges them.
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.access.role).toBe("manager");
    expect(check.access.isOwner).toBe(false);
    expect(check.access.permissions.sales).toEqual({ view: false });
    expect(check.access.permissions.inventory).toEqual({ view: true, edit: false });
  });

  test("an owner row → owner access", async () => {
    stubFetch(() => sqlResult([["owner", "{}"]]));
    const check = await verifyActiveMember("jwt-token", ORG);
    expect(check).toMatchObject({ ok: true, access: { role: "owner", isOwner: true } });
  });

  test("a row that isn't [role, permissions] strings fails closed with 503", async () => {
    stubFetch(() => sqlResult([[{ __uuid__: 1 }]]));
    expect(await verifyActiveMember("t", ORG)).toMatchObject({ ok: false, status: 503 });
    stubFetch(() => sqlResult([["staff", null]]));
    expect(await verifyActiveMember("t", ORG)).toMatchObject({ ok: false, status: 503 });
  });

  test("no visible active row → 401", async () => {
    stubFetch(() => sqlResult([]));
    expect(await verifyActiveMember("jwt-token", ORG)).toMatchObject({ ok: false, status: 401 });
  });

  test("a token the database rejects → 401", async () => {
    stubFetch(() => new Response("Invalid token: InvalidToken", { status: 401 }));
    expect(await verifyActiveMember("forged", ORG)).toMatchObject({ ok: false, status: 401 });
  });

  test("missing token or a malformed org id never reaches the database", async () => {
    const seen = stubFetch(() => sqlResult([[1]]));
    expect(await verifyActiveMember(null, ORG)).toMatchObject({ ok: false, status: 401 });
    expect(await verifyActiveMember("t", "")).toMatchObject({ ok: false, status: 401 });
    expect(await verifyActiveMember("t", "x' OR '1'='1")).toMatchObject({ ok: false, status: 401 });
    expect(seen).toHaveLength(0);
  });

  test("an unreachable or erroring database fails closed with 503", async () => {
    stubFetch(() => {
      throw new Error("ECONNREFUSED");
    });
    expect(await verifyActiveMember("t", ORG)).toMatchObject({ ok: false, status: 503 });
    stubFetch(() => new Response("oops", { status: 500 }));
    expect(await verifyActiveMember("t", ORG)).toMatchObject({ ok: false, status: 503 });
    stubFetch(() => new Response("not json", { status: 200 }));
    expect(await verifyActiveMember("t", ORG)).toMatchObject({ ok: false, status: 503 });
  });
});

describe("requestToken", () => {
  test("prefers the body token, then a Bearer header", () => {
    expect(requestToken(" body ", "Bearer header")).toBe("body");
    expect(requestToken(undefined, "Bearer header")).toBe("header");
    expect(requestToken("", "Basic abc")).toBeNull();
    expect(requestToken(42, null)).toBeNull();
  });
});
