// serializeDeck (lib/slides/serialize.ts): reading order, notes last, escaping, word count and the server's clamps;
// and against FakeDocServer (the module's real docs reducers), a provider compacting a deck with the serializer
// registered, and a second provider converging on the compacted state.
import { afterEach, describe, expect, test } from "bun:test";
import type { JSONContent } from "@tiptap/core";
import * as Y from "yjs";

import { newDocumentId } from "@/lib/docs/ids";
import { SpacetimeYjsProvider, type DocProviderTuning } from "@/lib/docs/spacetime-provider";
import { docWordCount } from "@/lib/docs/text";
import { createDocument } from "@/lib/spacetimedb/actions";
import { clearConnection } from "@/lib/spacetimedb/client";
import { buildDeckState, writeDeckSnapshot } from "@/lib/slides/model/build";
import { sequentialKeys } from "@/lib/slides/model/fractional-index";
import { insertSlide, setSlidesProps } from "@/lib/slides/model/ops-slides";
import { setElementText } from "@/lib/slides/model/ops-elements";
import { readDeckSnapshot } from "@/lib/slides/model/read";
import type { DeckSnapshot, SlideElement, SlideSnapshot } from "@/lib/slides/model/types";
import { serializeDeck, serializeDeckSnapshot, SLIDES_HTML_MAX_CHARS, SLIDES_PLAIN_MAX_CHARS } from "@/lib/slides/serialize";
import { STARTER_THEMES } from "@/lib/slides/themes/themes";
import { FakeDocServer, settle, type FakeMember } from "../docs/fake-server";
import { canonical, sampleDeck } from "./helpers/fixtures";

const para = (...lines: string[]): JSONContent => ({ type: "doc", content: lines.map((text) => (text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" })) });
let n = 0;
function textAt(x: number, y: number, text: string, placeholder = ""): SlideElement {
  return canonical({ id: `t${++n}`, type: "text", placeholder, x, y, w: 100, h: 40, text: para(text) });
}
function slideOf(id: string, order: string, elements: SlideElement[], notes = ""): SlideSnapshot {
  return { id, order, layout: "blank", masterId: "", hidden: false, background: null, transition: null, notes: para(notes), elements };
}
function deckOf(slides: SlideSnapshot[]): DeckSnapshot {
  return { meta: { schemaVersion: 1, size: { w: 960, h: 540 }, theme: STARTER_THEMES.paper, source: null }, masters: [], slides };
}

describe("serializeDeck", () => {
  test("title first, then text top to bottom and left to right, then table cells; notes of all slides last", () => {
    const [k1, k2] = sequentialKeys(2);
    const deck = deckOf([
      slideOf("s1", k1, [textAt(300, 10, "Top right"), textAt(10, 10, "Top left"), textAt(10, 200, "Welcome", "title"), textAt(10, 400, "")], "Say hi"),
      slideOf("s2", k2, [textAt(10, 300, "Lower"), textAt(10, 100, "Upper")], "Thank them"),
    ]);
    const doc = new Y.Doc();
    Y.applyUpdate(doc, buildDeckState(deck));
    const out = serializeDeck(doc);
    expect(out.plainText).toBe("Welcome\nTop left\nTop right\n\nUpper\nLower\n\nSay hi\n\nThank them");
    expect(out.wordCount).toBe(docWordCount(out.plainText));
    expect(out.html).toBe(
      '<section data-slide="1"><h2>Welcome</h2><p>Top left</p><p>Top right</p><aside><p>Say hi</p></aside></section>' +
        '<section data-slide="2"><h2>Upper</h2><p>Lower</p><aside><p>Thank them</p></aside></section>',
    );
  });

  test("table cells row by row (covered cells skipped), hidden slides included, html escaped", () => {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, buildDeckState(sampleDeck()));
    setSlidesProps(doc, ["slideA"], { hidden: true });
    setElementText(doc, "slideA", "shp1", para('<b a="1">&', "x"));
    const out = serializeDeck(doc);
    expect(out.plainText.split("\n\n")).toEqual([
      "Bold colour\nlink2\n• one\n• two\n  3. nested\n<b a=\"1\">&\nx\nItem\nTea\n3.50",
      "Say hello", // both slides' notes (slideB has no text of its own)
      "Say hello",
    ]);
    expect(out.html).toContain("<h2>Bold colour link2 • one • two 3. nested</h2>"); // the title's lines on one line
    expect(out.html).toContain("<p>&lt;b a=&quot;1&quot;&gt;&amp;</p><p>x</p><p>Item</p><p>Tea</p><p>3.50</p>");
    expect(out.html).not.toContain("<b ");
  });

  test("html stops at a section boundary under 1,000,000 characters; plain text is cut at 200,000", () => {
    const keys = sequentialKeys(20);
    const big = "<".repeat(20_000); // 80,000 characters once escaped
    const out = serializeDeckSnapshot(deckOf(keys.map((key, i) => slideOf(`s${i}`, key, [textAt(0, 0, big)]))));
    expect(out.html.length).toBeLessThanOrEqual(SLIDES_HTML_MAX_CHARS);
    expect(out.html.length).toBeGreaterThan(SLIDES_HTML_MAX_CHARS - 90_000);
    expect(out.html.endsWith("</section>")).toBe(true);
    expect(out.html.split("<section").length - 1).toBe(out.html.split("</section>").length - 1);
    expect(out.plainText.length).toBe(SLIDES_PLAIN_MAX_CHARS);
    const emoji = serializeDeckSnapshot(deckOf(keys.map((key, i) => slideOf(`s${i}`, key, [textAt(0, 0, "😀".repeat(10_000))]))));
    expect(emoji.plainText.length).toBeLessThanOrEqual(SLIDES_PLAIN_MAX_CHARS);
    expect(emoji.plainText.at(-1)).not.toBe("\ud83d"); // never half a surrogate pair
  });
});

describe("compaction through the Docs sync stack", () => {
  const ORG = "org-slides-sync";
  const FAST: Partial<DocProviderTuning> = {
    pushDebounceMs: 0, pushMaxWaitMs: 0, presenceThrottleMs: 0, retryBaseMs: 5, retryMaxMs: 40,
    compactMaxRows: 6, compactMaxBytes: 1 << 30, compactMinIntervalMs: 0, autoVersionIntervalMs: 3_600_000,
  };
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    cleanups.splice(0).reverse().forEach((cleanup) => cleanup());
    clearConnection();
  });

  function open(server: FakeDocServer, member: FakeMember, documentId: string) {
    const link = server.link(member.identity);
    const doc = new Y.Doc();
    const provider = new SpacetimeYjsProvider(doc, { documentId, organizationId: ORG, memberId: member.memberId, user: { name: "Peer", color: "#336699" }, transport: link.transport, tuning: FAST });
    provider.setSerializer(() => serializeDeck(doc));
    provider.attach(link.docConnection);
    cleanups.push(() => {
      provider.destroy();
      doc.destroy();
    });
    return { doc, provider };
  }

  test("a provider compacts a deck with serializeDeck and a second provider converges", async () => {
    const server = new FakeDocServer();
    const owner = server.addMember({ organizationId: ORG, role: "owner", displayName: "Olivia" });
    const staff = server.addMember({ organizationId: ORG, role: "staff", displayName: "Sam" });
    const documentId = newDocumentId();
    const ownerLink = server.link(owner.identity);
    const created = ownerLink.withActions(() => createDocument({ organizationId: ORG, documentId, title: "Menu", visibility: "org_edit" }));
    server.pump();
    await created;

    const editor = open(server, owner, documentId);
    await settle(server, [editor.provider]);
    writeDeckSnapshot(editor.doc, sampleDeck());
    await settle(server, [editor.provider]);
    for (let i = 0; i < 8; i++) {
      insertSlide(editor.doc, { afterSlideId: null, layout: "title" });
      await settle(server, [editor.provider]);
    }
    setElementText(editor.doc, "slideA", "txt1", para("Spring menu"));
    await settle(server, [editor.provider]);

    const snapshot = server.rows("documentSnapshot").find((r) => r.documentId === documentId);
    expect(snapshot).toBeDefined();
    expect(server.callLog.some((c) => c.reducer === "compactDocument" && c.ok)).toBe(true);
    expect(String(snapshot!.plainText)).toContain("Sale");
    expect(String(snapshot!.html)).toContain('<section data-slide="1">');
    expect(String(server.rows("document").find((r) => r.id === documentId)!.excerpt)).toContain("Sale");

    const reader = open(server, staff, documentId);
    await settle(server, [editor.provider, reader.provider]);
    expect(readDeckSnapshot(reader.doc)).toEqual(readDeckSnapshot(editor.doc));
    expect(readDeckSnapshot(reader.doc).slides).toHaveLength(10);
    expect(serializeDeck(reader.doc)).toEqual(serializeDeck(editor.doc));
  });
});
