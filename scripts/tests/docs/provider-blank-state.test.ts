// Blank documents start with one empty paragraph (lib/docs/blank-state.ts), built
// with yjs only, identical in structure to y-tiptap's seed for an empty editor doc.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as Y from "yjs";
import { BLANK_PARAGRAPH_ATTRS, blankDocumentInput, buildBlankDocState, DOC_YJS_FIELD } from "@/lib/docs/blank-state";
import { newDocumentId } from "@/lib/docs/ids";
import { buildSeed } from "@/lib/docs/seed";
import { SpacetimeYjsProvider } from "@/lib/docs/spacetime-provider";
import { createDocument } from "@/lib/spacetimedb/actions";
import { clearConnection } from "@/lib/spacetimedb/client";
import { FakeDocServer, settle } from "./fake-server";

const ROOT = join(import.meta.dir, "..", "..", "..");

type TreeNode = { name: string; attrs: Record<string, unknown>; children: TreeNode[] } | { text: unknown };

function walk(type: unknown): TreeNode {
  if (type instanceof Y.XmlElement) return { name: type.nodeName, attrs: type.getAttributes(), children: type.toArray().map(walk) };
  if (type instanceof Y.XmlText) return { text: type.toDelta() };
  throw new Error("unexpected Yjs type");
}

function describeState(state: Uint8Array) {
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, state);
    const decoded = Y.decodeUpdate(state);
    return {
      roots: [...doc.share.keys()],
      nodes: doc.getXmlFragment(DOC_YJS_FIELD).toArray().map(walk),
      structs: decoded.structs.map((s) => s.constructor.name),
      deletes: decoded.ds.clients.size,
    };
  } finally {
    doc.destroy();
  }
}

describe("blank document state", () => {
  test("matches y-tiptap's seed for an empty editor document", () => {
    const seeded = describeState(buildSeed({ type: "doc", content: [{ type: "paragraph" }] }).initialState);
    const blank = describeState(buildBlankDocState());
    expect(blank).toEqual(seeded);
    expect(blank.nodes).toEqual([{ name: "paragraph", attrs: { ...BLANK_PARAGRAPH_ATTRS }, children: [] }]);
    expect(blank.roots).toEqual(["default"]);
  });

  test("createDocument input: fresh state each call, empty text", () => {
    const a = blankDocumentInput();
    const b = blankDocumentInput();
    expect(a).toMatchObject({ templateId: "blank", plainText: "", wordCount: 0 });
    expect(a.initialState.byteLength).toBeGreaterThan(2);
    expect(a.initialState).not.toBe(b.initialState);
  });

  test("the blank path imports yjs only (no Tiptap)", () => {
    const source = readFileSync(join(ROOT, "lib/docs/blank-state.ts"), "utf8");
    const imports = [...source.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]);
    expect(imports).toEqual(["yjs"]);
  });

  test("two first edits on a blank document land in the same paragraph", () => {
    const typeInto = (doc: Y.Doc, text: string) => {
      const fragment = doc.getXmlFragment(DOC_YJS_FIELD);
      if (fragment.length === 0) {
        // What y-tiptap writes when the fragment is empty: a whole new paragraph.
        const paragraph = new Y.XmlElement("paragraph");
        paragraph.insert(0, [new Y.XmlText(text)]);
        fragment.insert(0, [paragraph]);
      } else {
        const paragraph = fragment.get(0) as Y.XmlElement;
        paragraph.insert(0, [new Y.XmlText(text)]);
      }
    };
    const concurrently = (initial: Uint8Array | null) => {
      const [a, b] = [new Y.Doc(), new Y.Doc()];
      if (initial) for (const doc of [a, b]) Y.applyUpdate(doc, initial);
      typeInto(a, "A");
      typeInto(b, "B");
      Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
      Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
      const paragraphs = a.getXmlFragment(DOC_YJS_FIELD).length;
      expect(Y.encodeStateAsUpdate(a)).toEqual(Y.encodeStateAsUpdate(b));
      a.destroy();
      b.destroy();
      return paragraphs;
    };
    expect(concurrently(null)).toBe(2); // the race this fixes
    expect(concurrently(buildBlankDocState())).toBe(1);
  });

  test("a blank document created through the reducer syncs its paragraph to every client", async () => {
    const server = new FakeDocServer();
    const owner = server.addMember({ organizationId: "org-blank", role: "owner" });
    const link = server.link(owner.identity);
    const documentId = newDocumentId();
    const created = link.withActions(() => createDocument({ organizationId: "org-blank", documentId, ...blankDocumentInput() }));
    server.pump();
    await created;
    expect(server.rows("documentSnapshot").find((r) => r.documentId === documentId)?.plainText).toBe("");

    const doc = new Y.Doc();
    const provider = new SpacetimeYjsProvider(doc, {
      documentId,
      organizationId: "org-blank",
      memberId: owner.memberId,
      user: { name: "Olivia", color: "#336699" },
      transport: link.transport,
      tuning: { pushDebounceMs: 0, pushMaxWaitMs: 0, presenceThrottleMs: 0 },
    });
    try {
      provider.attach(link.docConnection);
      await settle(server, [provider]);
      expect(provider.synced).toBe(true);
      expect(doc.getXmlFragment(DOC_YJS_FIELD).toArray().map(walk)).toEqual([
        { name: "paragraph", attrs: { ...BLANK_PARAGRAPH_ATTRS }, children: [] },
      ]);
    } finally {
      provider.destroy();
      doc.destroy();
      clearConnection();
    }
  });
});
