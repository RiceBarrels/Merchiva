// Server-side docs authorization rules that the client can't enforce, run
// against the REAL module code (spacetimedb/src/index.ts, extracted by
// ./server-source.ts) over the fake server's in-memory tables:
// - presence awareness bytes are pinned to the caller's own Yjs client,
// - presence keeps working on a trashed document,
// - clearing a named version's name needs the creator or a manager,
// - the Drive floor (permissions.drive) opens a colleague's private document.

import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";
import { newDocumentId } from "@/lib/docs/ids";
import { FakeDocServer, FakeHex, FakeTimestamp, FakeUuid, type FakeMember, type Row } from "./fake-server";
import { loadServerDeclarations } from "./server-source";

class StubSenderError extends Error {}

const typeBuilder: unknown = new Proxy(function typeBuilderStub() {}, {
  get: () => typeBuilder,
  apply: () => typeBuilder,
});

const REDUCERS = [
  "createDocument",
  "trashDocument",
  "restoreDocument",
  "pushDocumentUpdate",
  "upsertDocumentPresence",
  "saveDocumentVersion",
  "renameDocumentVersion",
  "deleteDocumentVersion",
] as const;
type ReducerName = (typeof REDUCERS)[number];

const decls = loadServerDeclarations([...REDUCERS, "sanitizeDocAwareness"], {
  spacetimedb: { reducer: (_params: unknown, fn: unknown) => fn, clientDisconnected: (fn: unknown) => fn },
  t: typeBuilder,
  SenderError: StubSenderError,
  isServiceCaller: () => false,
});
if (!decls) throw new Error("spacetimedb/src/index.ts does not define the docs reducers");

type Sanitize = (bytes: Uint8Array, yClientId: number, user: { name: string; color: string; memberId: string }) => Uint8Array | null;
const sanitizeDocAwareness = decls.sanitizeDocAwareness as Sanitize;

const ORG = "org-access-server-rules";
const awarenesses: Awareness[] = [];

afterAll(() => {
  for (const a of awarenesses) a.destroy();
});

function awarenessFor(clientID: number): Awareness {
  const doc = new Y.Doc();
  doc.clientID = clientID;
  const awareness = new Awareness(doc);
  awarenesses.push(awareness);
  return awareness;
}

/** What SpacetimeYjsProvider.sendPresence sends for its own client. */
function ownUpdate(clientID: number, state: Record<string, unknown> | null): Uint8Array {
  const awareness = awarenessFor(clientID);
  if (state) awareness.setLocalState(state);
  else removeAwarenessStates(awareness, [clientID], "local");
  return encodeAwarenessUpdate(awareness, [clientID]);
}

/** Applies bytes the way a peer's provider does and returns what it then holds. */
function received(bytes: Uint8Array): { states: Map<number, unknown>; clocks: Map<number, number> } {
  const receiver = awarenessFor(999_999);
  receiver.setLocalState(null);
  applyAwarenessUpdate(receiver, bytes, "remote");
  const states = new Map<number, unknown>();
  receiver.getStates().forEach((state, id) => states.set(id, state));
  const clocks = new Map<number, number>();
  receiver.meta.forEach((meta, id) => clocks.set(id, meta.clock));
  return { states, clocks };
}

const SERVER_USER = { name: "Sam", color: "#336699", memberId: "member-sam" };

describe("sanitizeDocAwareness — presence bytes are pinned to the caller's client", () => {
  test("a genuine provider update passes byte-for-byte when its user fields already match", () => {
    const bytes = ownUpdate(42, { user: { ...SERVER_USER } });
    const out = sanitizeDocAwareness(bytes, 42, SERVER_USER);
    expect(out).not.toBeNull();
    expect([...(out as Uint8Array)]).toEqual([...bytes]);
  });

  test("user name, color and memberId are replaced by the server's values; clock and other fields are kept", () => {
    const awareness = awarenessFor(42);
    awareness.setLocalState({ user: { name: "Owner", color: "red", memberId: "someone-else", avatar: "a.png" }, cursor: { anchor: 3 } });
    awareness.setLocalStateField("cursor", { anchor: 4 }); // bump the clock
    const bytes = encodeAwarenessUpdate(awareness, [42]);
    const { states, clocks } = received(sanitizeDocAwareness(bytes, 42, SERVER_USER) as Uint8Array);
    expect(states.get(42)).toEqual({ user: { name: "Sam", color: "#336699", memberId: "member-sam", avatar: "a.png" }, cursor: { anchor: 4 } });
    expect(clocks.get(42)).toBe(awareness.meta.get(42)?.clock as number);
  });

  test("a state without a user (or with a malformed one) gets the server's user", () => {
    const noUser = sanitizeDocAwareness(ownUpdate(42, { cursor: null }), 42, SERVER_USER) as Uint8Array;
    expect(received(noUser).states.get(42)).toEqual({ cursor: null, user: SERVER_USER });
    const badUser = sanitizeDocAwareness(ownUpdate(42, { user: ["x"] }), 42, SERVER_USER) as Uint8Array;
    expect(received(badUser).states.get(42)).toEqual({ user: SERVER_USER });
  });

  test("a removal (null state) for the caller's own client is accepted as is", () => {
    const bytes = ownUpdate(42, null);
    const out = sanitizeDocAwareness(bytes, 42, SERVER_USER);
    expect([...(out as Uint8Array)]).toEqual([...bytes]);
  });

  test("the largest u32 client id round-trips", () => {
    const max = 0xffff_ffff;
    const out = sanitizeDocAwareness(ownUpdate(max, { user: { name: "x" } }), max, SERVER_USER) as Uint8Array;
    expect(received(out).states.get(max)).toEqual({ user: SERVER_USER });
  });

  test("an update for another client id is rejected (no caret hijacking)", () => {
    expect(sanitizeDocAwareness(ownUpdate(7, { user: { ...SERVER_USER } }), 42, SERVER_USER)).toBeNull();
  });

  test("an update carrying more than one client is rejected", () => {
    const awareness = awarenessFor(42);
    awareness.setLocalState({ user: { ...SERVER_USER } });
    applyAwarenessUpdate(awareness, ownUpdate(7, { user: { name: "Victim" } }), "remote");
    expect(sanitizeDocAwareness(encodeAwarenessUpdate(awareness, [42, 7]), 42, SERVER_USER)).toBeNull();
    expect(sanitizeDocAwareness(encodeAwarenessUpdate(awareness, []), 42, SERVER_USER)).toBeNull();
  });

  test("malformed bytes are rejected", () => {
    const good = ownUpdate(42, { user: { ...SERVER_USER } });
    const withTrailing = new Uint8Array([...good, 0]);
    const cases: Uint8Array[] = [
      new Uint8Array([]),
      new Uint8Array([1]),
      good.subarray(0, good.length - 1),
      withTrailing,
      new Uint8Array([1, 42, 1, 2, 0x5b, 0x5d]), // "[]"
      new Uint8Array([1, 42, 1, 1, 0x37]), // "7"
      new Uint8Array([1, 42, 1, 2, 0x7b, 0x7b]), // "{{"
      new Uint8Array([1, 42, 1, 9, 0x7b, 0x7d]), // length past the end
      new Uint8Array([1, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f, 1, 2, 0x7b, 0x7d]), // unsafe integer
    ];
    for (const bytes of cases) expect(sanitizeDocAwareness(bytes, 42, SERVER_USER)).toBeNull();
    expect(sanitizeDocAwareness(new Uint8Array([1, 42, 1, 2, 0x7b, 0x7d]), 42, SERVER_USER)).not.toBeNull(); // "{}"
  });
});

// ── Reducers over the fake server's tables ───────────────────────────────────

interface World {
  server: FakeDocServer;
  owner: FakeMember;
  manager: FakeMember;
  editor: FakeMember;
  otherEditor: FakeMember;
  documentId: string;
  call(member: FakeMember, reducer: ReducerName, args: Record<string, unknown>, opts?: { atMicros?: bigint; connectionId?: FakeHex }): void;
}

function world(): World {
  const server = new FakeDocServer();
  const owner = server.addMember({ organizationId: ORG, role: "owner" });
  const manager = server.addMember({ organizationId: ORG, role: "manager" });
  const editor = server.addMember({ organizationId: ORG, role: "staff" });
  const otherEditor = server.addMember({ organizationId: ORG, role: "staff" });
  let lastMicros = BigInt(Date.now()) * 1000n;
  const call: World["call"] = (member, reducer, args, opts = {}) => {
    const fn = decls?.[reducer] as (ctx: unknown, args: Record<string, unknown>) => void;
    const micros = opts.atMicros ?? ++lastMicros;
    server.transact((db) =>
      fn(
        {
          db,
          sender: member.identity,
          connectionId: opts.connectionId ?? new FakeHex(`conn-${member.memberId}`),
          timestamp: new FakeTimestamp(micros),
          newUuidV4: () => new FakeUuid(randomUUID()),
        },
        args,
      ),
    );
  };
  const documentId = newDocumentId();
  call(owner, "createDocument", { organizationId: ORG, documentId, title: "Contract", visibility: "org_edit" });
  return { server, owner, manager, editor, otherEditor, documentId, call };
}

const STATE = new Uint8Array([0, 0]);

function versions(server: FakeDocServer): Row[] {
  return server.rows("documentVersion");
}

function versionNamed(server: FakeDocServer, name: string): Row {
  const row = versions(server).find((v) => v.name === name);
  if (!row) throw new Error(`no version named ${name}`);
  return row;
}

describe("upsertDocumentPresence", () => {
  test("stores the sanitized awareness and the cleaned name / color", () => {
    const { server, editor, documentId, call } = world();
    const bytes = ownUpdate(42, { user: { name: "Owner", color: "red", memberId: "spoofed" } });
    call(editor, "upsertDocumentPresence", { documentId, yClientId: 42, name: "  Sam \n Lee ", color: "red", awareness: bytes });
    const [row] = server.rows("documentPresence");
    expect(row).toMatchObject({ yClientId: 42, name: "Sam Lee", color: "#57534e", memberId: editor.memberId, canEdit: true });
    expect(received(row.awareness as Uint8Array).states.get(42)).toEqual({
      user: { name: "Sam Lee", color: "#57534e", memberId: editor.memberId },
    });
  });

  test("rejects awareness bytes for another collaborator's client", () => {
    const { server, editor, documentId, call } = world();
    const victim = ownUpdate(7, { user: { name: "Victim" }, cursor: { anchor: 1 } });
    expect(() =>
      call(editor, "upsertDocumentPresence", { documentId, yClientId: 42, name: "Sam", color: "#336699", awareness: victim }),
    ).toThrow("[doc.invalid]");
    expect(server.rows("documentPresence")).toHaveLength(0);
  });

  test("keeps working on a trashed document (a heartbeat must not end the session), while edits stay rejected", () => {
    const { server, manager, editor, documentId, call } = world();
    call(manager, "trashDocument", { documentId });
    const bytes = ownUpdate(42, { user: { name: "Sam" } });
    call(editor, "upsertDocumentPresence", { documentId, yClientId: 42, name: "Sam", color: "#336699", awareness: bytes });
    call(manager, "upsertDocumentPresence", { documentId, yClientId: 43, name: "Mia", color: "#336699", awareness: ownUpdate(43, { user: {} }) });
    expect(server.rows("documentPresence").map((r) => r.yClientId).sort()).toEqual([42, 43]);
    expect(() => call(editor, "pushDocumentUpdate", { documentId, sessionId: "s", payload: new Uint8Array([1, 0, 0]) })).toThrow(
      "[doc.trashed]",
    );
    call(manager, "restoreDocument", { documentId });
    call(editor, "pushDocumentUpdate", { documentId, sessionId: "s", payload: new Uint8Array([1, 0, 0]) });
    expect(server.rows("documentUpdate")).toHaveLength(1);
  });
});

describe("renameDocumentVersion — clearing a named version's name", () => {
  const save = (w: World, member: FakeMember, kind: string, name: string | undefined, through: bigint, atMicros?: bigint) =>
    w.call(member, "saveDocumentVersion", { documentId: w.documentId, kind, name, state: STATE, throughUpdateId: through, wordCount: 0 }, { atMicros });
  const rename = (w: World, member: FakeMember, versionId: unknown, name: string) =>
    w.call(member, "renameDocumentVersion", { documentId: w.documentId, versionId: String(versionId), name });

  test("an editor who didn't create it can rename it but not clear it (which would let autosave pruning delete it)", () => {
    const w = world();
    save(w, w.manager, "named", "Signed-off contract text", 1n);
    const signed = versionNamed(w.server, "Signed-off contract text");

    expect(() => rename(w, w.editor, signed.id, "   ")).toThrow("[doc.forbidden] Only the creator or a manager can clear the name of a version");
    expect(() => w.call(w.editor, "deleteDocumentVersion", { documentId: w.documentId, versionId: String(signed.id) })).toThrow("[doc.forbidden]");

    rename(w, w.editor, signed.id, "Signed-off (final)");
    expect(versionNamed(w.server, "Signed-off (final)").kind).toBe("named");

    // 51 autosaves, 10+ minutes apart: the named version is never pruned.
    const start = BigInt(Date.now()) * 1000n + 1_000_000_000n;
    for (let i = 0; i < 51; i++) save(w, w.otherEditor, "auto", undefined, BigInt(10 + i), start + BigInt(i) * 601_000_000n);
    expect(versions(w.server).filter((v) => v.kind === "auto")).toHaveLength(50);
    expect(versionNamed(w.server, "Signed-off (final)").id).toBe(signed.id);
  });

  test("the creator and managers can clear it; it becomes an autosave again", () => {
    const w = world();
    save(w, w.editor, "named", "Mine", 1n);
    save(w, w.otherEditor, "named", "Theirs", 2n);
    const mine = versionNamed(w.server, "Mine");
    const theirs = versionNamed(w.server, "Theirs");

    rename(w, w.editor, mine.id, "");
    rename(w, w.manager, theirs.id, "");
    const byId = new Map(versions(w.server).map((v) => [String(v.id), v]));
    expect(byId.get(String(mine.id))).toMatchObject({ kind: "auto", name: undefined });
    expect(byId.get(String(theirs.id))).toMatchObject({ kind: "auto", name: undefined });
  });

  test("any editor may name an autosave or clear the label of a restore point (neither is pruned)", () => {
    const w = world();
    save(w, w.manager, "auto", undefined, 1n);
    save(w, w.manager, "restore", "Before restore", 2n);
    const auto = versions(w.server).find((v) => v.kind === "auto") as Row;
    const restore = versionNamed(w.server, "Before restore");

    rename(w, w.editor, auto.id, "Kept");
    expect(versionNamed(w.server, "Kept").kind).toBe("named");
    rename(w, w.editor, restore.id, "");
    expect(versions(w.server).find((v) => v.id === restore.id)).toMatchObject({ kind: "restore", name: undefined });
  });
});

describe("the Drive floor over the real reducers (permissions.drive)", () => {
  function privateDoc(w: World): string {
    const documentId = newDocumentId();
    w.call(w.owner, "createDocument", { organizationId: ORG, documentId, title: "Payroll", visibility: "private" });
    return documentId;
  }
  const presence = (w: World, member: FakeMember, documentId: string, yClientId: number) =>
    w.call(member, "upsertDocumentPresence", { documentId, yClientId, name: "X", color: "#336699", awareness: ownUpdate(yClientId, { user: {} }) });
  const push = (w: World, member: FakeMember, documentId: string) =>
    w.call(member, "pushDocumentUpdate", { documentId, sessionId: "s", payload: new Uint8Array([1, 0, 0]) });

  test("without drive power a colleague can't open another member's private document", () => {
    const w = world();
    const documentId = privateDoc(w);
    expect(() => presence(w, w.editor, documentId, 11)).toThrow("[doc.forbidden]");
  });

  test("drive.view opens it read-only; drive.edit can edit it", () => {
    const w = world();
    const documentId = privateDoc(w);
    const viewer = w.server.addMember({ organizationId: ORG, permissions: '{"drive":{"view":true}}' });
    const editor = w.server.addMember({ organizationId: ORG, permissions: '{"drive":{"edit":true}}' });
    presence(w, viewer, documentId, 21);
    expect(() => push(w, viewer, documentId)).toThrow("[doc.forbidden]");
    presence(w, editor, documentId, 22);
    push(w, editor, documentId);
    expect(w.server.rows("documentUpdate")).toHaveLength(1);
    expect(w.server.rows("documentPresence").find((p) => p.yClientId === 21)?.canEdit).toBe(false);
    expect(w.server.rows("documentPresence").find((p) => p.yClientId === 22)?.canEdit).toBe(true);
  });

  test("drive power in another organization opens nothing here", () => {
    const w = world();
    const documentId = privateDoc(w);
    const outsider = w.server.addMember({ organizationId: "org-elsewhere", role: "owner", permissions: '{"drive":{"edit":true}}' });
    expect(() => presence(w, outsider, documentId, 31)).toThrow("[doc.forbidden]");
  });
});
