// SpacetimeYjsProvider / session cache / collaboration store: dropped connections,
// recoverable access loss, read-only downgrades, reconnect diffs and peer churn.
// Runs against FakeDocServer (the module's real docs reducers).

import { afterEach, describe, expect, test } from "bun:test";
import * as Y from "yjs";
import { isDocConnectionDown, onDocConnectionDown } from "@/lib/docs/connection";
import { newDocumentId } from "@/lib/docs/ids";
import {
  __docSessionStatsForTests,
  __resetDocSessionsForTests,
  acquireDocSession,
  hasUnsavedDocSessions,
  releaseDocSession,
  type DocSessionInit,
} from "@/lib/docs/session-cache";
import { docOfflineError, isDocOfflineError, SpacetimeYjsProvider, type DocProviderTuning } from "@/lib/docs/spacetime-provider";
import type { DocTransport } from "@/lib/docs/sync-types";
import { spacetimeDocTransport } from "@/lib/docs/transport";
import { DocCollaborationStore } from "@/lib/docs/use-document-collaboration";
import { createDocument, restoreDocument, setDocumentVisibility, trashDocument } from "@/lib/spacetimedb/actions";
import { clearConnection } from "@/lib/spacetimedb/client";
import { FakeDocServer, settle, sleep, waitFor, type FakeLink, type FakeMember, type Row } from "./fake-server";

const ORG = "org-docs-recovery";

const FAST: Partial<DocProviderTuning> = {
  pushDebounceMs: 0,
  pushMaxWaitMs: 0,
  presenceThrottleMs: 0,
  retryBaseMs: 5,
  retryMaxMs: 40,
  compactMaxRows: 1_000_000,
  compactMaxBytes: 1 << 30,
  compactMinIntervalMs: 0,
  autoVersionIntervalMs: 3_600_000,
};

interface Peer {
  readonly link: FakeLink;
  readonly doc: Y.Doc;
  readonly provider: SpacetimeYjsProvider;
}

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  __resetDocSessionsForTests();
  clearConnection();
});

async function act<T>(server: FakeDocServer, promise: Promise<T>): Promise<T> {
  server.pump();
  return promise;
}

async function world(visibility: "org_edit" | "org_view" | "private" = "org_edit") {
  const server = new FakeDocServer();
  const owner = server.addMember({ organizationId: ORG, role: "owner", displayName: "Olivia" });
  const staff = server.addMember({ organizationId: ORG, role: "staff", displayName: "Sam" });
  const ownerLink = server.link(owner.identity);
  const documentId = newDocumentId();
  await act(server, ownerLink.withActions(() => createDocument({ organizationId: ORG, documentId, title: "Rota", visibility })));
  return { server, owner, staff, ownerLink, documentId };
}

const serialize = (doc: Y.Doc) => {
  const text = doc.getText("body").toString();
  return { html: `<p>${text}</p>`, plainText: text, wordCount: text.split(/\s+/).filter(Boolean).length };
};

function openPeer(
  server: FakeDocServer,
  member: FakeMember,
  documentId: string,
  options: { name?: string; tuning?: Partial<DocProviderTuning>; readOnly?: boolean; transport?: (link: FakeLink) => DocTransport } = {},
): Peer {
  const link = server.link(member.identity);
  const doc = new Y.Doc();
  const provider = new SpacetimeYjsProvider(doc, {
    documentId,
    organizationId: ORG,
    memberId: member.memberId,
    user: { name: options.name ?? "Peer", color: "#336699" },
    transport: options.transport ? options.transport(link) : link.transport,
    readOnly: options.readOnly,
    tuning: { ...FAST, ...options.tuning },
  });
  provider.setSerializer(() => serialize(doc));
  provider.attach(link.docConnection);
  cleanups.push(() => {
    provider.destroy();
    if (!doc.isDestroyed) doc.destroy();
  });
  return { link, doc, provider };
}

const stateOf = (doc: Y.Doc): Uint8Array => Y.encodeStateAsUpdate(doc);
const textOf = (doc: Y.Doc): string => doc.getText("body").toString();
const updateRows = (server: FakeDocServer, documentId: string): Row[] =>
  server.rows("documentUpdate").filter((r) => r.documentId === documentId);
const rowsFrom = (server: FakeDocServer, peer: { provider: SpacetimeYjsProvider }): number =>
  updateRows(server, peer.provider.documentId).filter((r) => r.sessionId === peer.provider.sessionId).length;
const docRow = (server: FakeDocServer, documentId: string): Row | undefined => server.rows("document").find((r) => r.id === documentId);

describe("reconnect diff", () => {
  test("re-attaching with nothing new pushes no row and leaves the last editor alone", async () => {
    const { server, owner, staff, documentId } = await world();
    const a = openPeer(server, staff, documentId, { name: "A" });
    const b = openPeer(server, owner, documentId, { name: "B" });
    await settle(server, [a.provider, b.provider]);
    a.doc.getText("body").insert(0, "hello world");
    await settle(server, [a.provider, b.provider]);
    a.doc.getText("body").delete(0, 6); // the doc now has a delete set
    await settle(server, [a.provider, b.provider]);
    b.doc.getText("body").insert(0, "owner ");
    await settle(server, [a.provider, b.provider]);
    expect(docRow(server, documentId)?.lastEditorMemberId).toBe(owner.memberId);

    const before = rowsFrom(server, a);
    const statuses: string[] = [];
    a.provider.on("status", (s) => statuses.push(s));
    a.provider.attach(null);
    a.provider.attach(a.link.docConnection);
    await settle(server, [a.provider, b.provider]);

    expect(rowsFrom(server, a)).toBe(before);
    expect(docRow(server, documentId)?.lastEditorMemberId).toBe(owner.memberId);
    expect(statuses).toEqual(["offline", "syncing", "saved"]);
    expect(stateOf(a.doc)).toEqual(stateOf(b.doc));
  });

  test("a deletion made while detached is still pushed on re-attach", async () => {
    const { server, owner, staff, documentId } = await world();
    const a = openPeer(server, staff, documentId, { name: "A" });
    const b = openPeer(server, owner, documentId, { name: "B" });
    await settle(server, [a.provider, b.provider]);
    a.doc.getText("body").insert(0, "keep drop");
    await settle(server, [a.provider, b.provider]);
    const before = rowsFrom(server, a);

    a.provider.attach(null);
    a.doc.getText("body").delete(4, 5); // delete-only edit: no new structs, only a delete set
    expect(a.provider.hasUnsavedChanges()).toBe(true);
    a.provider.attach(a.link.docConnection);
    await settle(server, [a.provider, b.provider]);

    expect(rowsFrom(server, a)).toBe(before + 1);
    expect(textOf(b.doc)).toBe("keep");
    expect(stateOf(a.doc)).toEqual(stateOf(b.doc));
  });
});

describe("access loss is recoverable", () => {
  test("a push refused because the doc was trashed goes through after Restore", async () => {
    const { server, owner, staff, ownerLink, documentId } = await world();
    const sam = openPeer(server, staff, documentId, { name: "Sam" });
    const olivia = openPeer(server, owner, documentId, { name: "Olivia" });
    await settle(server, [sam.provider, olivia.provider]);

    await act(server, ownerLink.withActions(() => trashDocument(documentId)));
    sam.doc.getText("body").insert(0, "typed as it was trashed");
    await waitFor(server, () => sam.provider.accessLostCode === "trashed");
    expect(sam.provider.status).toBe("error");
    sam.provider.setReadOnly(true); // UI: a trashed doc can't be edited

    await act(server, ownerLink.withActions(() => restoreDocument(documentId)));
    sam.provider.setReadOnly(false); // UI: editable again
    await settle(server, [sam.provider, olivia.provider]);
    expect(sam.provider.accessLostCode).toBeNull();
    expect(sam.provider.status).toBe("saved");
    expect(textOf(olivia.doc)).toBe("typed as it was trashed");

    sam.doc.getText("body").insert(0, "after restore, ");
    await settle(server, [sam.provider, olivia.provider]);
    expect(textOf(olivia.doc)).toBe("after restore, typed as it was trashed");
    expect(sam.provider.peers.find((p) => p.isSelf)?.canEdit).toBe(true);
  });

  test("a presence upsert refused as trashed is not an access loss and backs off", async () => {
    const { server, owner, ownerLink, documentId } = await world();
    await act(server, ownerLink.withActions(() => trashDocument(documentId)));
    let refuse = true;
    const upserts: number[] = [];
    const manager = openPeer(server, owner, documentId, {
      name: "Manager",
      readOnly: true, // trashed docs open read-only
      tuning: { retryBaseMs: 80, retryMaxMs: 80 },
      transport: (link) => ({
        ...link.transport,
        // A module without allowTrashed on upsertDocumentPresence.
        upsertPresence: async (input) => {
          upserts.push(Date.now());
          if (refuse) throw new Error("[doc.trashed] Document is in the trash");
          return link.transport.upsertPresence(input);
        },
      }),
    });
    await waitFor(server, () => manager.provider.synced && upserts.length >= 1);
    await sleep(5);
    const refusedSoFar = upserts.length;
    for (let i = 0; i < 10; i++) manager.provider.awareness.setLocalStateField("cursor", { anchor: i, head: i });
    await sleep(10);
    expect(manager.provider.accessLostCode).toBeNull();
    expect(manager.provider.status).toBe("saved");
    expect(upserts.length).toBe(refusedSoFar); // no call per caret move while backing off

    refuse = false;
    await act(server, ownerLink.withActions(() => restoreDocument(documentId)));
    manager.provider.setReadOnly(false);
    const presence = () =>
      server.rows("documentPresence").filter((r) => r.documentId === documentId && r.yClientId === manager.doc.clientID);
    await waitFor(server, () => presence().length === 1);
    manager.doc.getText("body").insert(0, "back in business");
    await settle(server, [manager.provider]);
    expect(manager.provider.status).toBe("saved");
    expect(updateRows(server, documentId).some((r) => r.sessionId === manager.provider.sessionId)).toBe(true);
  });

  test("an edit queued at a downgrade to read-only waits, and goes out when edit access returns", async () => {
    const { server, owner, staff, ownerLink, documentId } = await world();
    const sam = openPeer(server, staff, documentId, { name: "Sam", tuning: { pushDebounceMs: 60_000, pushMaxWaitMs: 60_000 } });
    const olivia = openPeer(server, owner, documentId, { name: "Olivia" });
    await settle(server, [sam.provider, olivia.provider]);

    sam.doc.getText("body").insert(0, "queued");
    expect(sam.provider.hasUnsavedChanges()).toBe(true);
    await act(server, ownerLink.withActions(() => setDocumentVisibility(documentId, "org_view")));
    sam.provider.setReadOnly(true); // UI: canEdit false
    await sam.provider.flush();
    server.pump();
    await sleep(0);
    expect(rowsFrom(server, sam)).toBe(0);
    expect(sam.provider.accessLostCode).toBeNull();

    await act(server, ownerLink.withActions(() => setDocumentVisibility(documentId, "org_edit")));
    sam.provider.setReadOnly(false);
    await settle(server, [sam.provider, olivia.provider]);
    expect(textOf(olivia.doc)).toBe("queued");
    expect(sam.provider.status).toBe("saved");
  });
});

describe("session cache and access loss", () => {
  const initFor = (link: FakeLink): DocSessionInit => ({ user: { name: "Sam", color: "#336699" }, readOnly: false, transport: link.transport, tuning: FAST });

  test("a session that lost access with a rejected edit is dropped on release and reopened fresh", async () => {
    const { server, staff, ownerLink, documentId } = await world();
    const link = server.link(staff.identity);
    const key = { documentId, organizationId: ORG, memberId: staff.memberId };
    const session = acquireDocSession(key, initFor(link));
    session.provider.setSerializer(() => serialize(session.ydoc));
    session.provider.attach(link.docConnection);
    await settle(server, [session.provider]);

    await act(server, ownerLink.withActions(() => setDocumentVisibility(documentId, "private")));
    session.ydoc.getText("body").insert(0, "typed after revoke");
    await waitFor(server, () => session.provider.accessLostCode !== null);
    expect(session.provider.hasUnsavedChanges()).toBe(true); // the rejected edit stays visible locally
    expect(hasUnsavedDocSessions()).toBe(false); // …but can never be saved: no "leave site?" prompt

    releaseDocSession(session);
    expect(session.ydoc.isDestroyed).toBe(true);
    expect(__docSessionStatsForTests()).toEqual({ total: 0, idle: 0 });

    await act(server, ownerLink.withActions(() => setDocumentVisibility(documentId, "org_edit")));
    const again = acquireDocSession(key, initFor(link));
    expect(again).not.toBe(session);
    again.provider.setSerializer(() => serialize(again.ydoc));
    again.provider.attach(link.docConnection);
    await settle(server, [again.provider]);
    expect(again.provider.accessLostCode).toBeNull();
    again.ydoc.getText("body").insert(0, "allowed again");
    await settle(server, [again.provider]);
    expect(again.provider.status).toBe("saved");
    expect(rowsFrom(server, again)).toBe(1);
    releaseDocSession(again);
  });

  test("a parked session that loses access is replaced on the next acquire", async () => {
    const { server, staff, ownerLink, documentId } = await world();
    const link = server.link(staff.identity);
    const key = { documentId, organizationId: ORG, memberId: staff.memberId };
    const session = acquireDocSession(key, { ...initFor(link), tuning: { ...FAST, pushDebounceMs: 20, pushMaxWaitMs: 20 } });
    session.provider.attach(link.docConnection);
    await settle(server, [session.provider]);

    await act(server, ownerLink.withActions(() => setDocumentVisibility(documentId, "private")));
    session.ydoc.getText("body").insert(0, "last words");
    releaseDocSession(session); // parked with an unsaved edit
    expect(__docSessionStatsForTests()).toEqual({ total: 1, idle: 1 });
    expect(hasUnsavedDocSessions()).toBe(true);
    await waitFor(server, () => session.provider.accessLostCode !== null);
    expect(hasUnsavedDocSessions()).toBe(false);

    const again = acquireDocSession(key, initFor(link));
    expect(again).not.toBe(session);
    expect(session.ydoc.isDestroyed).toBe(true);
    expect(again.provider.accessLostCode).toBeNull();
    releaseDocSession(again);
  });
});

describe("dropped connections", () => {
  test("connection liveness follows the SDK's disconnect / connect-error events", () => {
    const disconnect: Array<() => void> = [];
    const connectError: Array<() => void> = [];
    const raw = {
      isActive: true,
      onDisconnect: (cb: () => void) => void disconnect.push(cb),
      onConnectError: (cb: () => void) => void connectError.push(cb),
    };
    expect(isDocConnectionDown(raw)).toBe(false);
    let calls = 0;
    const off = onDocConnectionDown(raw, () => calls++);
    // spacetimedb@2.2.0 emits "disconnect" while isActive is still true.
    for (const cb of disconnect) cb();
    expect(raw.isActive).toBe(true);
    expect(isDocConnectionDown(raw)).toBe(true);
    expect(calls).toBe(1);
    for (const cb of connectError) cb();
    expect(calls).toBe(1);
    off();
    expect(disconnect).toHaveLength(1); // registered once per connection

    expect(isDocConnectionDown({ isActive: false })).toBe(true); // closed before anyone asked
    expect(isDocConnectionDown(null)).toBe(true);
    expect(onDocConnectionDown(null, () => calls++)).toBeFunction();
  });

  test("the reducer transport reports 'no connection' as a DocOfflineError", async () => {
    clearConnection();
    const rejected = await spacetimeDocTransport.pushUpdate(newDocumentId(), "session", new Uint8Array([0, 0])).catch((err: unknown) => err);
    expect(isDocOfflineError(rejected)).toBe(true);
    expect(isDocOfflineError(new Error("Not connected"))).toBe(false);
  });

  test("pushes failing for lack of a connection show offline, not saving, and recover", async () => {
    const { server, owner, staff, documentId } = await world();
    let offline = false;
    const writer = openPeer(server, staff, documentId, {
      name: "Writer",
      transport: (link) => ({
        ...link.transport,
        pushUpdate: (id, session, payload) => (offline ? Promise.reject(docOfflineError()) : link.transport.pushUpdate(id, session, payload)),
      }),
    });
    const reader = openPeer(server, owner, documentId, { name: "Reader" });
    await settle(server, [writer.provider, reader.provider]);

    offline = true;
    writer.doc.getText("body").insert(0, "while the socket is gone");
    await waitFor(server, () => writer.provider.status === "offline");
    const statuses: string[] = [];
    writer.provider.on("status", (s) => statuses.push(s));
    writer.doc.getText("body").insert(0, "still typing, ");
    await sleep(20);
    expect(statuses).not.toContain("saving");
    expect(writer.provider.status).toBe("offline");

    offline = false;
    await settle(server, [writer.provider, reader.provider]);
    expect(writer.provider.status).toBe("saved");
    expect(textOf(reader.doc)).toBe("still typing, while the socket is gone");
  });

  test("the store takes parked sessions off a dropped connection and onto the next one", async () => {
    const { server, staff, documentId } = await world();
    const link = server.link(staff.identity);
    const store = new DocCollaborationStore({ transport: link.transport, tuning: FAST });
    store.setUser({ name: "Sam", color: "#336699" });
    store.setReadOnly(false);
    store.setConnection(link.docConnection, null);
    store.open({ documentId, organizationId: ORG, memberId: staff.memberId });
    const provider = store.getSnapshot().provider!;
    await settle(server, [provider]);
    store.close(); // parked, still syncing
    expect(provider.connection).toBe(link.docConnection);

    store.setConnection(null, null);
    expect(provider.connection).toBeNull();
    expect(provider.status).toBe("offline");

    link.reconnect();
    store.setConnection(link.docConnection, null);
    expect(provider.connection).toBe(link.docConnection);
    await settle(server, [provider]);
    expect(provider.status).toBe("saved");
  });
});

describe("peers", () => {
  test("caret moves don't re-emit the peer list; a rename does", async () => {
    const { server, owner, staff, documentId } = await world();
    const olivia = openPeer(server, owner, documentId, { name: "O" });
    const sam = openPeer(server, staff, documentId, { name: "Sam" });
    await settle(server, [olivia.provider, sam.provider]);
    await waitFor(server, () => sam.provider.peers.length === 2 && olivia.provider.peers.length === 2);
    await settle(server, [olivia.provider, sam.provider]);

    const listBefore = olivia.provider.peers;
    let localEmits = 0;
    let remoteEmits = 0;
    olivia.provider.on("peers", () => localEmits++);
    sam.provider.on("peers", () => remoteEmits++);
    for (let i = 0; i < 10; i++) olivia.provider.awareness.setLocalStateField("cursor", { anchor: i, head: i });
    await settle(server, [olivia.provider, sam.provider]);
    expect(server.callLog.filter((c) => c.reducer === "upsertDocumentPresence").length).toBeGreaterThan(2);
    expect(localEmits).toBe(0);
    expect(remoteEmits).toBe(0);
    expect(olivia.provider.peers).toBe(listBefore);

    olivia.provider.setUser({ name: "Olivia", color: "#336699" });
    await waitFor(server, () => sam.provider.peers.some((p) => p.name === "Olivia"));
    expect(localEmits).toBe(1);
    expect(remoteEmits).toBeGreaterThanOrEqual(1);
  });
});
