// Test harness for the Sheets server (sheets.md §15): the REAL
// spacetimedb/src/drive/sheets.ts factory, wired with the REAL `sheetDeps`
// object of spacetimedb/src/index.ts (extracted by ../../docs/server-source.ts,
// with every index.ts helper it references), over the Drive fake database.
// Throws when the module lacks a name, so no suite can skip silently.

import { gzipSync } from "node:zlib";
import type { DriveSchema } from "../../../../spacetimedb/src/drive/types";
import { defineDriveDocumentReducers } from "../../../../spacetimedb/src/drive/documents";
import { defineDriveReducers } from "../../../../spacetimedb/src/drive/reducers";
import { defineDriveServiceReducers } from "../../../../spacetimedb/src/drive/service";
import { defineDriveTrashReducers } from "../../../../spacetimedb/src/drive/trash";
import { defineSheetReducers, type SheetDeps } from "../../../../spacetimedb/src/drive/sheets";
import {
  DRIVE_FAKE_TABLES, FakeDb, FakeIdentity, FakeTimestamp, FakeUuid, frozenColumns, loadModule, moduleStubs,
  type FakeMember, type FakeTableDef, type Row,
} from "../../drive/fake-db";

/** index.ts code the sheet suites run: the wiring object plus the Docs reducers that carry the sheet hooks. */
export const MODULE = loadModule([
  "sheetDeps", "onDisconnect", "duplicateDocument", "deleteDocumentVersion", "setDocumentVisibility",
  "grantDocumentAccess", "revokeDocumentAccess", "trashDocument", "restoreDocument", "deleteDocumentForever",
  "setMemberStatus", "leaveOrg", "pushDocumentUpdate", "compactDocument", "saveDocumentVersion",
  "createDeviceLoginRequest", "approveDeviceLogin", "consumeDeviceLogin", "docLink",
], { Timestamp: FakeTimestamp });

export const sheetDeps = MODULE.sheetDeps as SheetDeps;
const stdb = moduleStubs().spacetimedb as unknown as DriveSchema;
/** The nine sheet reducers plus the Drive reducers the suites need, all from the real factories. */
export const R = {
  ...defineSheetReducers(stdb, sheetDeps),
  ...defineDriveDocumentReducers(stdb, sheetDeps),
  ...defineDriveReducers(stdb, sheetDeps),
  ...defineDriveTrashReducers(stdb, sheetDeps),
  ...defineDriveServiceReducers(stdb, sheetDeps),
};

/** Tables the Drive fake database does not carry but these suites touch (onDisconnect, QR log-in). */
const SHEET_EXTRA_TABLES: readonly FakeTableDef[] = [
  { accessor: "pagePresence", primaryKey: "id", indexes: { byConnectionId: "connectionId", byOrganizationId: "organizationId" } },
  {
    accessor: "deviceLoginRequest", primaryKey: "id", indexes: { byOrganizationId: "organizationId", byDeviceId: "deviceId", byNonce: "nonce" },
    columns: frozenColumns("device_login_request"),
  },
  { accessor: "deviceLoginRequester", primaryKey: "requestId", indexes: { byRequesterIdentity: "requesterIdentity", byOrganizationId: "organizationId" } },
  { accessor: "deviceOperatorGrant", primaryKey: "key", indexes: { byOrganizationId: "organizationId" } },
];

export interface SheetOrg {
  readonly organizationId: string;
  readonly owner: FakeMember;
  readonly manager: FakeMember;
  readonly staff: FakeMember;
  readonly colleague: FakeMember;
}

export interface SheetWorld { readonly db: FakeDb; readonly orgA: SheetOrg; readonly orgB: SheetOrg }

function seedOrg(db: FakeDb, name: string): SheetOrg {
  const id = new FakeUuid();
  const organizationId = id.toString();
  const owner = db.addMember({ organizationId, role: "owner", displayName: `${name} owner` });
  db.insert("organization", { id, ownerId: owner.identity, name, orgIdText: organizationId, rootOrgId: organizationId, subscriptionStatus: undefined });
  return {
    organizationId,
    owner,
    manager: db.addMember({ organizationId, role: "manager", displayName: `${name} manager` }),
    staff: db.addMember({ organizationId, role: "staff", displayName: `${name} staff` }),
    colleague: db.addMember({ organizationId, role: "staff", displayName: `${name}  colleague ` }),
  };
}

/** Two organizations; each has an owner, a manager and two staff members (staff, colleague). */
export function createSheetWorld(): SheetWorld {
  const db = new FakeDb([...DRIVE_FAKE_TABLES, ...SHEET_EXTRA_TABLES]);
  return { db, orgA: seedOrg(db, "Org A"), orgB: seedOrg(db, "Org B") };
}

/** Real gzip of `text` (what lib/sheets/codec.ts writes). */
export function gz(text = "{}"): Uint8Array {
  return new Uint8Array(gzipSync(Buffer.from(text)));
}

/** `size` bytes that pass the module's gzip-header check (the module never inflates). */
export function gzPadded(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0x1f, 0x8b, 0x08]);
  return bytes;
}

export function errorOf(fn: () => void): string {
  try {
    fn();
  } catch (error) {
    return String((error as Error).message);
  }
  return "(no error)";
}

/** A new sheet through createDriveDocument; returns its id. */
export function newSheet(
  db: FakeDb, by: FakeMember,
  o: { space?: "my" | "store"; ownerMemberId?: string; visibility?: string; state?: Uint8Array; folderId?: string; cells?: number } = {},
): string {
  const documentId = crypto.randomUUID();
  db.run(R.createDriveDocument, by, {
    organizationId: by.organizationId, documentId, fileType: "sheet", space: o.space ?? "store", folderId: o.folderId ?? "",
    ownerMemberId: o.ownerMemberId ?? "", visibility: o.visibility ?? "", title: "Budget", templateId: "",
    initialState: o.state ?? gz('{"sheets":{}}'), html: "<p>ignored</p>", plainText: "Budget  2026", wordCount: o.cells ?? 4,
    actingMemberId: "",
  });
  return documentId;
}

/** One editor tab: a member (the tablet account on /store), its session, its socket and the operator it acts for. */
export interface SheetClient {
  readonly member: FakeMember;
  readonly sessionId: string;
  connection: FakeIdentity;
  readonly acting: string;
}

let sessionCounter = 0;
export function sheetClient(member: FakeMember, o: { acting?: FakeMember; sessionId?: string } = {}): SheetClient {
  sessionCounter++;
  return {
    member,
    sessionId: o.sessionId ?? `session-${sessionCounter.toString().padStart(4, "0")}`,
    connection: FakeIdentity.random(),
    acting: o.acting?.memberId ?? "",
  };
}

/** Run a sheet reducer as this client (its session, operator and connection). */
export function asClient(
  db: FakeDb, fn: unknown, c: SheetClient, args: Record<string, unknown>, opts: { atMicros?: bigint } = {},
): void {
  db.run(fn, c.member, { sessionId: c.sessionId, actingMemberId: c.acting, ...args }, { connectionId: c.connection, atMicros: opts.atMicros });
}

export function lease(db: FakeDb, documentId: string): Row {
  const row = db.find("documentEditLease", documentId);
  if (!row) throw new Error(`no document_edit_lease ${documentId}`);
  return row;
}

export function acquire(db: FakeDb, c: SheetClient, documentId: string, opts: { atMicros?: bigint } = {}): void {
  asClient(db, R.acquireSheetLease, c, { documentId }, opts);
}

/** Push one batch as the lease holder: epoch from the row, seq = lastSeq + 1 unless given, base = the newest row id. */
export function push(
  db: FakeDb, c: SheetClient, documentId: string, o: { payload?: Uint8Array; seq?: bigint; base?: bigint; epoch?: bigint; atMicros?: bigint } = {},
): void {
  const row = lease(db, documentId);
  const newest = db.rows("documentUpdate").filter((r) => r.documentId === documentId)
    .reduce((max, r) => ((r.id as bigint) > max ? (r.id as bigint) : max), (db.find("documentSnapshot", documentId)?.throughUpdateId as bigint | undefined) ?? 0n);
  asClient(db, R.pushSheetOps, c, {
    documentId, leaseEpoch: o.epoch ?? row.epoch, seq: o.seq ?? (row.lastSeq as bigint) + 1n, baseUpdateId: o.base ?? newest,
    payload: o.payload ?? gz('{"v":1,"ops":[]}'),
  }, { atMicros: o.atMicros });
}

/** The tablet's device_operator_session row, as resolveDeviceOperator writes it. */
export function operatorSession(db: FakeDb, tablet: FakeMember, operator: FakeMember, resolvedAtMicros = db.nowMicros): void {
  db.insert("deviceOperatorSession", {
    identity: tablet.identity, organizationId: operator.organizationId, memberId: operator.memberId,
    memberName: "Operator", role: operator.role, resolvedAt: new FakeTimestamp(resolvedAtMicros),
  });
}

export function sheetBytes(db: FakeDb, organizationId: string): bigint {
  return (db.find("driveUsage", organizationId)?.sheetBytes as bigint | undefined) ?? 0n;
}

/** Σ bytes the sheet tables hold for an org, counted independently of the module (the accounting invariant). */
export function countedSheetBytes(db: FakeDb, organizationId: string): bigint {
  // A sheet is a document whose document_file row says 'sheet'.
  const sheetFiles = db.rows("documentFile").filter((f) => f.fileType === "sheet").map((f) => f.documentId);
  const sheets = new Set(db.rows("document").filter((d) => d.organizationId === organizationId && sheetFiles.includes(d.id)).map((d) => d.id));
  let total = 0n;
  for (const s of db.rows("documentSnapshot")) if (sheets.has(s.documentId)) total += BigInt(s.byteLength as number);
  for (const u of db.rows("documentUpdate")) if (sheets.has(u.documentId)) total += BigInt(u.byteLength as number);
  for (const v of db.rows("documentVersionState")) if (v.organizationId === organizationId) total += BigInt(v.byteLength as number);
  return total;
}
