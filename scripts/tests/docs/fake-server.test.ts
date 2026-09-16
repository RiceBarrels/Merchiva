// The fake server's own guarantees, which the provider tests rely on (plan §D6):
// real module reducers, serial execution, auto-increment ids in commit order,
// commit-ordered delivery with the SDK's callback order, rollback, handle
// lifecycle, and the disconnect hook.

import { afterEach, describe, expect, test } from "bun:test";
import { Awareness, encodeAwarenessUpdate } from "y-protocols/awareness";
import * as Y from "yjs";
import { newDocumentId } from "@/lib/docs/ids";
import { docLiveQueries } from "@/lib/docs/queries";
import type { DocUpdateRow } from "@/lib/docs/types";
import {
  createDocument,
  pushDocumentUpdate,
  setDocumentVisibility,
  upsertDocumentPresence,
} from "@/lib/spacetimedb/actions";
import { clearConnection } from "@/lib/spacetimedb/client";
import { FakeDocServer, mulberry32, type FakeLink, type FakeMember, type Row } from "./fake-server";

const ORG = "org-fake-server";

afterEach(() => {
  clearConnection();
});

async function run<T>(server: FakeDocServer, promise: Promise<T>): Promise<T> {
  server.pump();
  return promise;
}

async function newDoc(server: FakeDocServer, owner: FakeMember, visibility: "org_edit" | "private" = "org_edit") {
  const ownerLink = server.link(owner.identity);
  const documentId = newDocumentId();
  await run(server, ownerLink.withActions(() => createDocument({ organizationId: ORG, documentId, title: "Opening checklist", visibility })));
  return { ownerLink, documentId };
}

/** A valid awareness update for one client, as encodeAwarenessUpdate(awareness, [yClientId]) produces (the server rejects anything else). */
function awarenessFor(yClientId: number): Uint8Array {
  const doc = new Y.Doc();
  doc.clientID = yClientId;
  const awareness = new Awareness(doc);
  try {
    awareness.setLocalStateField("user", { name: "Sam", color: "#336699" });
    return encodeAwarenessUpdate(awareness, [yClientId]);
  } finally {
    awareness.destroy();
    doc.destroy();
  }
}

function push(link: FakeLink, documentId: string, sessionId: string, byte: number): Promise<void> {
  return link.withActions(() => pushDocumentUpdate(documentId, sessionId, new Uint8Array([byte, 0, 0])));
}

describe("FakeDocServer", () => {
  test("runs the module's own reducers, including their access checks and messages", async () => {
    const server = new FakeDocServer();
    const owner = server.addMember({ organizationId: ORG, role: "owner" });
    const staff = server.addMember({ organizationId: ORG, role: "staff" });
    const outsider = server.addMember({ organizationId: "another-org", role: "owner" });
    const { documentId } = await newDoc(server, owner, "private");

    expect(server.rows("document").map((r) => r.id)).toEqual([documentId]);
    expect(server.rows("document")[0].ownerMemberId).toBe(owner.memberId);

    const staffLink = server.link(staff.identity);
    await expect(run(server, push(staffLink, documentId, "s", 1))).rejects.toThrow(
      "[doc.forbidden] You do not have access to this document",
    );
    const outsiderLink = server.link(outsider.identity);
    await expect(run(server, push(outsiderLink, documentId, "s", 1))).rejects.toThrow(
      "[doc.forbidden] Not an active member of this organization",
    );
    expect(server.rows("documentUpdate")).toHaveLength(0);
  });

  test("processes calls serially in arrival order; auto-increment ids follow commit order", async () => {
    const server = new FakeDocServer();
    const owner = server.addMember({ organizationId: ORG, role: "owner" });
    const a = server.link(server.addMember({ organizationId: ORG }).identity);
    const b = server.link(server.addMember({ organizationId: ORG }).identity);
    const { ownerLink, documentId } = await newDoc(server, owner);

    const calls = [push(a, documentId, "s0", 1), push(b, documentId, "s1", 2), push(ownerLink, documentId, "s2", 3), push(a, documentId, "s3", 4)];
    expect(server.rows("documentUpdate")).toHaveLength(0); // nothing runs until the server gets to it
    expect(server.inboundSize).toBe(4);

    expect(server.processNext()).toBe(true);
    expect(server.rows("documentUpdate").map((r) => r.sessionId)).toEqual(["s0"]);
    server.processAll();
    const rows = [...server.rows("documentUpdate")].sort((x, y) => ((x.id as bigint) < (y.id as bigint) ? -1 : 1));
    expect(rows.map((r) => r.sessionId)).toEqual(["s0", "s1", "s2", "s3"]);
    expect(rows.map((r) => r.id)).toEqual([1n, 2n, 3n, 4n]);
    server.pump();
    await Promise.all(calls);
  });

  test("a throwing transaction rolls back every write", () => {
    const server = new FakeDocServer();
    const before = server.commitCount;
    expect(() =>
      server.transact((db) => {
        const members = db.orgMember as { insert(row: Record<string, unknown>): Row };
        members.insert({ id: "m-rollback", organizationId: ORG, userId: "u", role: "staff", permissions: "{}", status: "active" });
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(server.rows("orgMember")).toHaveLength(0);
    expect(server.commitCount).toBe(before);
  });

  test("a subscription applies its rows atomically: onApplied first, then row callbacks, then commits in order", async () => {
    const server = new FakeDocServer();
    const owner = server.addMember({ organizationId: ORG, role: "owner" });
    const a = server.link(server.addMember({ organizationId: ORG }).identity);
    const b = server.link(server.addMember({ organizationId: ORG }).identity);
    const { ownerLink, documentId } = await newDoc(server, owner);
    await run(server, push(ownerLink, documentId, "s1", 1));
    await run(server, push(ownerLink, documentId, "s2", 2));

    const watcher = server.connect(server.addMember({ organizationId: ORG }).identity);
    const conn = watcher.docConnection;
    const events: string[] = [];
    conn.db.documentUpdate.onInsert((_ctx, row: DocUpdateRow) => events.push(`insert:${row.sessionId}`));
    const handle = conn
      .subscriptionBuilder()
      .onApplied(() => events.push(`applied:${[...conn.db.documentUpdate.iter()].length}`))
      .subscribe(docLiveQueries(documentId));
    expect(handle.isActive()).toBe(false);
    server.pump();
    expect(handle.isActive()).toBe(true);
    expect(events).toEqual(["applied:2", "insert:s1", "insert:s2"]);

    // Concurrent writers; deliveries to the different clients interleave at random.
    const writes = [push(a, documentId, "s3", 3), push(b, documentId, "s4", 4), push(a, documentId, "s5", 5)];
    server.pump(mulberry32(7));
    await Promise.all(writes);
    expect(events.slice(3)).toEqual(["insert:s3", "insert:s4", "insert:s5"]);
  });

  test("commits outside a client's query sets are not delivered to it", async () => {
    const server = new FakeDocServer();
    const owner = server.addMember({ organizationId: ORG, role: "owner" });
    const { ownerLink, documentId } = await newDoc(server, owner);
    const other = await newDoc(server, owner);
    const watcher = server.connect(owner.identity);
    watcher.docConnection.subscriptionBuilder().subscribe(docLiveQueries(documentId));
    server.pump();
    await run(server, push(ownerLink, other.documentId, "elsewhere", 9));
    await run(server, push(ownerLink, documentId, "here", 1));
    expect(watcher.cachedRows("documentUpdate").map((r) => r.sessionId)).toEqual(["here"]);
  });

  test("unsubscribe mirrors the SDK handle: once only, rows leave with onDelete, shared rows stay", async () => {
    const server = new FakeDocServer();
    const owner = server.addMember({ organizationId: ORG, role: "owner" });
    const { ownerLink, documentId } = await newDoc(server, owner);
    await run(server, push(ownerLink, documentId, "s1", 1));

    const watcher = server.connect(owner.identity);
    const conn = watcher.docConnection;
    const deleted: string[] = [];
    conn.db.documentUpdate.onDelete((_ctx, row) => deleted.push(row.sessionId));
    const first = conn.subscriptionBuilder().subscribe(docLiveQueries(documentId));
    const second = conn.subscriptionBuilder().subscribe(docLiveQueries(documentId));
    server.pump();

    first.unsubscribe();
    expect(() => first.unsubscribe()).toThrow("Unsubscribe has already been called");
    expect(first.isActive()).toBe(true); // until UnsubscribeApplied arrives
    server.pump();
    expect(first.isEnded()).toBe(true);
    expect(deleted).toEqual([]); // still referenced by the second query set
    expect([...conn.db.documentUpdate.iter()]).toHaveLength(1);

    second.unsubscribe();
    server.pump();
    expect(deleted).toEqual(["s1"]);
    expect([...conn.db.documentUpdate.iter()]).toHaveLength(0);
  });

  test("a row updated by a reducer reaches subscribers as onUpdate", async () => {
    const server = new FakeDocServer();
    const owner = server.addMember({ organizationId: ORG, role: "owner" });
    const staff = server.addMember({ organizationId: ORG, role: "staff" });
    const { ownerLink, documentId } = await newDoc(server, owner);
    const staffLink = server.link(staff.identity);
    await run(
      server,
      staffLink.withActions(() =>
        upsertDocumentPresence({ documentId, yClientId: 42, name: "Sam", color: "#336699", awareness: awarenessFor(42) }),
      ),
    );

    const watcher = server.connect(owner.identity);
    const updates: Array<[boolean, boolean]> = [];
    watcher.docConnection.db.documentPresence.onUpdate((_ctx, oldRow, newRow) => updates.push([oldRow.canEdit, newRow.canEdit]));
    watcher.docConnection.subscriptionBuilder().subscribe(docLiveQueries(documentId));
    server.pump();

    // org_edit → private: pruneDocPresence deletes staff presence (no view access) — make it viewable instead.
    await run(server, ownerLink.withActions(() => setDocumentVisibility(documentId, "org_view")));
    expect(updates).toEqual([[true, false]]);
  });

  test("disconnect drops queued calls and runs the module's onDisconnect hook", async () => {
    const server = new FakeDocServer();
    const owner = server.addMember({ organizationId: ORG, role: "owner" });
    const { documentId } = await newDoc(server, owner);
    const staffLink = server.link(server.addMember({ organizationId: ORG }).identity);
    await run(
      server,
      staffLink.withActions(() =>
        upsertDocumentPresence({ documentId, yClientId: 7, name: "Sam", color: "#336699", awareness: awarenessFor(7) }),
      ),
    );
    const watcher = server.connect(owner.identity);
    const removed: number[] = [];
    watcher.docConnection.db.documentPresence.onDelete((_ctx, row) => removed.push(row.yClientId));
    watcher.docConnection.subscriptionBuilder().subscribe(docLiveQueries(documentId));
    server.pump();
    expect(server.rows("documentPresence")).toHaveLength(1);

    const queued = push(staffLink, documentId, "never-sent", 1);
    staffLink.client.disconnect();
    await expect(queued).rejects.toThrow("Connection closed");
    expect(server.rows("documentPresence")).toHaveLength(0);
    server.pump();
    expect(removed).toEqual([7]);
    expect(server.rows("documentUpdate")).toHaveLength(0);
  });

  test("a subscription the server can't run fails through onError", () => {
    const server = new FakeDocServer();
    const client = server.connect(server.addMember({ organizationId: ORG }).identity);
    const errors: unknown[] = [];
    const handle = client.docConnection
      .subscriptionBuilder()
      .onError((ctx) => errors.push(ctx))
      .subscribe([`SELECT * FROM "missing_table" WHERE "missing_table"."document_id" = 'x'`]);
    server.pump();
    expect(errors).toHaveLength(1);
    expect(handle.isEnded()).toBe(true);
    expect(handle.isActive()).toBe(false);
  });
});
