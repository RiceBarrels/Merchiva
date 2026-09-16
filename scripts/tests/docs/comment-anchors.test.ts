// Position anchors for comment threads (lead decision L2): commenters can't write the comment mark, so their threads
// carry a Yjs relative-position pair. Checked against real y-tiptap bindings on two Y.Docs (an editor making the
// changes, a commenter receiving them), the comment-mark plugin that renders the highlights, and the module's
// reducer + envelope check over the fake server's tables.

import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { Editor } from "@tiptap/core";
import type { Schema } from "@tiptap/pm/model";
import { EditorState, type Plugin, type Transaction } from "@tiptap/pm/state";
import { findWrapping } from "@tiptap/pm/transform";
import { StarterKit } from "@tiptap/starter-kit";
import { prosemirrorJSONToYDoc, ySyncPlugin } from "@tiptap/y-tiptap";
import * as Y from "yjs";

import {
  COMMENT_ANCHOR_MAX_BYTES,
  captureCommentRange,
  commentBindingMatches,
  decodeCommentAnchorBytes,
  encodeCommentAnchor,
  encodeCommentAnchorBytes,
  getCommentYBinding,
  resolveCommentAnchors,
  resolveCommentRange,
  type CommentRange,
} from "@/lib/docs/comment-anchors";
import {
  COMMENT_RANGE_REFRESH_MS,
  CommentMark,
  commentPluginKey,
  commentThreadsAt,
  decodePositionAnchors,
  getCommentAnchor,
  getCommentDraft,
  getCommentPositionRanges,
  type CommentMeta,
} from "@/lib/docs/extensions/comment-mark";
import { newDocumentId } from "@/lib/docs/ids";
import { mapComment } from "@/lib/docs/mappers";
import type { DocCommentThread } from "@/lib/docs/types";
import { collectPositionAnchorInputs } from "@/lib/docs/use-comment-threads";
import { FakeDocServer, FakeHex, FakeTimestamp, FakeUuid, type FakeMember } from "./fake-server";
import { loadServerDeclarations } from "./server-source";

// ── Harness ──────────────────────────────────────────────────────────────────

// JSON content: string content needs a DOM, which Bun doesn't have.
const schemaEditor = new Editor({
  element: null,
  extensions: [StarterKit.configure({ undoRedo: false }), CommentMark],
  content: { type: "doc", content: [{ type: "paragraph" }] },
});
const schema: Schema = schemaEditor.schema;
const commentPlugin = schemaEditor.extensionManager.plugins.find((plugin) => plugin.spec.key === commentPluginKey) as Plugin;

afterAll(() => {
  schemaEditor.destroy();
});

interface PluginViewLike {
  update?: (view: never, prevState: EditorState) => void;
  destroy?: () => void;
}

interface Client {
  readonly ydoc: Y.Doc;
  readonly state: EditorState;
  dispatch(tr: Transaction): void;
  /** Creates the plugin views (y-tiptap renders the Yjs content on mount). */
  mount(): void;
  destroy(): void;
}

/** A minimal view: y-tiptap writes local transactions to Yjs in its view update and dispatches remote ones. */
function makeClient(ydoc: Y.Doc, extra: readonly Plugin[] = []): Client {
  let state = EditorState.create({ schema, plugins: [ySyncPlugin(ydoc.getXmlFragment("default")), ...extra] });
  const views: PluginViewLike[] = [];
  let destroyed = false;
  const view = {
    get state() {
      return state;
    },
    dispatch(tr: Transaction) {
      if (destroyed) return;
      const prev = state;
      state = state.apply(tr);
      for (const pluginView of [...views]) pluginView.update?.(view as never, prev);
    },
    hasFocus: () => false,
    get isDestroyed() {
      return destroyed;
    },
  };
  return {
    ydoc,
    get state() {
      return state;
    },
    dispatch: (tr) => view.dispatch(tr),
    mount() {
      for (const plugin of state.plugins) {
        const pluginView = plugin.spec.view?.(view as never) as PluginViewLike | undefined;
        if (pluginView) views.push(pluginView);
      }
    },
    destroy() {
      destroyed = true;
      for (const pluginView of views) pluginView.destroy?.();
    },
  };
}

const clients: Client[] = [];
afterAll(() => {
  for (const client of clients) client.destroy();
});

const p = (text: string) => ({ type: "paragraph", content: text ? [{ type: "text", text }] : [] });
const docJSON = (...paragraphs: string[]) => ({ type: "doc", content: paragraphs.map(p) });

function sync(from: Y.Doc, to: Y.Doc): void {
  Y.applyUpdate(to, Y.encodeStateAsUpdate(from, Y.encodeStateVector(to)));
}

/** An editor and a commenter on the same document; `flush` exchanges their Yjs updates. */
function collaborators(json: object, commenterPlugins: readonly Plugin[] = [], mountCommenter = true) {
  const editorDoc = prosemirrorJSONToYDoc(schema, json, "default");
  const commenterDoc = new Y.Doc();
  sync(editorDoc, commenterDoc);
  const editor = makeClient(editorDoc);
  const commenter = makeClient(commenterDoc, commenterPlugins);
  clients.push(editor, commenter);
  editor.mount();
  if (mountCommenter) commenter.mount();
  const flush = () => {
    sync(editorDoc, commenterDoc);
    sync(commenterDoc, editorDoc);
  };
  return { editor, commenter, flush };
}

function find(state: EditorState, text: string, occurrence = 0): CommentRange {
  const found: CommentRange[] = [];
  state.doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      for (let i = node.text.indexOf(text); i >= 0; i = node.text.indexOf(text, i + 1)) {
        found.push({ from: pos + i, to: pos + i + text.length });
      }
    }
    return true;
  });
  const range = found[occurrence];
  if (!range) throw new Error(`"${text}" (#${occurrence}) not found`);
  return range;
}

const textAt = (state: EditorState, range: CommentRange | null | undefined) =>
  range ? state.doc.textBetween(range.from, range.to, " ", " ") : null;

/** What `postThread` sends: the commenter's selection as anchor bytes. */
function anchorFor(client: Client, text: string, occurrence = 0): Uint8Array {
  const bytes = encodeCommentAnchor(client.state, find(client.state, text, occurrence));
  expect(bytes).not.toBeNull();
  return bytes as Uint8Array;
}

function resolveBytes(client: Client, bytes: Uint8Array, quote: string | null): CommentRange | null {
  const decoded = decodeCommentAnchorBytes(bytes);
  expect(decoded).not.toBeNull();
  return resolveCommentRange(client.state, decoded!, quote);
}

// ── Bytes ────────────────────────────────────────────────────────────────────

describe("anchor bytes", () => {
  test("round trip; a real anchor is a few dozen bytes", () => {
    const { commenter } = collaborators(docJSON("Intro", "Order more milk today"));
    const relative = captureCommentRange(commenter.state, find(commenter.state, "milk"));
    expect(relative).not.toBeNull();
    const bytes = encodeCommentAnchorBytes(relative!);
    expect(bytes).not.toBeNull();
    expect(bytes!.length).toBeLessThan(64);
    const decoded = decodeCommentAnchorBytes(bytes);
    expect(Y.encodeRelativePosition(decoded!.start)).toEqual(Y.encodeRelativePosition(relative!.start));
    expect(Y.encodeRelativePosition(decoded!.end)).toEqual(Y.encodeRelativePosition(relative!.end));
  });

  test("malformed, unknown-format and oversized bytes decode to null (the thread is detached)", () => {
    const { commenter } = collaborators(docJSON("Order more milk today"));
    const good = anchorFor(commenter, "milk");
    const oversized = new Uint8Array(COMMENT_ANCHOR_MAX_BYTES + 1);
    oversized.set(good);
    const cases: (Uint8Array | null)[] = [
      null,
      new Uint8Array([]),
      new Uint8Array([1]),
      new Uint8Array([2, ...good.subarray(1)]), // unknown format
      new Uint8Array([1, 3, ...good.subarray(2)]), // unsupported count
      good.subarray(0, good.length - 1), // truncated
      new Uint8Array([...good, 0]), // trailing byte
      new Uint8Array([1, 2, 0x7f, 0, 1]), // length past the end
      oversized,
    ];
    for (const bytes of cases) expect(decodeCommentAnchorBytes(bytes)).toBeNull();
    expect(good[1]).toBe(4);
    const decoded = decodeCommentAnchorBytes(good);
    expect(decoded?.startBlock).not.toBeNull();
    expect(decoded?.endBlock).not.toBeNull();
  });

  test("nothing to anchor outside a collaborative editor, or for an empty range", () => {
    const plain = EditorState.create({ schema, doc: schema.nodeFromJSON(docJSON("Order more milk today")) });
    expect(encodeCommentAnchor(plain, { from: 12, to: 16 })).toBeNull();
    const { commenter } = collaborators(docJSON("Order more milk today"));
    expect(encodeCommentAnchor(commenter.state, { from: 5, to: 5 })).toBeNull();
    expect(encodeCommentAnchor(commenter.state, { from: 5, to: 9_999 })).toBeNull();
  });
});

// ── Resolution ───────────────────────────────────────────────────────────────

describe("resolving a commenter's anchor after collaborators' edits", () => {
  test("follows typing before the quote; typing at either edge stays outside, typing inside is included", () => {
    const { editor, commenter, flush } = collaborators(docJSON("Intro", "Order more milk today"));
    const bytes = anchorFor(commenter, "milk");

    editor.dispatch(editor.state.tr.insertText("URGENT: ", find(editor.state, "Order").from));
    flush();
    expect(textAt(commenter.state, resolveBytes(commenter, bytes, null))).toBe("milk");

    const milk = find(editor.state, "milk");
    editor.dispatch(editor.state.tr.insertText("]", milk.to));
    editor.dispatch(editor.state.tr.insertText("[", milk.from));
    flush();
    expect(commenter.state.doc.textContent).toContain("[milk]");
    expect(textAt(commenter.state, resolveBytes(commenter, bytes, null))).toBe("milk");

    editor.dispatch(editor.state.tr.insertText("-", find(editor.state, "milk").from + 2));
    flush();
    expect(textAt(commenter.state, resolveBytes(commenter, bytes, null))).toBe("mi-lk");
  });

  test("the first characters of the document can be anchored (y-tiptap's misresolve guard doesn't apply)", () => {
    const { editor, commenter, flush } = collaborators(docJSON("Intro", "Body"));
    const bytes = anchorFor(commenter, "Intro");
    expect(find(commenter.state, "Intro").from).toBe(1);
    editor.dispatch(editor.state.tr.insertText("!", find(editor.state, "Body").to));
    flush();
    expect(resolveBytes(commenter, bytes, "Intro")).toEqual({ from: 1, to: 6 });
  });

  test("deleted text detaches; the same text back at that spot (an undo) re-attaches, elsewhere it doesn't", () => {
    const { editor, commenter, flush } = collaborators(docJSON("Intro", "Order more milk today"));
    const bytes = anchorFor(commenter, "milk");

    const milk = find(editor.state, "milk");
    editor.dispatch(editor.state.tr.delete(milk.from, milk.to));
    flush();
    expect(resolveBytes(commenter, bytes, "milk")).toBeNull();

    editor.dispatch(editor.state.tr.insertText("milk", find(editor.state, "Intro").to));
    flush();
    expect(resolveBytes(commenter, bytes, "milk")).toBeNull();

    editor.dispatch(editor.state.tr.insertText("milk", milk.from + "milk".length));
    flush();
    const back = resolveBytes(commenter, bytes, "milk");
    expect(textAt(commenter.state, back)).toBe("milk");
    expect(back).toEqual(find(commenter.state, "milk", 1));
    // Without a quote only the plain relative positions count.
    expect(resolveBytes(commenter, bytes, null)).toBeNull();
  });

  test("a paragraph turned into a heading (y-prosemirror recreates it) re-attaches by its quote", () => {
    const { editor, commenter, flush } = collaborators(docJSON("Intro", "Order more milk today", "Outro milk"));
    const bytes = anchorFor(commenter, "milk");
    const paragraph = find(editor.state, "Order");
    editor.dispatch(editor.state.tr.setBlockType(paragraph.from, paragraph.from, schema.nodes.heading, { level: 2 }));
    flush();
    expect(commenter.state.doc.child(1).type.name).toBe("heading");
    // The Yjs text the positions pointed into is gone…
    expect(resolveBytes(commenter, bytes, null)).toBeNull();
    // …but the quote occurs exactly once in the replacement block (the other "milk" is two blocks away).
    expect(resolveBytes(commenter, bytes, "milk")).toEqual(find(commenter.state, "milk", 0));
  });

  test("a paragraph wrapped into a bullet list re-attaches inside the list", () => {
    const { editor, commenter, flush } = collaborators(docJSON("Intro", "Order more milk today", "Outro milk"));
    const bytes = anchorFor(commenter, "milk");
    const $pos = editor.state.doc.resolve(find(editor.state, "Order").from);
    const blockRange = $pos.blockRange();
    const wrapping = blockRange ? findWrapping(blockRange, schema.nodes.bulletList) : null;
    expect(wrapping).not.toBeNull();
    editor.dispatch(editor.state.tr.wrap(blockRange!, wrapping!));
    flush();
    expect(commenter.state.doc.child(1).type.name).toBe("bulletList");
    expect(resolveBytes(commenter, bytes, null)).toBeNull();
    expect(resolveBytes(commenter, bytes, "milk")).toEqual(find(commenter.state, "milk", 0));
  });

  test("a heading change inside a blockquote re-attaches (the top-level block is kept)", () => {
    const json = {
      type: "doc",
      content: [p("Intro"), { type: "blockquote", content: [p("Order more milk today")] }, p("Outro milk")],
    };
    const { editor, commenter, flush } = collaborators(json);
    const bytes = anchorFor(commenter, "milk");
    const inner = find(editor.state, "Order").from;
    editor.dispatch(editor.state.tr.setBlockType(inner, inner, schema.nodes.heading, { level: 3 }));
    flush();
    expect(commenter.state.doc.child(1).type.name).toBe("blockquote");
    expect(commenter.state.doc.child(1).firstChild?.type.name).toBe("heading");
    expect(resolveBytes(commenter, bytes, null)).toBeNull();
    expect(resolveBytes(commenter, bytes, "milk")).toEqual(find(commenter.state, "milk", 0));
  });

  test("a paragraph deleted outright stays detached, even when a neighbour holds the same quote", () => {
    const { editor, commenter, flush } = collaborators(docJSON("Intro milk", "Order more milk today", "Outro"));
    const bytes = anchorFor(commenter, "milk", 1);
    const start = editor.state.doc.child(0).nodeSize;
    editor.dispatch(editor.state.tr.delete(start, start + editor.state.doc.child(1).nodeSize));
    flush();
    expect(commenter.state.doc.childCount).toBe(2);
    expect(resolveBytes(commenter, bytes, "milk")).toBeNull();
  });

  test("an ambiguous quote in the replaced block stays detached instead of guessing", () => {
    const { editor, commenter, flush } = collaborators(docJSON("Intro", "milk or milk"));
    const bytes = anchorFor(commenter, "milk", 1);
    const paragraph = find(editor.state, "milk or");
    editor.dispatch(editor.state.tr.setBlockType(paragraph.from, paragraph.from, schema.nodes.heading, { level: 1 }));
    flush();
    expect(resolveBytes(commenter, bytes, "milk")).toBeNull();
  });

  test("positions wait until y-tiptap has written a local edit to Yjs", () => {
    const { editor } = collaborators(docJSON("Order more milk today"));
    const bytes = anchorFor(editor, "milk");
    const anchors = decodePositionAnchors(new Map([["t1", { anchor: bytes, quote: "milk" }]]));
    const pending = editor.state.apply(editor.state.tr.insertText("URGENT: ", 1));
    const binding = getCommentYBinding(pending);
    expect(binding).not.toBeNull();
    expect(commentBindingMatches(binding!, pending.doc)).toBe(false);
    expect(resolveCommentAnchors(pending, anchors)).toBeNull();

    editor.dispatch(editor.state.tr.insertText("URGENT: ", 1));
    const resolved = resolveCommentAnchors(editor.state, anchors);
    expect(textAt(editor.state, resolved?.get("t1"))).toBe("milk");
  });
});

// ── Plugin ───────────────────────────────────────────────────────────────────

function setMeta(client: Client, meta: CommentMeta): void {
  client.dispatch(client.state.tr.setMeta(commentPluginKey, meta).setMeta("addToHistory", false));
}

function highlights(state: EditorState): { text: string; className: string }[] {
  const set = commentPluginKey.getState(state)?.decorations;
  return (set?.find() ?? [])
    .map((decoration) => ({
      from: decoration.from,
      text: state.doc.textBetween(decoration.from, decoration.to),
      className: String((decoration as unknown as { type: { attrs: { class?: string } } }).type.attrs.class ?? ""),
    }))
    .sort((a, b) => a.from - b.from)
    .map(({ text, className }) => ({ text, className }));
}

describe("comment-mark plugin: position-anchored highlights", () => {
  test("highlights open threads like the mark, follows remote edits, active and click hits", () => {
    const { editor, commenter, flush } = collaborators(docJSON("Intro", "Order more milk today"), [commentPlugin]);
    const bytes = anchorFor(commenter, "milk");
    setMeta(commenter, {
      openIds: new Set(["t1"]),
      anchors: decodePositionAnchors(new Map([["t1", { anchor: bytes, quote: "milk" }]])),
    });
    expect(highlights(commenter.state)).toEqual([{ text: "milk", className: "doc-comment-hl" }]);

    editor.dispatch(editor.state.tr.insertText("Please: ", find(editor.state, "Order").from));
    flush();
    expect(highlights(commenter.state)).toEqual([{ text: "milk", className: "doc-comment-hl" }]);
    expect(textAt(commenter.state, getCommentAnchor(commenter.state, "t1"))).toBe("milk");

    setMeta(commenter, { activeId: "t1" });
    expect(highlights(commenter.state)).toEqual([{ text: "milk", className: "doc-comment-hl is-active" }]);

    const milk = find(commenter.state, "milk");
    expect(commentThreadsAt(commenter.state, milk.from)).toEqual(["t1"]);
    expect(commentThreadsAt(commenter.state, milk.from + 2)).toEqual(["t1"]);
    expect(commentThreadsAt(commenter.state, milk.to)).toEqual([]);

    // Resolved: no highlight, but the anchor still positions the card in the Resolved list.
    setMeta(commenter, { openIds: new Set() });
    expect(highlights(commenter.state)).toEqual([]);
    expect(getCommentPositionRanges(commenter.state).has("t1")).toBe(true);
  });

  test("a thread's mark wins over its position anchor (one highlight, the mark's range)", () => {
    const json = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Intro", marks: [{ type: "comment", attrs: { threadId: "t2" } }] }] },
        p("Order more milk today"),
      ],
    };
    const { commenter } = collaborators(json, [commentPlugin]);
    const bytes = anchorFor(commenter, "milk");
    setMeta(commenter, {
      openIds: new Set(["t2"]),
      anchors: decodePositionAnchors(new Map([["t2", { anchor: bytes, quote: "milk" }]])),
    });
    expect(highlights(commenter.state)).toEqual([{ text: "Intro", className: "doc-comment-hl" }]);
    expect(textAt(commenter.state, getCommentAnchor(commenter.state, "t2"))).toBe("Intro");
  });

  test("anchors that arrive before the first render resolve on it", () => {
    const { commenter } = collaborators(docJSON("Order more milk today"), [commentPlugin], false);
    // The commenter's view isn't rendered yet, so capture on a second, mounted client of the same document.
    const helper = makeClient(commenter.ydoc);
    clients.push(helper);
    helper.mount();
    const bytes = anchorFor(helper, "milk");
    setMeta(commenter, {
      openIds: new Set(["t1"]),
      anchors: decodePositionAnchors(new Map([["t1", { anchor: bytes, quote: "milk" }]])),
    });
    expect(getCommentPositionRanges(commenter.state).size).toBe(0);
    expect(commentPluginKey.getState(commenter.state)?.refreshSoon).toBe(1);
    commenter.mount();
    expect(textAt(commenter.state, getCommentAnchor(commenter.state, "t1"))).toBe("milk");
    expect(highlights(commenter.state)).toEqual([{ text: "milk", className: "doc-comment-hl" }]);
  });

  test("local edits map the range right away, then converge on the Yjs positions once typing settles", async () => {
    const { editor, commenter, flush } = collaborators(docJSON("Order more milk today"), [commentPlugin]);
    const bytes = anchorFor(commenter, "milk");
    const input = new Map([["t1", { anchor: bytes, quote: "milk" }]]);
    const local = makeClient(editor.ydoc, [commentPlugin]);
    clients.push(local);
    local.mount();
    setMeta(local, { openIds: new Set(["t1"]), anchors: decodePositionAnchors(input) });
    expect(textAt(local.state, getCommentAnchor(local.state, "t1"))).toBe("milk");

    // Pasting identical text over "more milk": the replace step maps the range to nothing, while y-prosemirror's diff
    // leaves Yjs untouched, so the positions still hold.
    const pasted = find(local.state, "more milk");
    local.dispatch(local.state.tr.insertText("more milk", pasted.from, pasted.to));
    expect(getCommentAnchor(local.state, "t1")).toBeNull();
    await Bun.sleep(COMMENT_RANGE_REFRESH_MS + 60);
    expect(textAt(local.state, getCommentAnchor(local.state, "t1"))).toBe("milk");

    // Every client agrees.
    flush();
    setMeta(commenter, { openIds: new Set(["t1"]), anchors: decodePositionAnchors(input) });
    expect(textAt(commenter.state, getCommentAnchor(commenter.state, "t1"))).toBe("milk");
  });

  test("the new-comment draft survives a collaborator's edit and is dropped when its text is deleted", () => {
    const { editor, commenter, flush } = collaborators(docJSON("Intro", "Order more milk today"), [commentPlugin]);
    setMeta(commenter, { draft: find(commenter.state, "milk") });
    editor.dispatch(editor.state.tr.insertText("URGENT: ", find(editor.state, "Order").from));
    flush();
    expect(textAt(commenter.state, getCommentDraft(commenter.state))).toBe("milk");

    const milk = find(editor.state, "milk");
    editor.dispatch(editor.state.tr.delete(milk.from, milk.to));
    flush();
    expect(getCommentDraft(commenter.state)).toBeNull();
  });

  test("decodePositionAnchors keeps unchanged entries and skips undecodable ones", () => {
    const { commenter } = collaborators(docJSON("Order more milk today"));
    const bytes = anchorFor(commenter, "milk");
    const first = decodePositionAnchors(new Map([["t1", { anchor: bytes, quote: "milk" }]]));
    const again = decodePositionAnchors(
      new Map([
        ["t1", { anchor: Uint8Array.from(bytes), quote: "milk" }],
        ["bad", { anchor: new Uint8Array([9, 9, 9]), quote: "x" }],
      ]),
      first,
    );
    expect(again.get("t1")).toBe(first.get("t1"));
    expect(again.has("bad")).toBe(false);
  });
});

describe("thread rows → plugin input", () => {
  test("mapComment keeps the anchor bytes; only threads with one become plugin input", () => {
    const at = { toDate: () => new Date(1_000) };
    const root = mapComment({ id: "r1", documentId: "d", threadId: "t1", body: "b", quotedText: "milk", anchor: new Uint8Array([1, 2, 3]), createdAt: at });
    const bare = mapComment({ id: "r2", documentId: "d", threadId: "t2", body: "b", anchor: undefined, createdAt: at });
    const empty = mapComment({ id: "r3", documentId: "d", threadId: "t3", body: "b", anchor: new Uint8Array(0), createdAt: at });
    expect(root.anchor).toEqual(new Uint8Array([1, 2, 3]));
    expect(bare.anchor).toBeNull();
    expect(empty.anchor).toBeNull();
    const threads: DocCommentThread[] = [root, bare, empty].map((c) => ({ threadId: c.threadId, root: c, replies: [] }));
    const inputs = collectPositionAnchorInputs(threads);
    expect([...inputs.keys()]).toEqual(["t1"]);
    expect(inputs.get("t1")).toEqual({ anchor: root.anchor as Uint8Array, quote: "milk" });
  });
});

// ── Server ───────────────────────────────────────────────────────────────────

class StubSenderError extends Error {}

const typeBuilder: unknown = new Proxy(function typeBuilderStub() {}, {
  get: () => typeBuilder,
  apply: () => typeBuilder,
});

const REDUCERS = ["createDocument", "setDocumentVisibility", "grantDocumentAccess", "addDocumentComment", "replyDocumentComment", "pushDocumentUpdate"] as const;
type ReducerName = (typeof REDUCERS)[number];

const decls = loadServerDeclarations([...REDUCERS, "cleanCommentAnchor"], {
  spacetimedb: { reducer: (_params: unknown, fn: unknown) => fn, clientDisconnected: (fn: unknown) => fn },
  t: typeBuilder,
  SenderError: StubSenderError,
  isServiceCaller: () => false,
});
if (!decls) throw new Error("spacetimedb/src/index.ts does not define the docs comment reducers");
const cleanCommentAnchor = decls.cleanCommentAnchor as (raw: Uint8Array | undefined) => Uint8Array | undefined;

const ORG = "org-comment-anchors";

function world() {
  const server = new FakeDocServer();
  const owner = server.addMember({ organizationId: ORG, role: "owner" });
  const commenter = server.addMember({ organizationId: ORG, role: "staff" });
  let micros = BigInt(Date.now()) * 1000n;
  const call = (member: FakeMember, reducer: ReducerName, args: Record<string, unknown>) => {
    const fn = decls?.[reducer] as (ctx: unknown, args: Record<string, unknown>) => void;
    server.transact((db) =>
      fn(
        {
          db,
          sender: member.identity,
          connectionId: new FakeHex(`conn-${member.memberId}`),
          timestamp: new FakeTimestamp(++micros),
          newUuidV4: () => new FakeUuid(randomUUID()),
        },
        args,
      ),
    );
  };
  const documentId = newDocumentId();
  call(owner, "createDocument", { organizationId: ORG, documentId, title: "Contract", visibility: "org_edit" });
  call(owner, "setDocumentVisibility", { documentId, visibility: "org_view" });
  call(owner, "grantDocumentAccess", { documentId, memberId: commenter.memberId, role: "commenter" });
  return { server, owner, commenter, documentId, call };
}

function realAnchor(): Uint8Array {
  const { commenter } = collaborators(docJSON("Order more milk today"));
  return anchorFor(commenter, "milk");
}

describe("server: addDocumentComment anchor", () => {
  test("the envelope check accepts real anchors and rejects malformed or oversized bytes", () => {
    const good = realAnchor();
    expect(cleanCommentAnchor(good)).toBe(good);
    expect(cleanCommentAnchor(undefined)).toBeUndefined();
    expect(cleanCommentAnchor(new Uint8Array(0))).toBeUndefined();
    const twoPositions = new Uint8Array([1, 2, 2, 0, 0, 2, 0, 0]);
    expect(cleanCommentAnchor(twoPositions)).toBe(twoPositions);
    const invalid = [
      new Uint8Array([2, ...good.subarray(1)]), // unknown format
      new Uint8Array([1]),
      new Uint8Array([1, 3, ...good.subarray(2)]), // unsupported count
      good.subarray(0, good.length - 1), // truncated
      new Uint8Array([...good, 0]), // trailing byte
      new Uint8Array([1, 2, 1, 0, 1, 0]), // entries shorter than a relative position
      new Uint8Array([1, 2, 0xff, 0xff, 0xff, 0x7f, 0, 0]), // length varint too long
    ];
    for (const bytes of invalid) expect(() => cleanCommentAnchor(bytes)).toThrow("[doc.invalid]");
    // The client decoder agrees on every one of them.
    for (const bytes of invalid) expect(decodeCommentAnchorBytes(bytes)).toBeNull();
    expect(() => cleanCommentAnchor(new Uint8Array(COMMENT_ANCHOR_MAX_BYTES + 1).fill(1))).toThrow("[doc.too_large]");
  });

  test("a commenter can't push document updates, but starts an anchored thread; replies carry no anchor", () => {
    const { server, commenter, documentId, call } = world();
    expect(() => call(commenter, "pushDocumentUpdate", { documentId, sessionId: "s", payload: new Uint8Array([1, 0, 0]) })).toThrow(
      "[doc.forbidden]",
    );
    const anchor = realAnchor();
    const threadId = newDocumentId();
    call(commenter, "addDocumentComment", { documentId, threadId, body: "Which brand?", quotedText: "milk", mentions: undefined, anchor });
    call(commenter, "replyDocumentComment", { documentId, threadId, body: "Oat", mentions: undefined });
    const rows = server.rows("documentComment");
    const root = rows.find((row) => row.parentId === undefined);
    const reply = rows.find((row) => row.parentId !== undefined);
    expect(root?.anchor).toEqual(anchor);
    expect(reply?.anchor).toBeUndefined();
    expect(decodeCommentAnchorBytes(mapComment(root).anchor)).not.toBeNull();
  });

  test("a malformed anchor rejects the whole thread; no anchor stays allowed", () => {
    const { server, commenter, documentId, call } = world();
    expect(() =>
      call(commenter, "addDocumentComment", { documentId, threadId: newDocumentId(), body: "x", anchor: new Uint8Array([7, 7, 7, 7]) }),
    ).toThrow("[doc.invalid]");
    expect(server.rows("documentComment")).toHaveLength(0);
    call(commenter, "addDocumentComment", { documentId, threadId: newDocumentId(), body: "x", anchor: undefined });
    expect(server.rows("documentComment")[0]?.anchor).toBeUndefined();
  });
});
