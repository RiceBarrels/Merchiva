// A sheet on the fake server with the REAL sheet and presence reducers (./sheet-server-harness.ts), and sessions
// opened on it with FakeModelAdapter models and a manual clock: shared by session.test.ts and session-recovery.test.ts.

import { expect } from "bun:test";
import { decodeSheetEnvelope, encodeSheetSnapshot } from "@/lib/sheets/codec";
import { SheetSyncSession, type SheetSessionEvents } from "@/lib/sheets/sync/session";
import type { SheetTransport } from "@/lib/sheets/sync/transport";
import type { SheetOp } from "@/lib/sheets/types";
import { FAKE_EPOCH_MICROS, type FakeMember } from "../../drive/fake-db";
import { FakeModelAdapter, FakeSheetServer, ManualClock, acceptTestOp, testWorkbook, type FakeSheetClient } from "./fake-model-adapter";
import { lease, newSheet } from "./sheet-server-harness";

const EVENTS: Array<keyof SheetSessionEvents> = [
  "reloaded", "leaseLost", "handOverRequested", "sizeWarning", "integrity", "updateRequired", "error", "accessLost", "released",
];

export function world(cells: Record<string, string | number> = { "0:0": "hello" }) {
  const clock = new ManualClock(Number(FAKE_EPOCH_MICROS / 1000n) + 60_000);
  const server = new FakeSheetServer(clock);
  const { orgA } = server.world;
  const documentId = newSheet(server.db, orgA.owner, { state: encodeSheetSnapshot(testWorkbook(cells)) });
  const rows = () => server.db.rows("documentUpdate").filter((r) => r.documentId === documentId);
  const snapshotThrough = () => server.db.find("documentSnapshot", documentId)?.throughUpdateId as bigint;
  return { clock, server, orgA, documentId, rows, snapshotThrough, lease: () => lease(server.db, documentId) };
}
export type World = ReturnType<typeof world>;

export interface Opened { client: FakeSheetClient; session: SheetSyncSession; model: FakeModelAdapter; events: Array<[string, unknown]> }

export interface OpenOptions {
  auto?: boolean;
  /** A store tablet acting for this PIN operator (actingMemberId); the client's own member otherwise. */
  acting?: FakeMember;
  tuning?: Record<string, number>;
  /** Calls replaced over the client's transport (the rest reach the fake server). */
  transport?: (base: SheetTransport) => Partial<SheetTransport>;
}

export function sessionFor(w: World, client: FakeSheetClient, o: OpenOptions = {}): SheetSyncSession {
  return new SheetSyncSession({
    documentId: w.documentId, organizationId: w.orgA.organizationId, memberId: client.member.memberId,
    actorMemberId: o.acting?.memberId ?? client.member.memberId, actingMemberId: o.acting?.memberId ?? "", user: { name: "U", color: "#123456" }, canEdit: true,
    autoAcquire: o.auto ?? false, transport: { ...client.transport, ...o.transport?.(client.transport) }, acceptRemoteOp: acceptTestOp,
    now: w.clock.now, timers: w.clock.timers, tuning: o.tuning,
  });
}

/** The sheet name the server's snapshot holds. */
export function snapshotSheetName(w: World): string {
  const state = w.server.db.find("documentSnapshot", w.documentId)?.state as Uint8Array;
  return (decodeSheetEnvelope(state).wb as unknown as { sheets: Record<string, { name: string }> }).sheets.s1.name;
}

export function record(session: SheetSyncSession): Array<[string, unknown]> {
  const events: Array<[string, unknown]> = [];
  for (const name of EVENTS) session.on(name, (...args: unknown[]) => void events.push([name, args[0]]));
  return events;
}

export async function open(w: World, member: FakeMember, o: OpenOptions & { client?: FakeSheetClient } = {}): Promise<Opened> {
  const client = o.client ?? w.server.client(member);
  const session = sessionFor(w, client, o);
  const events = record(session);
  const model = new FakeModelAdapter();
  session.attach(client.conn);
  void session.bindModel(model);
  await w.clock.advance(0);
  return { client, session, model, events };
}

export async function edit(w: World, a: Opened, ...ops: SheetOp[]): Promise<void> {
  for (const op of ops) expect(a.model.edit(op)).toBe(true);
  await w.clock.advance(200);
}

export const named = (events: Array<[string, unknown]>, name: string) => events.filter(([n]) => n === name).map(([, arg]) => arg);
