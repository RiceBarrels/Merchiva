// Defense in depth for presence rows: the provider applies a row's awareness bytes only when they are an update for
// exactly that row's yClientId (the server's sanitizeDocAwareness enforces the same shape).

import { describe, expect, test } from "bun:test";
import { Awareness, encodeAwarenessUpdate } from "y-protocols/awareness";
import * as Y from "yjs";

import { awarenessIsForClient } from "@/lib/docs/spacetime-provider";

function awarenessFor(clientId: number): { awareness: Awareness; bytes: Uint8Array } {
  const ydoc = new Y.Doc();
  ydoc.clientID = clientId;
  const awareness = new Awareness(ydoc);
  awareness.setLocalStateField("user", { name: "Olivia", color: "#336699", memberId: "m1" });
  return { awareness, bytes: encodeAwarenessUpdate(awareness, [clientId]) };
}

describe("awarenessIsForClient", () => {
  test("accepts the provider's own single-client update", () => {
    const { awareness, bytes } = awarenessFor(42);
    expect(awarenessIsForClient(bytes, 42)).toBe(true);
    awareness.destroy();
  });

  test("accepts large (u32) client ids", () => {
    const { awareness, bytes } = awarenessFor(4294967295);
    expect(awarenessIsForClient(bytes, 4294967295)).toBe(true);
    awareness.destroy();
  });

  test("rejects an update for another client (a relabelled or moved caret)", () => {
    const { awareness, bytes } = awarenessFor(7);
    expect(awarenessIsForClient(bytes, 42)).toBe(false);
    awareness.destroy();
  });

  test("rejects multi-client updates, empty, truncated and junk bytes", () => {
    const a = awarenessFor(1);
    const b = awarenessFor(2);
    // Merge b's state into a, then encode both clients in one update.
    const merged = new Awareness(a.awareness.doc);
    merged.setLocalState(a.awareness.getLocalState());
    merged.states.set(2, b.awareness.getLocalState() ?? {});
    merged.meta.set(2, { clock: 1, lastUpdated: Date.now() });
    const both = encodeAwarenessUpdate(merged, [1, 2]);
    expect(awarenessIsForClient(both, 1)).toBe(false);
    expect(awarenessIsForClient(new Uint8Array(), 1)).toBe(false);
    expect(awarenessIsForClient(new Uint8Array([1]), 1)).toBe(false);
    expect(awarenessIsForClient(new Uint8Array([1, 0x80]), 0)).toBe(false);
    expect(awarenessIsForClient(new Uint8Array([0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80]), 1)).toBe(false);
    merged.destroy();
    a.awareness.destroy();
    b.awareness.destroy();
  });
});
