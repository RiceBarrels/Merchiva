// Test harness for the Drive module code: in-memory SpacetimeDB tables that the
// REAL module functions run against — the drive/*.ts files imported directly
// (they have no runtime SpacetimeDB imports) and index.ts reducers / helpers
// extracted by ../docs/server-source.ts (`loadModule`).
//
// Semantics mirrored from spacetimedb 2.10 (node_modules/spacetimedb/dist/lib):
// - `<pk>.find` returns the row or null; index `filter` returns an iterator
//   (snapshotted here, so deleting while iterating is safe);
// - `insert` of an existing primary key throws; `<pk>.update` of a missing row throws;
// - a reducer is one transaction: a throw rolls back every write (`run`).
// Rows are frozen, so module code that mutates a stored row in place fails here.
//
// `createDriveWorld()` seeds TWO organizations (owner, manager, staff each), so
// every test can check that nothing crosses the tenant boundary.

import { randomBytes, randomUUID } from "node:crypto";
import { loadServerDeclarations } from "../docs/server-source";
import compat from "../fixtures/client-compat-tables.json";

export type Row = Readonly<Record<string, unknown>>;

// ── SDK value stand-ins ──────────────────────────────────────────────────────

export class FakeIdentity {
  constructor(readonly hex: string) {}
  static random(): FakeIdentity {
    return new FakeIdentity(randomBytes(32).toString("hex"));
  }
  toHexString(): string { return this.hex; }
  toString(): string { return this.hex; }
  isEqual(other: unknown): boolean {
    return !!other && typeof (other as { toHexString?: unknown }).toHexString === "function"
      && (other as { toHexString(): string }).toHexString() === this.hex;
  }
}

export class FakeUuid {
  constructor(private readonly value: string = randomUUID()) {}
  toString(): string { return this.value; }
}

export class FakeTimestamp {
  constructor(readonly microsSinceUnixEpoch: bigint) {}
  toDate(): Date { return new Date(Number(this.microsSinceUnixEpoch / 1000n)); }
}

export class FakeSenderError extends Error {
  name = "SenderError";
}

type FakeBound = { tag: "included" | "excluded"; value: unknown } | { tag: "unbounded" };

/** The SDK `Range` (spacetimedb/server): a btree index `filter` given one scans [from, to] in key order. */
export class FakeRange {
  readonly from: FakeBound;
  readonly to: FakeBound;
  constructor(from?: FakeBound | null, to?: FakeBound | null) {
    this.from = from ?? { tag: "unbounded" };
    this.to = to ?? { tag: "unbounded" };
  }
}

/** `t.string()`, `t.option(t.u64())`, `.primaryKey()`… only describe argument types. */
export const typeBuilder: unknown = new Proxy(function typeBuilderStub() {}, {
  get: () => typeBuilder,
  apply: () => typeBuilder,
});

/** The service identity (the /merchivaAdmin + cron identity); recognised only once registered in service_identity. */
export const SERVICE_IDENTITY = new FakeIdentity("5e".repeat(32));

type ReducerFn = (ctx: FakeReducerCtx, args: Record<string, unknown>) => void;
/** `ctx.db.serviceIdentity` (a FakeTable handle; `ctx.db` is untyped) seen through its primary key. */
type FakePkHandle = { readonly identity: { find(value: unknown): Row | null } };

/** Free variables of extracted index.ts code: `spacetimedb.reducer(params, fn)` → fn. */
export function moduleStubs(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    spacetimedb: {
      reducer: (_params: unknown, fn: ReducerFn) => fn,
      clientDisconnected: (fn: (ctx: FakeReducerCtx) => void) => fn,
      clientConnected: (fn: (ctx: FakeReducerCtx) => void) => fn,
    },
    t: typeBuilder,
    SenderError: FakeSenderError,
    Range: FakeRange,
    // Same check as the real helper: a registered service_identity row (find → null on a miss).
    isServiceCaller: (ctx: FakeReducerCtx) => (ctx.db.serviceIdentity as FakePkHandle).identity.find(ctx.sender) != null,
    ...overrides,
  };
}

/** Register SERVICE_IDENTITY in service_identity, as registerServiceIdentity does; isServiceCaller recognises it only then. */
export function registerServiceIdentity(db: FakeDb): void {
  if (db.find("serviceIdentity", SERVICE_IDENTITY)) return;
  db.insert("serviceIdentity", { identity: SERVICE_IDENTITY, label: "test", registeredAt: new FakeTimestamp(db.nowMicros) });
}

/** Extract index.ts declarations (import-following included); throws when one is missing, so nothing is silently skipped. */
export function loadModule(names: readonly string[], overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const decls = loadServerDeclarations(names, moduleStubs(overrides));
  if (!decls) throw new Error(`spacetimedb/src/index.ts does not define all of: ${names.join(", ")}`);
  return decls;
}

// ── Schema ───────────────────────────────────────────────────────────────────

export interface FakeTableDef {
  readonly accessor: string;
  readonly primaryKey: string;
  readonly autoInc?: boolean;
  /** index accessor → column */
  readonly indexes: Readonly<Record<string, string>>;
  /** When set, the only columns a row may carry: writing any other throws. */
  readonly columns?: readonly string[];
}

/**
 * The column names of a table old clients decode (scripts/tests/fixtures/client-compat-tables.json).
 * A fake table given them refuses any other column, so module code that writes a
 * field into a frozen table fails here as it would break old clients there.
 */
export function frozenColumns(table: string): readonly string[] {
  const columns = (compat.tables as Record<string, Array<[string, string]>>)[table];
  if (!columns) throw new Error(`fake-db: ${table} is not a frozen table`);
  return columns.map(([name]) => name);
}

/** The tables Drive, the access indexes and the Docs helpers touch (index.ts + drive/tables.ts definitions). */
export const DRIVE_FAKE_TABLES: readonly FakeTableDef[] = [
  { accessor: "user", primaryKey: "identity", indexes: { byEmail: "email" } },
  { accessor: "userSecret", primaryKey: "identity", indexes: {} },
  { accessor: "organization", primaryKey: "id", indexes: { byOwnerId: "ownerId", byOrgIdText: "orgIdText" } },
  { accessor: "settings", primaryKey: "id", indexes: { byOrganizationId: "organizationId" } },
  { accessor: "staffRole", primaryKey: "id", indexes: { byOrganizationId: "organizationId" } },
  // Identity-keyed rows loginWithPassword migrates.
  { accessor: "staffAvailability", primaryKey: "id", indexes: { byOrganizationId: "organizationId", byUserId: "userId" } },
  { accessor: "timeOffRequest", primaryKey: "id", indexes: { byOrganizationId: "organizationId", byUserId: "userId" } },
  { accessor: "chatMember", primaryKey: "id", indexes: { byConversationId: "conversationId", byUserId: "userId" } },
  { accessor: "chatMembershipIndex", primaryKey: "chatMemberId", indexes: { byConversationId: "conversationId", byUserId: "userId" } },
  { accessor: "todo", primaryKey: "id", indexes: { byOrganizationId: "organizationId", byUserId: "userId" } },
  { accessor: "bugReport", primaryKey: "id", indexes: { byOrganizationId: "organizationId", byReporterId: "reporterId" } },
  { accessor: "pushSubscription", primaryKey: "id", indexes: { byOrganizationId: "organizationId", byTargetId: "targetId" } },
  { accessor: "memberPunchCode", primaryKey: "memberId", indexes: { byOrganizationId: "organizationId", byUserId: "userId" } },
  { accessor: "userBriefingPref", primaryKey: "userId", indexes: {} },
  { accessor: "orgMember", primaryKey: "id", indexes: { byOrganizationId: "organizationId", byUserId: "userId" } },
  { accessor: "orgInvitation", primaryKey: "id", indexes: { byOrganizationId: "organizationId", byToken: "token", byEmail: "email" } },
  { accessor: "orgMembershipIndex", primaryKey: "memberId", indexes: { byOrganizationId: "organizationId", byUserId: "userId" } },
  { accessor: "deviceOperatorSession", primaryKey: "identity", indexes: { byOrganizationId: "organizationId" } },
  { accessor: "serviceIdentity", primaryKey: "identity", indexes: {} },
  { accessor: "migrationState", primaryKey: "name", indexes: {} },
  { accessor: "notification", primaryKey: "id", indexes: { byOrganizationId: "organizationId", byTargetId: "targetId" } },
  { accessor: "document", primaryKey: "id", indexes: { byOrganizationId: "organizationId" }, columns: frozenColumns("document") },
  { accessor: "documentUpdate", primaryKey: "id", autoInc: true, indexes: { byDocumentId: "documentId", byOrganizationId: "organizationId" } },
  { accessor: "documentSnapshot", primaryKey: "documentId", indexes: { byOrganizationId: "organizationId" } },
  { accessor: "documentPresence", primaryKey: "id", indexes: { byDocumentId: "documentId", byConnectionId: "connectionId", byOrganizationId: "organizationId" } },
  { accessor: "documentComment", primaryKey: "id", indexes: { byDocumentId: "documentId", byThreadId: "threadId", byOrganizationId: "organizationId" } },
  { accessor: "documentVersion", primaryKey: "id", indexes: { byDocumentId: "documentId", byOrganizationId: "organizationId" } },
  { accessor: "documentStar", primaryKey: "id", indexes: { byDocumentId: "documentId", byOrganizationId: "organizationId" } },
  { accessor: "documentAccess", primaryKey: "id", indexes: { byDocumentId: "documentId", byOrganizationId: "organizationId" } },
  { accessor: "driveItem", primaryKey: "id", indexes: {
    byOrganizationId: "organizationId", byOwnerMemberId: "ownerMemberId", byAdminScope: "adminScope", byParentId: "parentId",
    byStatus: "status", byTrashed: "trashed", byTrashRootId: "trashRootId", byUploaderIdentity: "uploaderIdentity",
    byTrashRootAt: "trashRootAt" } },
  { accessor: "driveOrgState", primaryKey: "organizationId", indexes: {} },
  { accessor: "driveAdminIndex", primaryKey: "id", indexes: { byAdminScope: "adminScope", byUserId: "userId" } },
  { accessor: "documentReaderIndex", primaryKey: "id", indexes: { byDocumentId: "documentId", byUserId: "userId" } },
  { accessor: "driveUsage", primaryKey: "organizationId", indexes: { byScope: "scope" } },
  { accessor: "driveStar", primaryKey: "id", indexes: { byItemId: "itemId", byOrganizationId: "organizationId" } },
  { accessor: "driveNoticeAck", primaryKey: "id", indexes: { byOrganizationId: "organizationId", byMemberId: "memberId", byUserId: "userId" } },
  { accessor: "driveServiceReader", primaryKey: "identityHex", indexes: { byScope: "scope", byUserId: "userId" } },
  { accessor: "driveBlobGc", primaryKey: "blobKey", indexes: { byScope: "scope", byItemId: "itemId", byAction: "action", byOrganizationId: "organizationId" } },
  { accessor: "documentEditLease", primaryKey: "documentId", indexes: { byOrganizationId: "organizationId", byHolderConnectionId: "holderConnectionId", byRequestedByConnectionId: "requestedByConnectionId" } },
  { accessor: "documentVersionState", primaryKey: "versionId", indexes: { byDocumentId: "documentId", byOrganizationId: "organizationId" } },
  // A document's Drive type and folder (drive/document-file.ts); no row = a text document at its space's root.
  { accessor: "documentFile", primaryKey: "documentId", indexes: { byOrganizationId: "organizationId" } },
];

/** Index / primary-key comparison key: bigints, identities (by hex) and everything else by string form. */
export function keyOf(value: unknown): string {
  if (typeof value === "bigint") return `n${value}`;
  if (value && typeof value === "object" && typeof (value as { toHexString?: unknown }).toHexString === "function") {
    return `h${(value as { toHexString(): string }).toHexString()}`;
  }
  return `s${String(value)}`;
}

/** Btree order of two scalar keys (bigint, number or string, never mixed within one column). */
function compareKeys(a: unknown, b: unknown): number {
  if (typeof a !== typeof b || (typeof a !== "bigint" && typeof a !== "number" && typeof a !== "string")) {
    throw new Error(`fake-db: range over non-scalar keys ${typeof a} / ${typeof b}`);
  }
  return (a as string) < (b as string) ? -1 : (a as string) > (b as string) ? 1 : 0;
}

function inRange(value: unknown, range: FakeRange): boolean {
  const { from, to } = range;
  if (from.tag !== "unbounded") {
    const c = compareKeys(value, from.value);
    if (c < 0 || (c === 0 && from.tag === "excluded")) return false;
  }
  if (to.tag !== "unbounded") {
    const c = compareKeys(value, to.value);
    if (c > 0 || (c === 0 && to.tag === "excluded")) return false;
  }
  return true;
}

type Journal = Map<FakeTable, Map<string, Row | undefined>>;

export class FakeTable {
  readonly rows = new Map<string, Row>();
  readonly handle: Record<string, unknown>;
  private nextAutoInc = 1n;

  constructor(
    readonly def: FakeTableDef,
    private readonly onWrite: (table: FakeTable, key: string) => void,
  ) {
    const pk = def.primaryKey;
    const handle: Record<string, unknown> = {
      insert: (row: Record<string, unknown>) => this.insert(row),
      delete: (row: Row) => this.deleteKey(row[pk]),
      iter: () => [...this.rows.values()].values(),
      count: () => BigInt(this.rows.size),
      [Symbol.iterator]: () => [...this.rows.values()].values(),
      [pk]: {
        find: (value: unknown) => this.rows.get(keyOf(value)) ?? null,
        update: (row: Record<string, unknown>) => this.update(row),
        delete: (value: unknown) => this.deleteKey(value),
      },
    };
    for (const [accessor, column] of Object.entries(def.indexes)) {
      handle[accessor] = {
        filter: (value: unknown) => {
          if (!(value instanceof FakeRange)) {
            return [...this.rows.values()].filter((row) => keyOf(row[column]) === keyOf(value)).values();
          }
          return [...this.rows.values()].filter((row) => inRange(row[column], value))
            .sort((a, b) => compareKeys(a[column], b[column])).values();
        },
      };
    }
    this.handle = handle;
  }

  private checkColumns(row: Record<string, unknown>): void {
    const allowed = this.def.columns;
    const unknown = allowed ? Object.keys(row).filter((column) => !allowed.includes(column)) : [];
    if (unknown.length > 0) throw new Error(`${this.def.accessor}: no column ${unknown.join(", ")} (frozen table)`);
  }

  private insert(row: Record<string, unknown>): Row {
    this.checkColumns(row);
    const pk = this.def.primaryKey;
    const next: Record<string, unknown> = { ...row };
    if (this.def.autoInc) {
      const id = next[pk];
      if (id === 0n || id === undefined) next[pk] = this.nextAutoInc++;
      else if (typeof id === "bigint" && id >= this.nextAutoInc) this.nextAutoInc = id + 1n;
    }
    const key = keyOf(next[pk]);
    if (this.rows.has(key)) throw new Error(`${this.def.accessor}: duplicate primary key ${key}`);
    this.onWrite(this, key);
    const frozen = Object.freeze(next);
    this.rows.set(key, frozen);
    return frozen;
  }

  private update(row: Record<string, unknown>): Row {
    this.checkColumns(row);
    const key = keyOf(row[this.def.primaryKey]);
    if (!this.rows.has(key)) throw new Error(`${this.def.accessor}: update of a missing row ${key}`);
    this.onWrite(this, key);
    const frozen = Object.freeze({ ...row });
    this.rows.set(key, frozen);
    return frozen;
  }

  private deleteKey(value: unknown): boolean {
    const key = keyOf(value);
    if (!this.rows.has(key)) return false;
    this.onWrite(this, key);
    this.rows.delete(key);
    return true;
  }
}

// ── Database ─────────────────────────────────────────────────────────────────

export interface FakeReducerCtx {
  db: Record<string, unknown>;
  sender: FakeIdentity;
  connectionId: FakeIdentity | null;
  timestamp: FakeTimestamp;
  newUuidV4(): FakeUuid;
}

export interface FakeMember {
  readonly memberId: string;
  readonly identity: FakeIdentity;
  readonly organizationId: string;
  readonly role: string;
}

export interface MemberInput {
  organizationId: string;
  role?: string;
  permissions?: string;
  status?: string;
  displayName?: string;
  email?: string;
  /** Reuse an identity (the same person in two orgs, or a second membership row). */
  identity?: FakeIdentity;
}

/** 2025-10-09T08:53:20Z — a fixed start so TTL tests are deterministic. */
export const FAKE_EPOCH_MICROS = 1_760_000_000_000_000n;

export class FakeDb {
  readonly db: Record<string, unknown> = {};
  private readonly tables = new Map<string, FakeTable>();
  private journal: Journal | null = null;
  private clock = FAKE_EPOCH_MICROS;

  constructor(defs: readonly FakeTableDef[] = DRIVE_FAKE_TABLES) {
    for (const def of defs) {
      const table = new FakeTable(def, (t, key) => this.recordWrite(t, key));
      this.tables.set(def.accessor, table);
      this.db[def.accessor] = table.handle;
    }
  }

  /** The current clock; each ctx() takes a fresh, strictly later timestamp unless given one. */
  get nowMicros(): bigint { return this.clock; }
  advance(micros: bigint): void { this.clock += micros; }

  table(accessor: string): FakeTable {
    const table = this.tables.get(accessor);
    if (!table) throw new Error(`fake-db: unknown table ${accessor}`);
    return table;
  }

  rows(accessor: string): Row[] { return [...this.table(accessor).rows.values()]; }
  find(accessor: string, key: unknown): Row | null { return this.table(accessor).rows.get(keyOf(key)) ?? null; }

  /** One transaction: every write of `body` is rolled back when it throws (then the error is rethrown). */
  transact<T>(body: (db: Record<string, unknown>) => T): T {
    if (this.journal) throw new Error("fake-db: nested transaction");
    const journal: Journal = new Map();
    this.journal = journal;
    try {
      return body(this.db);
    } catch (error) {
      for (const [table, befores] of journal) {
        for (const [key, before] of befores) {
          if (before === undefined) table.rows.delete(key);
          else table.rows.set(key, before);
        }
      }
      throw error;
    } finally {
      this.journal = null;
    }
  }

  /** A fixture row outside any reducer. */
  insert(accessor: string, row: Record<string, unknown>): Row {
    return this.transact((db) => (db[accessor] as { insert(r: Record<string, unknown>): Row }).insert(row));
  }

  /** A fixture change outside any reducer: the stored row (by primary key) with `patch` applied. */
  patch(accessor: string, key: unknown, patch: Record<string, unknown>): Row {
    const table = this.table(accessor);
    const current = table.rows.get(keyOf(key));
    if (!current) throw new Error(`fake-db: no ${accessor} row ${String(key)}`);
    const byPk = table.handle[table.def.primaryKey] as { update(r: Record<string, unknown>): Row };
    return this.transact(() => byPk.update({ ...current, ...patch }));
  }

  ctx(sender: FakeIdentity, opts: { atMicros?: bigint; connectionId?: FakeIdentity | null } = {}): FakeReducerCtx {
    if (opts.atMicros === undefined) this.clock += 1n;
    else if (opts.atMicros > this.clock) this.clock = opts.atMicros;
    return {
      db: this.db,
      sender,
      connectionId: opts.connectionId === undefined ? FakeIdentity.random() : opts.connectionId,
      timestamp: new FakeTimestamp(opts.atMicros ?? this.clock),
      newUuidV4: () => new FakeUuid(),
    };
  }

  /** Run a reducer body (or any `(ctx, args)` function) as `sender`, in one transaction. */
  run(fn: unknown, sender: FakeIdentity | FakeMember, args: Record<string, unknown> = {}, opts: { atMicros?: bigint; connectionId?: FakeIdentity | null } = {}): void {
    const identity = sender instanceof FakeIdentity ? sender : sender.identity;
    const ctx = this.ctx(identity, opts);
    this.transact(() => (fn as ReducerFn)(ctx, args));
  }

  addMember(input: MemberInput): FakeMember {
    const identity = input.identity ?? FakeIdentity.random();
    const id = new FakeUuid();
    this.insert("orgMember", {
      id, organizationId: input.organizationId, userId: identity, role: input.role ?? "staff",
      displayName: input.displayName ?? "Member", email: input.email ?? `${id.toString().slice(0, 8)}@example.test`,
      permissions: input.permissions ?? "{}", status: input.status ?? "active", joinedAt: new FakeTimestamp(this.clock),
      punchInCode: undefined, hourlyRate: undefined, hourlyRateCents: undefined, hasPunchCode: false,
    });
    if ((input.status ?? "active") === "active") {
      this.insert("orgMembershipIndex", { memberId: id.toString(), organizationId: input.organizationId, userId: identity });
    }
    return { memberId: id.toString(), identity, organizationId: input.organizationId, role: input.role ?? "staff" };
  }

  /** The stored org_member row of a fixture member. */
  member(member: FakeMember): Row {
    const row = this.find("orgMember", member.memberId);
    if (!row) throw new Error(`fake-db: no org_member ${member.memberId}`);
    return row;
  }

  private recordWrite(table: FakeTable, key: string): void {
    if (!this.journal) throw new Error("fake-db: write outside a transaction");
    let befores = this.journal.get(table);
    if (!befores) {
      befores = new Map();
      this.journal.set(table, befores);
    }
    if (!befores.has(key)) befores.set(key, table.rows.get(key));
  }
}

// ── The default world: two organizations ─────────────────────────────────────

export interface SeededOrg {
  readonly organizationId: string;
  readonly owner: FakeMember;
  readonly manager: FakeMember;
  readonly staff: FakeMember;
}

export interface DriveWorld {
  readonly db: FakeDb;
  readonly orgA: SeededOrg;
  readonly orgB: SeededOrg;
}

function seedOrg(db: FakeDb, name: string): SeededOrg {
  const id = new FakeUuid();
  const organizationId = id.toString();
  const owner = db.addMember({ organizationId, role: "owner", displayName: `${name} owner` });
  db.insert("organization", { id, ownerId: owner.identity, name, orgIdText: organizationId, rootOrgId: organizationId, subscriptionStatus: undefined });
  return {
    organizationId,
    owner,
    manager: db.addMember({ organizationId, role: "manager", displayName: `${name} manager` }),
    staff: db.addMember({ organizationId, role: "staff", displayName: `${name} staff` }),
  };
}

/** A fresh database with two organizations, A and B, each with an owner, a manager and a plain staff member. */
export function createDriveWorld(): DriveWorld {
  const db = new FakeDb();
  return { db, orgA: seedOrg(db, "Org A"), orgB: seedOrg(db, "Org B") };
}

/**
 * A document as Drive sees it: its `document` row plus the type and folder of its
 * document_file row ('' and '' when it has none — a text document at its space's root).
 */
export function documentWithFile(db: FakeDb, documentId: string): Row | null {
  const doc = db.find("document", documentId);
  if (!doc) return null;
  const file = db.find("documentFile", documentId);
  return { ...doc, fileType: file?.fileType ?? "", folderId: file?.folderId ?? "" };
}
