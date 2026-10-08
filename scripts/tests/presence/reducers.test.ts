// upsertPagePresence / removePagePresence: the REAL reducer bodies from
// spacetimedb/src/presence/reducers.ts (no runtime SpacetimeDB imports), run
// over a small in-memory database.
//
// Semantics mirrored from spacetimedb 2.10 (node_modules/spacetimedb/dist/server):
// a primary-key `find` returns the row or NULL — never undefined — for a missing
// row. index.ts's isServiceCaller compares with undefined, so it is true for
// every caller; the first version of these reducers used it and refused every
// real member. Index `filter` returns an iterator; `insert` of an existing key
// and `update` of a missing row throw.

import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  definePagePresenceReducers,
  type PresenceDeps,
  type PresenceSchema,
} from "@/spacetimedb/src/presence/reducers";
import {
  PAGE_PRESENCE_MAX_ROWS_PER_CONNECTION,
  PAGE_PRESENCE_TTL_MICROS,
} from "@/spacetimedb/src/presence/validate";

type Row = Readonly<Record<string, unknown>>;

class FakeIdentity {
  constructor(readonly hex: string = randomUUID().replace(/-/g, "")) {}
  toHexString(): string { return this.hex; }
  isEqual(other: unknown): boolean {
    return other instanceof FakeIdentity && other.hex === this.hex;
  }
}

class FakeSenderError extends Error {
  override name = "SenderError";
}

const keyOf = (value: unknown): string => (value instanceof FakeIdentity ? value.hex : String(value));

class FakeTable {
  readonly rows = new Map<string, Row>();
  readonly [accessor: string]: unknown;

  constructor(pk: string, indexes: Record<string, string>) {
    const rows = this.rows;
    const self = this as unknown as Record<string, unknown>;
    self.insert = (row: Row) => {
      const key = keyOf(row[pk]);
      if (rows.has(key)) throw new Error(`insert: duplicate ${pk} ${key}`);
      rows.set(key, Object.freeze({ ...row }));
      return row;
    };
    self.delete = (row: Row) => rows.delete(keyOf(row[pk]));
    self[pk] = {
      find: (value: unknown) => rows.get(keyOf(value)) ?? null,
      update: (row: Row) => {
        const key = keyOf(row[pk]);
        if (!rows.has(key)) throw new Error(`update: no row ${key}`);
        rows.set(key, Object.freeze({ ...row }));
        return row;
      },
    };
    for (const [accessor, column] of Object.entries(indexes)) {
      self[accessor] = {
        filter: (value: unknown) => [...rows.values()].filter((r) => keyOf(r[column]) === keyOf(value)).values(),
      };
    }
  }
}

type Handler = (ctx: FakeCtx, args: Record<string, unknown>) => void;
interface FakeCtx {
  sender: FakeIdentity;
  connectionId: { toHexString(): string } | null;
  timestamp: { microsSinceUnixEpoch: bigint };
  db: World["db"];
}

const stdb = { reducer: (_params: unknown, fn: Handler) => fn } as unknown as PresenceSchema;
const deps = {
  t: { string: () => ({}), f64: () => ({}), u32: () => ({}) },
  SenderError: FakeSenderError,
} as unknown as PresenceDeps;
const R = definePagePresenceReducers(stdb, deps) as unknown as Record<"upsertPagePresence" | "removePagePresence", Handler>;

const ORG_A = randomUUID();
const ORG_B = randomUUID();
const NOW = 1_800_000_000_000_000n;

interface Person { identity: FakeIdentity; memberId: string }

function createWorld() {
  const db = {
    pagePresence: new FakeTable("id", { byOrganizationId: "organizationId", byConnectionId: "connectionId" }),
    orgMember: new FakeTable("id", { byUserId: "userId", byOrganizationId: "organizationId" }),
    user: new FakeTable("identity", {}),
    serviceIdentity: new FakeTable("identity", {}),
  };
  const insert = (table: FakeTable, row: Row) => (table.insert as (r: Row) => Row)(row);
  return {
    db,
    member(organizationId: string, o: { displayName?: string; email?: string; status?: string; identity?: FakeIdentity; avatarUrl?: string } = {}): Person {
      const identity = o.identity ?? new FakeIdentity();
      const memberId = randomUUID();
      insert(db.orgMember, {
        id: { toString: () => memberId }, organizationId, userId: identity, role: "staff",
        displayName: o.displayName ?? "Ada", email: o.email ?? "ada@example.com", permissions: "{}",
        status: o.status ?? "active",
      });
      if (!db.user.rows.has(identity.hex)) insert(db.user, { identity, email: o.email ?? "ada@example.com", avatarUrl: o.avatarUrl });
      return { identity, memberId };
    },
    service(identity: FakeIdentity = new FakeIdentity()): FakeIdentity {
      insert(db.serviceIdentity, { identity, label: "service" });
      return identity;
    },
    ctx(sender: FakeIdentity, connection: string | null, now: bigint = NOW): FakeCtx {
      return {
        sender,
        connectionId: connection === null ? null : { toHexString: () => connection },
        timestamp: { microsSinceUnixEpoch: now },
        db,
      };
    },
    presence(): Row[] {
      return [...db.pagePresence.rows.values()];
    },
    insertPresence(row: Partial<Row> & { id: string; organizationId: string; connectionId: string; updatedAtMicros: bigint }): void {
      const { updatedAtMicros, ...rest } = row;
      insert(db.pagePresence, { identity: new FakeIdentity(), kind: "user", slot: "", ...rest, updatedAt: { microsSinceUnixEpoch: updatedAtMicros } });
    },
  };
}
type World = ReturnType<typeof createWorld>;

function args(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    organizationId: ORG_A, kind: "user", slot: "", pagePath: "/manager/inventory", anchor: "nav:/manager/inventory",
    anchorX: 0.5, anchorY: 0.25, pointX: 0.1, pointY: 0.9, clickSeq: 0, activity: "", ...overrides,
  };
}

function errorOf(fn: () => void): string {
  try { fn(); } catch (error) { return String((error as Error).message); }
  return "(no error)";
}

describe("upsertPagePresence", () => {
  test("an active member writes their own row, every identity field derived on the server", () => {
    const w = createWorld();
    w.service(); // another identity is the service; `find` answers null for this caller
    const ada = w.member(ORG_A, { displayName: "  Ada\nLovelace ", avatarUrl: "https://img.example.com/ada.png" });
    const ctx = w.ctx(ada.identity, "c1");
    R.upsertPagePresence(ctx, args({ anchorX: 1.5, pointY: -2, clickSeq: 3 }));

    const rows = w.presence();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "c1:user:", organizationId: ORG_A, connectionId: "c1", memberId: ada.memberId, kind: "user", slot: "",
      name: "Ada Lovelace", avatarUrl: "https://img.example.com/ada.png", pagePath: "/manager/inventory",
      anchor: "nav:/manager/inventory", anchorX: 1, anchorY: 0.25, pointX: 0.1, pointY: 0, clickSeq: 3, activity: "",
    });
    expect((rows[0].identity as FakeIdentity).isEqual(ada.identity)).toBe(true);
    expect(rows[0].updatedAt).toBe(ctx.timestamp);
  });

  test("the name falls back to the email, then 'Anonymous'; a non-https avatar is dropped", () => {
    const w = createWorld();
    const byEmail = w.member(ORG_A, { displayName: " ", email: "bo@example.com", avatarUrl: "http://img.example.com/bo.png" });
    const anonymous = w.member(ORG_A, { displayName: "", email: "" });
    R.upsertPagePresence(w.ctx(byEmail.identity, "c1"), args());
    R.upsertPagePresence(w.ctx(anonymous.identity, "c2"), args());
    expect(w.db.pagePresence.rows.get("c1:user:")).toMatchObject({ name: "bo@example.com", avatarUrl: "" });
    expect(w.db.pagePresence.rows.get("c2:user:")).toMatchObject({ name: "Anonymous", avatarUrl: "" });
  });

  test("refuses the service identity, even when it also holds a member row", () => {
    const w = createWorld();
    const service = w.service();
    w.member(ORG_A, { identity: service });
    expect(errorOf(() => R.upsertPagePresence(w.ctx(service, "c1"), args()))).toBe("The service identity has no page presence");
    expect(w.presence()).toHaveLength(0);
  });

  test("refuses anyone who is not an active member of that organization", () => {
    const w = createWorld();
    const outsider = new FakeIdentity();
    const otherStore = w.member(ORG_B);
    const disabled = w.member(ORG_A, { status: "disabled" });
    for (const who of [outsider, otherStore.identity, disabled.identity]) {
      expect(errorOf(() => R.upsertPagePresence(w.ctx(who, "c1"), args()))).toBe("Not an active member of this organization");
    }
    expect(w.presence()).toHaveLength(0);
  });

  test("refuses a call without a live connection, and fields outside the rules", () => {
    const w = createWorld();
    const ada = w.member(ORG_A);
    expect(errorOf(() => R.upsertPagePresence(w.ctx(ada.identity, null), args()))).toBe("Presence requires a live connection");
    expect(errorOf(() => R.upsertPagePresence(w.ctx(ada.identity, "c1"), args({ kind: "bot" })))).toContain("kind");
    expect(errorOf(() => R.upsertPagePresence(w.ctx(ada.identity, "c1"), args({ kind: "agent", slot: "" })))).toBe("Invalid presence slot");
    expect(errorOf(() => R.upsertPagePresence(w.ctx(ada.identity, "c1"), args({ pagePath: "/store" })))).toContain("/manager");
    expect(w.presence()).toHaveLength(0);
  });

  test("a second upsert from the same connection and slot updates the row", () => {
    const w = createWorld();
    const ada = w.member(ORG_A);
    R.upsertPagePresence(w.ctx(ada.identity, "c1"), args());
    R.upsertPagePresence(w.ctx(ada.identity, "c1", NOW + 1_000_000n), args({ pagePath: "/manager/sales", clickSeq: 1 }));
    expect(w.presence()).toHaveLength(1);
    expect(w.db.pagePresence.rows.get("c1:user:")).toMatchObject({ pagePath: "/manager/sales", clickSeq: 1 });
  });

  test("caps the rows one connection may hold, yet still updates an existing one", () => {
    const w = createWorld();
    const ada = w.member(ORG_A);
    const ctx = w.ctx(ada.identity, "c1");
    R.upsertPagePresence(ctx, args());
    for (let i = 1; i < PAGE_PRESENCE_MAX_ROWS_PER_CONNECTION; i++) {
      R.upsertPagePresence(ctx, args({ kind: "agent", slot: `tab-${i}`, activity: "viewSales" }));
    }
    expect(w.presence()).toHaveLength(PAGE_PRESENCE_MAX_ROWS_PER_CONNECTION);
    expect(errorOf(() => R.upsertPagePresence(ctx, args({ kind: "agent", slot: "one-too-many" }))))
      .toBe("Too many presence rows for this connection");
    R.upsertPagePresence(ctx, args({ kind: "agent", slot: "tab-1", activity: "viewFinance" }));
    expect(w.db.pagePresence.rows.get("c1:agent:tab-1")).toMatchObject({ activity: "viewFinance" });
    // Another connection of the same person has its own budget.
    R.upsertPagePresence(w.ctx(ada.identity, "c2"), args());
    expect(w.presence()).toHaveLength(PAGE_PRESENCE_MAX_ROWS_PER_CONNECTION + 1);
  });

  test("sweeps its own organization's rows older than the TTL, and nothing else", () => {
    const w = createWorld();
    const ada = w.member(ORG_A);
    w.insertPresence({ id: "old:user:", organizationId: ORG_A, connectionId: "old", updatedAtMicros: NOW - PAGE_PRESENCE_TTL_MICROS - 1n });
    w.insertPresence({ id: "edge:user:", organizationId: ORG_A, connectionId: "edge", updatedAtMicros: NOW - PAGE_PRESENCE_TTL_MICROS });
    w.insertPresence({ id: "other:user:", organizationId: ORG_B, connectionId: "other", updatedAtMicros: 0n });
    R.upsertPagePresence(w.ctx(ada.identity, "c1"), args());
    expect(w.presence().map((r) => r.id).sort()).toEqual(["c1:user:", "edge:user:", "other:user:"]);
  });
});

describe("removePagePresence", () => {
  test("deletes only the calling connection's own row", () => {
    const w = createWorld();
    const ada = w.member(ORG_A);
    const bo = w.member(ORG_A);
    R.upsertPagePresence(w.ctx(ada.identity, "c1"), args());
    R.upsertPagePresence(w.ctx(ada.identity, "c1"), args({ kind: "agent", slot: "tab-1" }));
    R.upsertPagePresence(w.ctx(bo.identity, "c2"), args());

    R.removePagePresence(w.ctx(bo.identity, "c2"), { kind: "user", slot: "" });
    expect(w.presence().map((r) => r.id).sort()).toEqual(["c1:agent:tab-1", "c1:user:"]);
    R.removePagePresence(w.ctx(ada.identity, "c1"), { kind: "agent", slot: "tab-1" });
    expect(w.presence().map((r) => r.id)).toEqual(["c1:user:"]);
  });

  test("does nothing without a connection, for an unknown kind, or for another identity's row", () => {
    const w = createWorld();
    const ada = w.member(ORG_A);
    R.upsertPagePresence(w.ctx(ada.identity, "c1"), args());
    R.removePagePresence(w.ctx(ada.identity, null), { kind: "user", slot: "" });
    R.removePagePresence(w.ctx(ada.identity, "c1"), { kind: "bot", slot: "" });
    R.removePagePresence(w.ctx(new FakeIdentity(), "c1"), { kind: "user", slot: "" });
    expect(w.presence().map((r) => r.id)).toEqual(["c1:user:"]);
  });
});

describe("module wiring", () => {
  const MODULE_SRC = join(import.meta.dir, "..", "..", "..", "spacetimedb", "src");
  const INDEX_SRC = readFileSync(join(MODULE_SRC, "index.ts"), "utf8");
  const REDUCERS_SRC = readFileSync(join(MODULE_SRC, "presence", "reducers.ts"), "utf8");

  test("index.ts only exports the factory's reducers; the bodies live in presence/reducers.ts", () => {
    expect(INDEX_SRC).toContain(
      "export const { upsertPagePresence, removePagePresence } = definePagePresenceReducers(spacetimedb, { t, SenderError });",
    );
    expect(INDEX_SRC).not.toMatch(/const (upsertPagePresence|removePagePresence) = spacetimedb\.reducer/);
    expect(INDEX_SRC).not.toContain("./presence/validate");
  });

  test("presence/reducers.ts imports index.ts for types only, never at runtime", () => {
    const fromIndex = [...REDUCERS_SRC.matchAll(/^import (.*) from '\.\.\/index';$/gm)].map((m) => m[1]);
    expect(fromIndex.length).toBeGreaterThan(0);
    for (const clause of fromIndex) expect(clause.startsWith("type ")).toBe(true);
    expect(REDUCERS_SRC).not.toMatch(/^import (?!type )[^;]*from 'spacetimedb/m);
  });
});
