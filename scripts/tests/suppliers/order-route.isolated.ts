// app/api/suppliers/order: run in a child process (order-route.test.ts) because
// it mocks lib/email/resend and the service client with mock.module.

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const sent: Array<Record<string, unknown>> = [];
let inboundLookups = 0;
mock.module("@/lib/email/resend", () => ({
  sendSupplierPOEmail: async (args: Record<string, unknown>) => { sent.push(args); },
}));
mock.module("@/lib/spacetimedb/service-client", () => ({
  getServiceConn: async () => ({}),
  getSupplierInboundAddressForOrg: async () => { inboundLookups++; return "store-inbox@in.merchiva.test"; },
}));

const { POST } = await import("@/app/api/suppliers/order/route");

const ORG = "b16e85ac-b740-4e64-8a43-fe8c17b9a7a0";
const SUPPLIER = "8fe070b5-faf9-46ad-9797-7e4516d953fb";
let world: { role: string | null; supplier: unknown[] | null };
const realFetch = globalThis.fetch;

beforeEach(() => {
  sent.length = 0;
  inboundLookups = 0;
  world = { role: "manager", supplier: ["Dairy Co", [0, "orders@dairy.test"], [0, "Sam"], [0, "zh"]] };
  globalThis.fetch = (async (_url: string, init: { body: string; headers: Record<string, string> }) => {
    if (init.headers.Authorization !== "Bearer caller-token") return new Response("no", { status: 401 });
    const q = init.body;
    const rows = q.includes("SELECT role, permissions FROM org_member")
      ? (world.role ? [[world.role, "{}"]] : [])
      : q.includes("FROM supplier")
        ? (world.supplier ? [world.supplier] : [])
        : q.includes("FROM organization")
          ? [["BJ Cafe"]]
          : q.includes("SELECT email FROM org_member")
            ? [["mia@shop.test"]]
            : [];
    return new Response(JSON.stringify([{ schema: { elements: [] }, rows }]), { status: 200 });
  }) as unknown as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; });

const order = (extra: Record<string, unknown> = {}) => ({
  organizationId: ORG, supplierId: SUPPLIER, items: [{ name: "Milk", quantity: 2 }], total: 10, ...extra,
});
function req(body: unknown, headers: Record<string, string> = { Authorization: "Bearer caller-token" }) {
  return new Request("https://app.merchiva.test/api/suppliers/order", {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
  }) as never;
}

describe("POST /api/suppliers/order", () => {
  test("no sign-in sends nothing and never looks up the store's inbox", async () => {
    const res = await POST(req(order({ supplierEmail: "victim@corp.test" }), {}));
    expect(res.status).toBe(401);
    expect(sent).toHaveLength(0);
    expect(inboundLookups).toBe(0);
  });

  test("staff are refused before any lookup", async () => {
    world.role = "staff";
    expect((await POST(req(order()))).status).toBe(403);
    expect(sent).toHaveLength(0);
    expect(inboundLookups).toBe(0);
  });

  test("a non-member of the store is refused", async () => {
    world.role = null;
    expect((await POST(req(order()))).status).toBe(401);
    expect(inboundLookups).toBe(0);
  });

  test("ids that are not uuids never reach the SQL text", async () => {
    expect((await POST(req(order({ supplierId: "x' OR '1'='1" })))).status).toBe(400);
  });

  test("a supplier that is not this store's is not found", async () => {
    world.supplier = null;
    expect((await POST(req(order()))).status).toBe(404);
    expect(sent).toHaveLength(0);
  });

  test("the recipient, names, language and Reply-To come from the database, not the body", async () => {
    const res = await POST(req(order({
      supplierEmail: "victim@corp.test", supplierName: "Evil", orgName: "<b>Payroll</b>", replyTo: "attacker@x.test", contactName: "CEO",
    })));
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    const mail = sent[0];
    expect(mail.to).toBe("orders@dairy.test");
    expect(mail.supplierName).toBe("Dairy Co");
    expect(mail.contactName).toBe("Sam");
    expect(mail.orgName).toBe("BJ Cafe");
    expect(mail.replyTo).toBe("store-inbox@in.merchiva.test");
    expect(mail.language).toBe("zh");
  });

  test("order text is shortened and the item count capped", async () => {
    await POST(req(order({ items: [{ name: "x".repeat(500), quantity: 1 }], notes: "n".repeat(5000) })));
    const mail = sent[0] as { items: Array<{ name: string }>; notes: string };
    expect(mail.items[0].name.length).toBe(120);
    expect(mail.notes.length).toBe(1000);
    const many = Array.from({ length: 101 }, () => ({ name: "Milk", quantity: 1 }));
    expect((await POST(req(order({ items: many })))).status).toBe(400);
  });
});
