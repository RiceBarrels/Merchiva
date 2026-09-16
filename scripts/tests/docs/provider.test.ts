// SpacetimeYjsProvider, the session cache and the collaboration store, against
// FakeDocServer (the module's real docs reducers, commit-ordered delivery).
// Covers plan §D6 acceptance items 1–7.

import { afterEach, beforeEach, describe, expect, jest, spyOn, test } from "bun:test";
import * as Y from "yjs";
import { newDocumentId } from "@/lib/docs/ids";
import {
  __docSessionStatsForTests,
  __resetDocSessionsForTests,
  acquireDocSession,
  DOC_SESSION_IDLE_MS,
  DOC_SESSION_MAX_IDLE,
  hasUnsavedDocSessions,
  releaseDocSession,
  type DocSessionInit,
} from "@/lib/docs/session-cache";
import { SpacetimeYjsProvider, type DocProviderTuning } from "@/lib/docs/spacetime-provider";
import type { DocTransport } from "@/lib/docs/sync-types";
import type { DocErrorCode } from "@/lib/docs/types";
import { DocCollaborationStore } from "@/lib/docs/use-document-collaboration";
import { createDocument, setDocumentVisibility, trashDocument } from "@/lib/spacetimedb/actions";
import { clearConnection } from "@/lib/spacetimedb/client";
import { FakeDocServer, mulberry32, settle, sleep, waitFor, type FakeLink, type FakeMember, type Row } from "./fake-server";

const ORG = "org-docs-sync";

/** Zero debounce/throttle so tests run fast; compaction off unless a test turns it on. */
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

async function world(visibility: "org_edit" | "org_view" | "private" = "org_edit") {
  const server = new FakeDocServer();
  const owner = server.addMember({ organizationId: ORG, role: "owner", displayName: "Olivia" });
  const staff = server.addMember({ organizationId: ORG, role: "staff", displayName: "Sam" });
  const ownerLink = server.link(owner.identity);
  const documentId = newDocumentId();
  const created = ownerLink.withActions(() => createDocument({ organizationId: ORG, documentId, title: "Shift handover", visibility }));
  server.pump();
  await created;
  return { server, owner, staff, ownerLink, documentId };
}

function serialize(doc: Y.Doc) {
  const text = doc.getText("body").toString();
  return { html: `<p>${text}</p>`, plainText: text, wordCount: text.split(/\s+/).filter(Boolean).length };
}

function openPeer(
  server: FakeDocServer,
  member: FakeMember,
  documentId: string,
  options: { name?: string; tuning?: Partial<DocProviderTuning>; readOnly?: boolean } = {},
): Peer {
  const link = server.link(member.identity);
  const doc = new Y.Doc();
  const provider = new SpacetimeYjsProvider(doc, {
    documentId,
    organizationId: ORG,
    memberId: member.memberId,
    user: { name: options.name ?? "Peer", color: "#336699" },
    transport: link.transport,
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
const snapshotRow = (server: FakeDocServer, documentId: string): Row | undefined =>
  server.rows("documentSnapshot").find((r) => r.documentId === documentId);
const presenceOf = (server: FakeDocServer, peer: Peer): Row[] =>
  server.rows("documentPresence").filter((r) => r.documentId === peer.provider.documentId && r.yClientId === peer.doc.clientID);

const WORDS = ["till", "float", "delivery", "fridge", "2°C", "keys", "拖地", "盘点", "rota", "✓", "\n"];

function randomEdit(doc: Y.Doc, rng: () => number): void {
  const text = doc.getText("body");
  const r = rng();
  if (r < 0.55 || text.length === 0) {
    text.insert(Math.floor(rng() * (text.length + 1)), `${WORDS[Math.floor(rng() * WORDS.length)]} `);
  } else if (r < 0.85) {
    const at = Math.floor(rng() * text.length);
    text.delete(at, Math.min(text.length - at, 1 + Math.floor(rng() * 6)));
  } else if (r < 0.93) {
    doc.getMap("meta").set(`k${Math.floor(rng() * 5)}`, Math.floor(rng() * 1000));
  } else {
    const list = doc.getArray<number>("list");
    if (list.length > 0 && rng() < 0.4) list.delete(Math.floor(rng() * list.length), 1);
    else list.insert(Math.floor(rng() * (list.length + 1)), [Math.floor(rng() * 100)]);
  }
}

describe("SpacetimeYjsProvider", () => {
  // Acceptance 1
  test(
    "three providers with 500 random concurrent edits converge byte-for-byte",
    async () => {
      const { server, owner, staff, documentId } = await world();
      const rng = mulberry32(20260915);
      const tuning = { compactMaxRows: 25 }; // compaction keeps running while edits flow
      const peers = [
        openPeer(server, staff, documentId, { name: "A", tuning }),
        openPeer(server, owner, documentId, { name: "B", tuning }),
        openPeer(server, staff, documentId, { name: "C", tuning }),
      ];
      const providers = peers.map((p) => p.provider);
      await settle(server, providers, { random: rng });
      expect(providers.every((p) => p.synced && p.status === "saved")).toBe(true);

      for (let i = 0; i < 500; i++) {
        randomEdit(peers[Math.floor(rng() * peers.length)].doc, rng);
        const steps = Math.floor(rng() * 8);
        for (let s = 0; s < steps && server.step(rng); s++);
        if (rng() < 0.2) await sleep(0);
      }
      await settle(server, providers, { random: rng });

      const reference = stateOf(peers[0].doc);
      for (const peer of peers.slice(1)) expect(stateOf(peer.doc)).toEqual(reference);
      expect(textOf(peers[0].doc).length).toBeGreaterThan(0);
      expect(textOf(peers[2].doc)).toBe(textOf(peers[0].doc));
      expect(providers.every((p) => p.status === "saved" && !p.hasUnsavedChanges())).toBe(true);

      // The run really was concurrent: every peer pushed, and many pushes were made
      // before their sender had received other peers' committed edits.
      const pushes = server.callLog.filter((c) => c.reducer === "pushDocumentUpdate" && c.ok);
      for (const peer of peers) expect(pushes.some((c) => c.connectionId === peer.link.client.connectionId.hex)).toBe(true);
      expect(pushes.filter((c) => c.unseenUpdates > 0).length).toBeGreaterThan(10);
      // …and the log was compacted while edits were flowing.
      expect(server.callLog.some((c) => c.reducer === "compactDocument" && c.ok)).toBe(true);
      expect(snapshotRow(server, documentId)).toBeDefined();

      const late = openPeer(server, owner, documentId, { name: "Late" });
      await settle(server, [...providers, late.provider], { random: rng });
      expect(stateOf(late.doc)).toEqual(reference);
    },
    60_000,
  );

  // Acceptance 2
  test("compaction deletes rows ≤ N, and a fresh client loads identical content", async () => {
    const { server, owner, staff, documentId } = await world();
    const editor = openPeer(server, staff, documentId, { name: "Editor", tuning: { compactMaxRows: 10 } });
    const compacted: bigint[] = [];
    editor.provider.on("compacted", (n) => compacted.push(n));
    await settle(server, [editor.provider]);

    for (let i = 0; i < 14; i++) {
      const body = editor.doc.getText("body");
      body.insert(body.length, `line ${i} `);
      await settle(server, [editor.provider]);
    }

    const snapshot = snapshotRow(server, documentId);
    expect(snapshot).toBeDefined();
    const through = snapshot!.throughUpdateId as bigint;
    expect(through >= 10n).toBe(true);
    const remaining = updateRows(server, documentId);
    expect(remaining.length).toBeGreaterThan(0);
    expect(remaining.length).toBeLessThan(10);
    expect(remaining.every((r) => (r.id as bigint) > through)).toBe(true);
    expect(compacted).toEqual([through]);
    expect(snapshot!.plainText).toContain("line 9");
    const docRow = server.rows("document").find((r) => r.id === documentId);
    expect(docRow!.excerpt).toStartWith("line 0 line 1");

    const fresh = openPeer(server, owner, documentId, { name: "Fresh" });
    await settle(server, [editor.provider, fresh.provider]);
    expect(stateOf(fresh.doc)).toEqual(stateOf(editor.doc));
    expect(textOf(fresh.doc)).toBe(textOf(editor.doc));
  });

  test("rows already in the log when a client subscribes are counted once", async () => {
    const { server, owner, staff, documentId } = await world();
    const writer = openPeer(server, owner, documentId, { name: "Writer" });
    await settle(server, [writer.provider]);
    for (let i = 0; i < 9; i++) {
      writer.doc.getText("body").insert(0, `${i} `);
      await settle(server, [writer.provider]);
    }
    writer.provider.destroy(); // leaves the joiner as the only compaction candidate
    await settle(server);
    expect(updateRows(server, documentId)).toHaveLength(9);

    const joiner = openPeer(server, staff, documentId, { name: "Joiner", tuning: { compactMaxRows: 10 } });
    await settle(server, [joiner.provider]);
    expect(snapshotRow(server, documentId)).toBeUndefined(); // 9 < 10 (double counting would read 18)

    joiner.doc.getText("body").insert(0, "tenth ");
    await settle(server, [joiner.provider]);
    expect(snapshotRow(server, documentId)?.throughUpdateId).toBe(10n);
  });

  // Acceptance 3
  test("a stale compaction (equal N) is a no-op", async () => {
    const { server, owner, staff, documentId } = await world();
    const editor = openPeer(server, staff, documentId, { name: "Editor", tuning: { compactMaxRows: 5 } });
    await settle(server, [editor.provider]);
    for (let i = 0; i < 6; i++) {
      editor.doc.getText("body").insert(0, `entry ${i} `);
      await settle(server, [editor.provider]);
    }
    const before = snapshotRow(server, documentId)!;
    const logBefore = updateRows(server, documentId).map((r) => r.id);
    const docBefore = server.rows("document").find((r) => r.id === documentId);
    const through = before.throughUpdateId as bigint;

    const bogus = new Y.Doc();
    bogus.getText("body").insert(0, "rewritten history");
    const overwrite = {
      documentId,
      state: Y.encodeStateAsUpdate(bogus),
      html: "<p>rewritten history</p>",
      plainText: "rewritten history",
      wordCount: 2,
    };
    bogus.destroy();

    const equal = editor.link.transport.compact({ ...overwrite, throughUpdateId: through });
    server.pump();
    await equal;
    const older = editor.link.transport.compact({ ...overwrite, throughUpdateId: through - 1n });
    server.pump();
    await older;
    expect(snapshotRow(server, documentId)).toBe(before); // the very same row: untouched
    expect(updateRows(server, documentId).map((r) => r.id)).toEqual(logBefore);
    expect(server.rows("document").find((r) => r.id === documentId)).toBe(docBefore);

    const ahead = editor.link.transport.compact({ ...overwrite, throughUpdateId: 10_000n });
    server.pump();
    await expect(ahead).rejects.toThrow("[doc.invalid]");

    // Two clients racing to compact at the same N: the first commit wins, the second changes nothing.
    const reader = openPeer(server, owner, documentId, { name: "Reader" });
    await settle(server, [editor.provider, reader.provider]);
    editor.doc.getText("body").insert(0, "late one ");
    await settle(server, [editor.provider, reader.provider]);
    const mine = editor.provider.snapshotState();
    const theirs = reader.provider.snapshotState();
    expect(theirs.throughUpdateId).toBe(mine.throughUpdateId);
    const first = editor.link.transport.compact({ documentId, ...mine, ...serialize(editor.doc) });
    const second = reader.link.transport.compact({ documentId, ...theirs, html: "<p>second</p>", plainText: "second", wordCount: 1 });
    server.pump();
    await Promise.all([first, second]);
    const winner = snapshotRow(server, documentId)!;
    expect(winner.throughUpdateId).toBe(mine.throughUpdateId);
    expect(winner.plainText).toBe(textOf(editor.doc));

    const fresh = openPeer(server, owner, documentId, { name: "Fresh" });
    await settle(server, [editor.provider, reader.provider, fresh.provider]);
    expect(stateOf(fresh.doc)).toEqual(stateOf(editor.doc));
    expect(stateOf(reader.doc)).toEqual(stateOf(editor.doc));
  });

  // Acceptance 4
  test("edits made while detached push the state-vector diff on reattach", async () => {
    const { server, owner, staff, documentId } = await world();
    const a = openPeer(server, staff, documentId, { name: "A" });
    const b = openPeer(server, owner, documentId, { name: "B" });
    await settle(server, [a.provider, b.provider]);

    a.provider.attach(null);
    expect(a.provider.status).toBe("offline");
    for (const word of ["while ", "offline ", "edits "]) a.doc.getText("body").insert(0, word);
    b.doc.getText("body").insert(0, "online edit ");
    await settle(server, [b.provider]);
    expect(a.provider.hasUnsavedChanges()).toBe(true);
    expect(a.provider.status).toBe("offline");
    expect(updateRows(server, documentId).filter((r) => r.sessionId === a.provider.sessionId)).toHaveLength(0);

    a.provider.attach(a.link.docConnection);
    await settle(server, [a.provider, b.provider]);

    const fromA = updateRows(server, documentId).filter((r) => r.sessionId === a.provider.sessionId);
    expect(fromA).toHaveLength(1); // one diff, not the three queued updates
    const pushedSv = Y.decodeStateVector(Y.encodeStateVectorFromUpdate(fromA[0].payload as Uint8Array));
    expect(pushedSv.get(a.doc.clientID)).toBe(Y.decodeStateVector(Y.encodeStateVector(a.doc)).get(a.doc.clientID));
    expect(stateOf(a.doc)).toEqual(stateOf(b.doc));
    expect(textOf(b.doc)).toContain("offline");
    expect(textOf(b.doc)).toContain("online edit");
    expect(a.provider.status).toBe("saved");
  });

  test("a push lost with a dropped connection is re-sent over the new one", async () => {
    const { server, owner, staff, documentId } = await world();
    const a = openPeer(server, staff, documentId, { name: "A" });
    const b = openPeer(server, owner, documentId, { name: "B" });
    await settle(server, [a.provider, b.provider]);
    const oldConnection = a.link.client.connectionId.hex;

    a.doc.getText("body").insert(0, "typed just before the drop");
    await sleep(5); // the push leaves the client but the server never processes it
    expect(server.inboundSize).toBeGreaterThan(0);
    expect(a.provider.hasUnsavedChanges()).toBe(true);

    a.link.reconnect(); // server runs onDisconnect; the queued call is dropped
    a.provider.attach(null);
    expect(server.rows("documentPresence").some((r) => r.connectionId === oldConnection)).toBe(false);
    a.provider.attach(a.link.docConnection);
    await settle(server, [a.provider, b.provider]);

    expect(textOf(b.doc)).toBe("typed just before the drop");
    expect(stateOf(a.doc)).toEqual(stateOf(b.doc));
    const presence = presenceOf(server, a);
    expect(presence).toHaveLength(1);
    expect(presence[0].connectionId).toBe(a.link.client.connectionId.hex);
  });

  // Acceptance 5
  test("[doc.forbidden] flips the provider to read-only and emits accessLost", async () => {
    const { server, owner, staff, ownerLink, documentId } = await world();
    const sam = openPeer(server, staff, documentId, { name: "Sam" });
    const olivia = openPeer(server, owner, documentId, { name: "Olivia" });
    await settle(server, [sam.provider, olivia.provider]);
    sam.doc.getText("body").insert(0, "allowed ");
    await settle(server, [sam.provider, olivia.provider]);
    expect(textOf(olivia.doc)).toBe("allowed ");

    const lost: DocErrorCode[] = [];
    sam.provider.on("accessLost", (code) => lost.push(code));
    const revoke = ownerLink.withActions(() => setDocumentVisibility(documentId, "private"));
    server.pump();
    await revoke;

    sam.doc.getText("body").insert(0, "denied ");
    await waitFor(server, () => lost.length > 0);
    expect(lost).toEqual(["forbidden"]);
    expect(sam.provider.accessLostCode).toBe("forbidden");
    expect(sam.provider.status).toBe("error");
    expect(sam.provider.hasUnsavedChanges()).toBe(true); // the rejected edit stays local, never silently dropped
    expect(sam.provider.peers.find((p) => p.isSelf)?.canEdit).toBe(false);

    const pushes = () => server.callLog.filter((c) => c.reducer === "pushDocumentUpdate").length;
    const pushesAfterLoss = pushes();
    sam.doc.getText("body").insert(0, "ignored "); // read-only now: not queued, not pushed
    await sleep(30);
    server.pump();
    await sleep(0);
    expect(pushes()).toBe(pushesAfterLoss);
    expect(sam.provider.status).toBe("error");
    expect(lost).toEqual(["forbidden"]);

    // setReadOnly(false) means "the app thinks access is back": one retry (re-sync + diff push); the server still refuses.
    sam.provider.setReadOnly(false);
    await waitFor(server, () => lost.length === 2);
    expect(lost).toEqual(["forbidden", "forbidden"]);
    expect(pushes()).toBeLessThanOrEqual(pushesAfterLoss + 1);
    expect(sam.provider.status).toBe("error");
    expect(sam.provider.accessLostCode).toBe("forbidden");

    await settle(server, [olivia.provider]);
    expect(textOf(olivia.doc)).toBe("allowed ");
  });

  test("a document moved to the trash reports accessLost 'trashed'", async () => {
    const { server, staff, ownerLink, documentId } = await world();
    const sam = openPeer(server, staff, documentId, { name: "Sam" });
    await settle(server, [sam.provider]);
    const lost: DocErrorCode[] = [];
    sam.provider.on("accessLost", (code) => lost.push(code));
    const trashed = ownerLink.withActions(() => trashDocument(documentId));
    server.pump();
    await trashed;
    sam.doc.getText("body").insert(0, "too late");
    await waitFor(server, () => lost.length > 0);
    expect(lost).toEqual(["trashed"]);
    expect(sam.provider.status).toBe("error");
  });

  // Acceptance 6
  test("presence rows are removed on setPresenceActive(false) and on destroy", async () => {
    const { server, owner, staff, documentId } = await world();
    const ana = openPeer(server, staff, documentId, { name: "Ana" });
    const ben = openPeer(server, owner, documentId, { name: "Ben" });
    await settle(server, [ana.provider, ben.provider]);
    const names = (peer: Peer) => peer.provider.peers.map((p) => p.name).sort();

    expect(presenceOf(server, ana)).toHaveLength(1);
    expect(presenceOf(server, ben)).toHaveLength(1);
    expect(names(ben)).toEqual(["Ana", "Ben"]);
    expect(ben.provider.peers.find((p) => p.name === "Ana")).toMatchObject({ memberId: staff.memberId, canEdit: true, isSelf: false });

    ana.provider.setPresenceActive(false);
    await settle(server, [ana.provider, ben.provider]);
    expect(presenceOf(server, ana)).toHaveLength(0);
    expect(names(ben)).toEqual(["Ben"]);
    expect(ana.provider.peers.some((p) => p.isSelf)).toBe(false);

    ben.doc.getText("body").insert(0, "sync keeps running while idle");
    await settle(server, [ana.provider, ben.provider]);
    expect(textOf(ana.doc)).toBe("sync keeps running while idle");

    ana.provider.setPresenceActive(true);
    await settle(server, [ana.provider, ben.provider]);
    expect(presenceOf(server, ana)).toHaveLength(1);
    expect(names(ben)).toEqual(["Ana", "Ben"]);

    ana.provider.destroy();
    await settle(server, [ben.provider]);
    expect(presenceOf(server, ana)).toHaveLength(0);
    expect(names(ben)).toEqual(["Ben"]);
  });

  test("destroy still pushes edits that were waiting for the debounce", async () => {
    const { server, owner, staff, documentId } = await world();
    const writer = openPeer(server, staff, documentId, { name: "Writer", tuning: { pushDebounceMs: 60_000, pushMaxWaitMs: 60_000 } });
    const reader = openPeer(server, owner, documentId, { name: "Reader" });
    await settle(server, [writer.provider, reader.provider]);
    writer.doc.getText("body").insert(0, "last words");
    expect(writer.provider.hasUnsavedChanges()).toBe(true);
    writer.provider.destroy();
    await settle(server, [reader.provider]);
    expect(textOf(reader.doc)).toBe("last words");
  });

  test("an edit larger than updateMaxBytes is saved through the snapshot", async () => {
    const { server, owner, staff, documentId } = await world();
    const writer = openPeer(server, staff, documentId, { name: "Writer", tuning: { updateMaxBytes: 256 } });
    const reader = openPeer(server, owner, documentId, { name: "Reader" });
    await settle(server, [writer.provider, reader.provider]);

    const big = "0123456789".repeat(200);
    writer.doc.getText("body").insert(0, big);
    await settle(server, [writer.provider, reader.provider]);

    expect(writer.provider.hasUnsavedChanges()).toBe(false);
    expect(writer.provider.status).toBe("saved");
    expect(updateRows(server, documentId).every((r) => (r.byteLength as number) <= 256)).toBe(true);
    expect(snapshotRow(server, documentId)?.plainText).toBe(big);
    expect(textOf(reader.doc)).toBe(big);
    expect(reader.doc.store.pendingStructs).toBeNull();
    expect(stateOf(reader.doc)).toEqual(stateOf(writer.doc));

    const fresh = openPeer(server, owner, documentId, { name: "Fresh" });
    await settle(server, [writer.provider, reader.provider, fresh.provider]);
    expect(stateOf(fresh.doc)).toEqual(stateOf(writer.doc));
  });

  test("a failed subscription goes offline and re-subscribes with backoff", async () => {
    const { server, staff, documentId } = await world();
    server.failSubscriptions = true;
    const peer = openPeer(server, staff, documentId);
    const errors: string[] = [];
    peer.provider.on("error", (e) => errors.push(e.code));
    server.pump();
    expect(errors).toEqual(["subscription"]);
    expect(peer.provider.status).toBe("offline");
    expect(peer.provider.lastError?.code).toBe("subscription");

    server.failSubscriptions = false;
    await waitFor(server, () => peer.provider.synced);
    await settle(server, [peer.provider]);
    expect(peer.provider.status).toBe("saved");
    expect(peer.provider.lastError).toBeNull();
  });

  test("readOnly providers apply remote edits but never push local ones", async () => {
    const { server, owner, staff, documentId } = await world("org_view");
    const viewer = openPeer(server, staff, documentId, { name: "Viewer", readOnly: true });
    const editor = openPeer(server, owner, documentId, { name: "Editor" });
    await settle(server, [viewer.provider, editor.provider]);
    editor.doc.getText("body").insert(0, "from the editor");
    await settle(server, [viewer.provider, editor.provider]);
    expect(textOf(viewer.doc)).toBe("from the editor");
    viewer.doc.getText("body").insert(0, "local only ");
    expect(viewer.provider.hasUnsavedChanges()).toBe(false);
    expect(viewer.provider.peers.find((p) => p.isSelf)?.canEdit).toBe(false);
    expect(presenceOf(server, viewer)[0].canEdit).toBe(false); // server-computed
  });
});

// Acceptance 7
describe("session cache", () => {
  const offlineTransport: DocTransport = {
    pushUpdate: async () => {},
    compact: async () => {},
    saveVersion: async () => {},
    upsertPresence: async () => {},
    removePresence: async () => {},
  };
  const init: DocSessionInit = { user: { name: "Ana", color: "#336699" }, readOnly: false, transport: offlineTransport };
  const key = (documentId: string, overrides: { organizationId?: string; memberId?: string } = {}) => ({
    documentId,
    organizationId: overrides.organizationId ?? ORG,
    memberId: overrides.memberId ?? "member-1",
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    __resetDocSessionsForTests();
    jest.useRealTimers();
  });

  test("reference counts acquisitions of the same document", () => {
    const id = newDocumentId();
    const first = acquireDocSession(key(id), init);
    const second = acquireDocSession(key(id.toUpperCase()), init);
    expect(second).toBe(first);
    const presence = spyOn(first.provider, "setPresenceActive");

    releaseDocSession(first);
    expect(presence).not.toHaveBeenCalled();
    expect(__docSessionStatsForTests()).toEqual({ total: 1, idle: 0 });

    releaseDocSession(second);
    expect(presence).toHaveBeenCalledTimes(1);
    expect(presence).toHaveBeenLastCalledWith(false);
    expect(__docSessionStatsForTests()).toEqual({ total: 1, idle: 1 });

    releaseDocSession(second); // extra releases are ignored
    expect(presence).toHaveBeenCalledTimes(1);

    const again = acquireDocSession(key(id), init);
    expect(again).toBe(first);
    expect(presence).toHaveBeenLastCalledWith(true);
    expect(__docSessionStatsForTests()).toEqual({ total: 1, idle: 0 });
  });

  test("destroys a released session after 30 s idle, unless it is re-acquired first", () => {
    const id = newDocumentId();
    const session = acquireDocSession(key(id), init);
    const destroy = spyOn(session.provider, "destroy");

    releaseDocSession(session);
    jest.advanceTimersByTime(DOC_SESSION_IDLE_MS - 1);
    expect(destroy).not.toHaveBeenCalled();

    const reused = acquireDocSession(key(id), init);
    expect(reused).toBe(session);
    jest.advanceTimersByTime(DOC_SESSION_IDLE_MS * 2);
    expect(destroy).not.toHaveBeenCalled(); // in use: no idle timer

    releaseDocSession(reused);
    jest.advanceTimersByTime(DOC_SESSION_IDLE_MS - 1);
    expect(destroy).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(session.ydoc.isDestroyed).toBe(true);
    expect(__docSessionStatsForTests()).toEqual({ total: 0, idle: 0 });

    const fresh = acquireDocSession(key(id), init);
    expect(fresh).not.toBe(session);
  });

  test(`keeps at most ${DOC_SESSION_MAX_IDLE} idle sessions, evicting the least recently released`, () => {
    const ids = [newDocumentId(), newDocumentId(), newDocumentId(), newDocumentId(), newDocumentId()];
    const sessions = ids.slice(0, 4).map((id) => acquireDocSession(key(id), init));
    for (const session of sessions) releaseDocSession(session);
    expect(sessions[0].ydoc.isDestroyed).toBe(true);
    expect(sessions.slice(1).map((s) => s.ydoc.isDestroyed)).toEqual([false, false, false]);
    expect(__docSessionStatsForTests()).toEqual({ total: 3, idle: 3 });

    // Re-acquiring and releasing sessions[1] makes it the most recently released.
    releaseDocSession(acquireDocSession(key(ids[1]), init));
    const fifth = acquireDocSession(key(ids[4]), init);
    releaseDocSession(fifth);
    expect(sessions[2].ydoc.isDestroyed).toBe(true);
    expect([sessions[1], sessions[3], fifth].map((s) => s.ydoc.isDestroyed)).toEqual([false, false, false]);

    jest.advanceTimersByTime(DOC_SESSION_IDLE_MS);
    expect(__docSessionStatsForTests()).toEqual({ total: 0, idle: 0 });
  });

  test("a different organization or member gets a different session", () => {
    const id = newDocumentId();
    const base = acquireDocSession(key(id), init);
    expect(acquireDocSession(key(id, { organizationId: "org-other" }), init)).not.toBe(base);
    expect(acquireDocSession(key(id, { memberId: "member-2" }), init)).not.toBe(base);
    expect(__docSessionStatsForTests()).toEqual({ total: 3, idle: 0 });
  });

  test("a session with unsaved edits outlives the idle timeout and the cap", () => {
    const unsaved = acquireDocSession(key(newDocumentId()), init);
    unsaved.ydoc.getText("body").insert(0, "offline edit");
    expect(unsaved.provider.hasUnsavedChanges()).toBe(true);
    expect(hasUnsavedDocSessions()).toBe(true);
    releaseDocSession(unsaved);
    jest.advanceTimersByTime(DOC_SESSION_IDLE_MS * 3);
    expect(unsaved.ydoc.isDestroyed).toBe(false);

    const others = [0, 1, 2].map(() => acquireDocSession(key(newDocumentId()), init));
    for (const session of others) releaseDocSession(session);
    expect(unsaved.ydoc.isDestroyed).toBe(false);
    expect(others[0].ydoc.isDestroyed).toBe(true); // the oldest clean session made room instead
    expect(__docSessionStatsForTests()).toEqual({ total: 3, idle: 3 });
  });
});

describe("DocCollaborationStore (useDocumentCollaboration)", () => {
  test("opens a session, mirrors provider state, and parks the session on close", async () => {
    const { server, staff, documentId } = await world();
    const link = server.link(staff.identity);
    const store = new DocCollaborationStore({ transport: link.transport, tuning: FAST });
    let notifications = 0;
    const unsubscribe = store.subscribe(() => notifications++);
    const memberKey = { documentId, organizationId: ORG, memberId: staff.memberId };

    store.setUser({ name: "Sam", color: "#336699" });
    store.setReadOnly(false);
    store.setConnection(link.docConnection, null);
    expect(store.getSnapshot().provider).toBeNull();

    store.open(memberKey);
    const opened = store.getSnapshot();
    expect(opened.status).toBe("syncing");
    expect(opened.synced).toBe(false);
    const provider = opened.provider!;
    const self = () => ({ yClientId: provider.doc.clientID, documentId }) as const;
    const presenceRows = () =>
      server.rows("documentPresence").filter((r) => r.documentId === self().documentId && r.yClientId === self().yClientId);

    await settle(server, [provider]);
    const synced = store.getSnapshot();
    expect(synced).not.toBe(opened);
    expect(synced).toBe(store.getSnapshot()); // stable until something changes
    expect(synced.synced).toBe(true);
    expect(synced.status).toBe("saved");
    expect(synced.ydoc).toBe(provider.doc);
    expect(synced.peers.some((p) => p.isSelf && p.name === "Sam")).toBe(true);
    expect(presenceRows()).toHaveLength(1);

    store.close();
    expect(store.getSnapshot().provider).toBeNull();
    await settle(server);
    expect(presenceRows()).toHaveLength(0);
    expect(__docSessionStatsForTests()).toEqual({ total: 1, idle: 1 });

    store.open(memberKey);
    expect(store.getSnapshot().provider).toBe(provider); // warm session, no re-sync needed
    expect(store.getSnapshot().synced).toBe(true);
    await settle(server, [provider]);
    expect(presenceRows()).toHaveLength(1);

    store.setReadOnly(true);
    expect(store.getSnapshot().peers.find((p) => p.isSelf)?.canEdit).toBe(false);

    store.setConnection(null, null);
    expect(store.getSnapshot().status).toBe("offline");

    store.close();
    unsubscribe();
    expect(notifications).toBeGreaterThan(3);
  });

  test("surfaces not_published and stays unattached", () => {
    const store = new DocCollaborationStore({
      transport: { pushUpdate: async () => {}, compact: async () => {}, saveVersion: async () => {}, upsertPresence: async () => {}, removePresence: async () => {} },
    });
    store.setConnection(null, { code: "not_published", message: "Docs is not available on this server yet" });
    store.open({ documentId: newDocumentId(), organizationId: ORG, memberId: "member-1" });
    const snapshot = store.getSnapshot();
    expect(snapshot.error?.code).toBe("not_published");
    expect(snapshot.status).toBe("connecting");
    expect(snapshot.synced).toBe(false);
    store.close();
  });
});
