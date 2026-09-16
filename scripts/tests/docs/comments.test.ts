import { describe, expect, test } from "bun:test";
import { Fragment, Schema, Slice } from "@tiptap/pm/model";
import { EditorState, type Transaction } from "@tiptap/pm/state";
import { prosemirrorJSONToYDoc, ySyncPlugin } from "@tiptap/y-tiptap";
import * as Y from "yjs";

import { commentQuoteText, pickPostedCommentRange, trackCommentRange } from "@/components/docs/panels/comment-anchor";
import { layoutMarginItems, marginLayoutEnd, samePositions } from "@/components/docs/panels/margin-layout";
import type { DocComment, DocCommentThread } from "@/lib/docs/types";
import { buildThreadViewModels, collectCommentAnchors, filterCommentThreads } from "@/lib/docs/use-comment-threads";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "text*" },
    text: {},
  },
  marks: {
    comment: { attrs: { threadId: { default: null } }, excludes: "", inclusive: false },
    bold: {},
  },
});

function comment(partial: Partial<DocComment> & Pick<DocComment, "id" | "threadId">): DocComment {
  return {
    documentId: "d",
    organizationId: "o",
    parentId: null,
    authorMemberId: "m1",
    body: "body",
    quotedText: null,
    mentions: [],
    status: "open",
    resolvedAt: null,
    resolvedByMemberId: null,
    createdAt: new Date(1_000),
    editedAt: null,
    anchor: null,
    ...partial,
  };
}

function thread(root: DocComment, replies: DocComment[] = []): DocCommentThread {
  return { threadId: root.threadId, root, replies };
}

describe("collectCommentAnchors", () => {
  test("min from / max to per thread, overlapping threads, split ranges", () => {
    const a = schema.marks.comment.create({ threadId: "a" });
    const b = schema.marks.comment.create({ threadId: "b" });
    const bold = schema.marks.bold.create();
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("xx"), schema.text("AB", [a, b]), schema.text("b", [b, bold]), schema.text("--")]),
      schema.node("paragraph", null, [schema.text("more"), schema.text("A2", [a])]),
    ]);
    const anchors = collectCommentAnchors(doc);
    // Paragraph 1 content starts at 1: "xx" 1–3, "AB" 3–5, "b" 5–6. Paragraph 2 starts at 10: "more" 10–14, "A2" 14–16.
    expect(anchors.get("a")).toEqual({ from: 3, to: 16 });
    expect(anchors.get("b")).toEqual({ from: 3, to: 6 });
    expect(anchors.size).toBe(2);
  });
});

describe("buildThreadViewModels", () => {
  const names = new Map([
    ["m1", "Priya"],
    ["m2", "Wei"],
  ]);
  const threads = [
    thread(comment({ id: "r1", threadId: "t1", createdAt: new Date(1_000), quotedText: "quote one" })),
    thread(comment({ id: "r2", threadId: "t2", createdAt: new Date(2_000), authorMemberId: "gone" }), [
      comment({ id: "c1", threadId: "t2", parentId: "r2", createdAt: new Date(9_000), authorMemberId: "m2" }),
    ]),
    thread(comment({ id: "r3", threadId: "t3", createdAt: new Date(3_000), status: "resolved", resolvedByMemberId: "m2", resolvedAt: new Date(4_000) })),
    thread(comment({ id: "r4", threadId: "t4", createdAt: new Date(5_000) })),
  ];

  test("orders by anchor, detached last newest first; names and fallbacks", () => {
    const models = buildThreadViewModels({
      threads,
      anchors: new Map([
        ["t3", { from: 2, to: 5 }],
        ["t1", { from: 10, to: 12 }],
      ]),
      memberName: (id) => names.get(id) ?? null,
      unknownName: "Former member",
    });
    expect(models.map((m) => m.threadId)).toEqual(["t3", "t1", "t2", "t4"]);
    const byId = new Map(models.map((m) => [m.threadId, m]));
    expect(byId.get("t1")?.quote).toBe("quote one");
    expect(byId.get("t1")?.authorName).toBe("Priya");
    expect(byId.get("t2")?.authorName).toBe("Former member");
    expect(byId.get("t2")?.lastActivityAt.getTime()).toBe(9_000);
    expect(byId.get("t3")?.resolved).toBe(true);
    expect(byId.get("t3")?.resolvedByName).toBe("Wei");
    expect(byId.get("t1")?.resolvedByName).toBeNull();
    expect(byId.get("t4")?.anchor).toBeNull();
  });

  test("without anchors every thread is detached, newest activity first", () => {
    const models = buildThreadViewModels({ threads, anchors: null, memberName: () => null, unknownName: "?" });
    expect(models.map((m) => m.threadId)).toEqual(["t2", "t4", "t3", "t1"]);
  });

  test("filterCommentThreads", () => {
    const models = buildThreadViewModels({ threads, anchors: null, memberName: () => null, unknownName: "?" });
    expect(filterCommentThreads(models, "open").map((m) => m.threadId).sort()).toEqual(["t1", "t2", "t4"]);
    expect(filterCommentThreads(models, "resolved").map((m) => m.threadId)).toEqual(["t3"]);
    expect(filterCommentThreads(models, "all")).toBe(models);
  });
});

describe("layoutMarginItems", () => {
  test("no overlap: cards sit at their anchors", () => {
    const out = layoutMarginItems(
      [
        { id: "a", top: 0, height: 40 },
        { id: "b", top: 100, height: 40 },
      ],
      null,
    );
    expect([...out.entries()]).toEqual([
      ["a", 0],
      ["b", 100],
    ]);
  });

  test("overlaps push later cards down", () => {
    const out = layoutMarginItems(
      [
        { id: "b", top: 10, height: 50 },
        { id: "a", top: 0, height: 60 },
        { id: "c", top: 20, height: 30 },
      ],
      null,
    );
    expect(out.get("a")).toBe(0);
    expect(out.get("b")).toBe(68);
    expect(out.get("c")).toBe(126);
  });

  test("active card pins to its anchor and pushes earlier cards up", () => {
    const items = [
      { id: "a", top: 0, height: 60 },
      { id: "b", top: 10, height: 50 },
      { id: "c", top: 20, height: 30 },
    ];
    const out = layoutMarginItems(items, "c");
    expect(out.get("c")).toBe(20);
    expect(out.get("b")).toBe(20 - 50 - 8);
    expect(out.get("a")).toBe(20 - 50 - 8 - 60 - 8);
    expect(marginLayoutEnd(items, out)).toBe(50);
  });

  test("active card in the middle keeps later cards below it", () => {
    const out = layoutMarginItems(
      [
        { id: "a", top: 0, height: 100 },
        { id: "b", top: 50, height: 40 },
        { id: "c", top: 60, height: 40 },
      ],
      "b",
    );
    expect(out.get("b")).toBe(50);
    expect(out.get("c")).toBe(98);
    expect(out.get("a")).toBe(-58);
  });

  test("samePositions", () => {
    expect(samePositions(new Map([["a", 1]]), new Map([["a", 1]]))).toBe(true);
    expect(samePositions(new Map([["a", 1]]), new Map([["a", 2]]))).toBe(false);
    expect(samePositions(new Map(), new Map([["a", 2]]))).toBe(false);
  });
});

describe("posting a comment: anchor range after the reducer round trip", () => {
  const docOf = (...texts: string[]) =>
    schema.node("doc", null, texts.map((text) => schema.node("paragraph", null, text ? [schema.text(text)] : [])));

  test("commentQuoteText matches the editor's quote normalisation", () => {
    const doc = docOf("Order  more", "milk today");
    expect(commentQuoteText(doc, { from: 1, to: doc.content.size - 1 })).toBe("Order more milk today");
  });

  test("the live draft range wins; stale numbers are never used", () => {
    // "Order more milk today": "milk" is 12..16 before a collaborator types "URGENT: " at the start.
    const after = docOf("URGENT: Order more milk today");
    expect(pickPostedCommentRange(after, { from: 20, to: 24 }, { from: 20, to: 24 }, "milk")).toEqual({ from: 20, to: 24 });
    // The draft was lost (y-tiptap's whole-document replace); the tracked range still covers the quote.
    expect(pickPostedCommentRange(after, null, { from: 20, to: 24 }, "milk")).toEqual({ from: 20, to: 24 });
    // A tracked range that no longer covers the quote (misresolved) leaves the thread detached instead of mis-anchored.
    expect(pickPostedCommentRange(after, null, { from: 12, to: 16 }, "milk")).toBeNull();
    expect(pickPostedCommentRange(after, null, null, "milk")).toBeNull();
    expect(pickPostedCommentRange(after, { from: 5, to: 5 }, { from: 90, to: 99 }, "milk")).toBeNull();
  });

  test("outside a collaborative editor nothing is tracked", () => {
    const state = EditorState.create({ schema, doc: docOf("Order more milk today") });
    expect(trackCommentRange(state, { from: 12, to: 16 })).toBeNull();
  });

  test("Yjs-tracked range follows remote edits applied by y-tiptap and drops deleted text", () => {
    const initial = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Intro" }] },
        { type: "paragraph", content: [{ type: "text", text: "Order more milk today" }] },
      ],
    };
    const remote = prosemirrorJSONToYDoc(schema, initial, "default");
    const local = new Y.Doc();
    Y.applyUpdate(local, Y.encodeStateAsUpdate(remote));
    const plugin = ySyncPlugin(local.getXmlFragment("default"));
    let state = EditorState.create({ schema, plugins: [plugin] });
    // Minimal view: y-tiptap renders the Yjs content and applies remote updates through `dispatch`.
    const view = {
      get state() {
        return state;
      },
      dispatch(tr: Transaction) {
        state = state.apply(tr);
      },
      hasFocus: () => false,
    };
    const pluginView = plugin.spec.view?.(view as never);
    const sync = () => Y.applyUpdate(local, Y.encodeStateAsUpdate(remote, Y.encodeStateVector(local)));
    const secondText = (index: number) => ((remote.getXmlFragment("default").get(index) as Y.XmlElement).get(0) as Y.XmlText);

    const from = 8 + "Order more ".length;
    expect(state.doc.textBetween(from, from + 4)).toBe("milk");
    const tracked = trackCommentRange(state, { from, to: from + 4 });
    expect(tracked).not.toBeNull();

    // Remote typing before the quote arrives as one whole-document replace.
    remote.transact(() => secondText(1).insert(0, "URGENT: "));
    sync();
    let range = tracked?.resolve(state) ?? null;
    expect(range && state.doc.textBetween(range.from, range.to)).toBe("milk");
    // Same replace step with the old numbers would point at other text.
    expect(state.doc.textBetween(from, from + 4)).not.toBe("milk");

    // A new paragraph above.
    remote.transact(() => {
      const paragraph = new Y.XmlElement("paragraph");
      paragraph.insert(0, [new Y.XmlText("New first")]);
      remote.getXmlFragment("default").insert(0, [paragraph]);
    });
    sync();
    range = tracked?.resolve(state) ?? null;
    expect(range && state.doc.textBetween(range.from, range.to)).toBe("milk");
    expect(pickPostedCommentRange(state.doc, null, range, "milk")).toEqual(range);

    // The quoted text deleted remotely: nothing to anchor.
    remote.transact(() => secondText(2).delete("URGENT: Order more ".length, 4));
    sync();
    expect(tracked?.resolve(state)).toBeNull();

    // A local replace step (not y-tiptap) still has a document to resolve against.
    const whole = state.tr.replace(0, state.doc.content.size, new Slice(Fragment.from(state.doc.content), 0, 0));
    state = state.apply(whole);
    expect(tracked?.resolve(state)).toBeNull();
    pluginView?.destroy?.();
  });
});
