import { describe, expect, test } from "bun:test";
import type { Editor, JSONContent } from "@tiptap/core";
import { Schema } from "@tiptap/pm/model";
import { prosemirrorJSONToYDoc } from "@tiptap/y-tiptap";
import * as Y from "yjs";

import { VERSION_JSON_CACHE_SIZE, loadVersionJson, restoreDocumentVersion } from "@/lib/docs/versions";
import type { DocVersionKind } from "@/lib/docs/types";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    heading: { group: "block", content: "inline*", attrs: { level: { default: 1 } } },
    text: { group: "inline" },
  },
  marks: { bold: {} },
});

function encode(json: JSONContent): Uint8Array {
  const ydoc = prosemirrorJSONToYDoc(schema, json, "default");
  try {
    return Y.encodeStateAsUpdate(ydoc);
  } finally {
    ydoc.destroy();
  }
}

const SAMPLE: JSONContent = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Opening checklist" }] },
    // y-tiptap always emits `attrs` on marks.
    { type: "paragraph", content: [{ type: "text", text: "Count the " }, { type: "text", text: "drawer", marks: [{ type: "bold", attrs: {} }] }] },
  ],
};

describe("loadVersionJson", () => {
  test("decodes the Yjs state of the default fragment", async () => {
    const json = await loadVersionJson({ id: "v-sample", state: encode(SAMPLE) });
    expect(json).toEqual(SAMPLE);
  });

  test("empty state gives a doc with one paragraph", async () => {
    expect(await loadVersionJson({ id: "v-empty", state: new Uint8Array(0) })).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
    const blank = new Y.Doc();
    const state = Y.encodeStateAsUpdate(blank);
    blank.destroy();
    expect(await loadVersionJson({ id: "v-blank", state })).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });

  test("caches by id (LRU)", async () => {
    const first = await loadVersionJson({ id: "v-cache", state: encode(SAMPLE) });
    // Same id, garbage state: the cached result is returned without decoding.
    const again = await loadVersionJson({ id: "v-cache", state: Uint8Array.from([255, 255, 255]) });
    expect(again).toBe(first);
    for (let i = 0; i < VERSION_JSON_CACHE_SIZE + 1; i++) {
      await loadVersionJson({ id: `v-fill-${i}`, state: new Uint8Array(0) });
    }
    await expect(loadVersionJson({ id: "v-cache", state: Uint8Array.from([255, 255, 255]) })).rejects.toBeDefined();
  });
});

describe("restoreDocumentVersion", () => {
  function fakes(options: { destroyed?: boolean } = {}) {
    const calls: string[] = [];
    const provider = {
      saveVersion: async (kind: DocVersionKind, name?: string) => {
        calls.push(`save:${kind}:${name ?? ""}`);
      },
    };
    let content: unknown = null;
    const editor = {
      isDestroyed: options.destroyed ?? false,
      commands: {
        setContent: (json: unknown, opts: { emitUpdate?: boolean }) => {
          calls.push(`setContent:${opts.emitUpdate}`);
          content = json;
          return true;
        },
      },
    } as unknown as Editor;
    return { calls, provider, editor, content: () => content };
  }

  test("decodes, saves a safety version, then applies as an edit", async () => {
    const f = fakes();
    await restoreDocumentVersion({
      editor: f.editor,
      provider: f.provider,
      version: { id: "v-restore", state: encode(SAMPLE) },
      safetyName: "  Before   restoring 3:04 PM ",
    });
    expect(f.calls).toEqual(["save:restore:Before restoring 3:04 PM", "setContent:true"]);
    expect(f.content()).toEqual(SAMPLE);
  });

  test("a corrupt version changes nothing", async () => {
    const f = fakes();
    await expect(
      restoreDocumentVersion({ editor: f.editor, provider: f.provider, version: { id: "v-bad", state: Uint8Array.from([1, 2, 3]) }, safetyName: "x" }),
    ).rejects.toBeDefined();
    expect(f.calls).toEqual([]);
  });

  test("a destroyed editor rejects after the safety version", async () => {
    const f = fakes({ destroyed: true });
    await expect(
      restoreDocumentVersion({ editor: f.editor, provider: f.provider, version: { id: "v-destroyed", state: encode(SAMPLE) }, safetyName: "x" }),
    ).rejects.toThrow();
    expect(f.calls).toEqual(["save:restore:x"]);
  });
});
