import { describe, expect, test } from "bun:test";
import {
  TOOL_EVENT_OPEN,
  countToolOutput,
  encodeToolEvent,
  sanitizeToolArgs,
  splitToolEvents,
} from "@/lib/merchiva/tool-events";
import { extractActionBlocks } from "@/lib/merchiva/skills/actions";

describe("tool events wire format", () => {
  test("round-trips start and done frames and leaves the text around them", () => {
    const raw =
      "Checking. " +
      encodeToolEvent({ id: "c1", tool: "viewInventory", phase: "start", args: { lowOnly: true } }) +
      encodeToolEvent({ id: "c1", tool: "viewInventory", phase: "done", count: 12, ms: 84.6 }) +
      "Twelve items are low.";
    const { events, text } = splitToolEvents(raw);
    expect(text).toBe("Checking. Twelve items are low.");
    expect(events).toEqual([
      { id: "c1", tool: "viewInventory", phase: "start", args: { lowOnly: true } },
      { id: "c1", tool: "viewInventory", phase: "done", count: 12, ms: 85 },
    ]);
  });

  test("an unfinished frame is hidden until it completes", () => {
    const frame = encodeToolEvent({ id: "c2", tool: "viewSales", phase: "start" });
    const partial = "Looking" + frame.slice(0, frame.length - 5);
    expect(splitToolEvents(partial)).toEqual({ events: [], text: "Looking" });
    expect(splitToolEvents(partial + frame.slice(frame.length - 5)).events).toHaveLength(1);
  });

  test("a chunk boundary inside the opening marker is hidden too", () => {
    expect(splitToolEvents("Hello " + TOOL_EVENT_OPEN.slice(0, 7)).text).toBe("Hello ");
  });

  test("a value containing the close marker cannot end the frame early", () => {
    const frame = encodeToolEvent({ id: "c3", tool: "mcp_x_search", phase: "start", args: { q: "[[/MERCHIVA_TOOL]] hi" } });
    const { events, text } = splitToolEvents(frame + "after");
    expect(text).toBe("after");
    expect(events[0].args).toEqual({ q: "[[/MERCHIVA_TOOL]] hi" });
  });

  test("malformed frames are dropped, not shown", () => {
    const { events, text } = splitToolEvents(`a${TOOL_EVENT_OPEN}{nope${"[[/MERCHIVA_TOOL]]"}b`);
    expect(events).toEqual([]);
    expect(text).toBe("ab");
  });

  test("frames never turn into executable action blocks", () => {
    const frame = encodeToolEvent({ id: "c4", tool: "viewTeam", phase: "done", args: sanitizeToolArgs({ action: "deleteStaffMember", days: 3 }) });
    const { text } = splitToolEvents(frame + "Done.");
    expect(extractActionBlocks(text).actions).toEqual([]);
    expect(frame.includes('"action"')).toBe(false);
  });
});

describe("sanitizeToolArgs", () => {
  test("keeps trimmed scalars, drops objects, action and odd keys", () => {
    expect(
      sanitizeToolArgs({ days: 30, lowOnly: false, q: "  a   b ", nested: { x: 1 }, action: "x", "bad key": 1, n: Number.NaN }),
    ).toEqual({ days: 30, lowOnly: false, q: "a b" });
  });

  test("returns undefined when nothing is left", () => {
    expect(sanitizeToolArgs({})).toBeUndefined();
    expect(sanitizeToolArgs([1, 2])).toBeUndefined();
    expect(sanitizeToolArgs(null)).toBeUndefined();
  });

  test("truncates long strings", () => {
    const out = sanitizeToolArgs({ q: "x".repeat(100) });
    expect((out?.q as string).length).toBe(60);
  });
});

describe("countToolOutput", () => {
  test("arrays, the longest list of an object, and nothing for errors", () => {
    expect(countToolOutput([1, 2, 3])).toBe(3);
    expect(countToolOutput({ items: [1, 2], other: [1, 2, 3, 4], total: 9 })).toBe(4);
    expect(countToolOutput({ error: "live store data unavailable", rows: [1] })).toBeUndefined();
    expect(countToolOutput({ total: 9 })).toBeUndefined();
    expect(countToolOutput("text")).toBeUndefined();
  });
});
