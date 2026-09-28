import { describe, expect, test } from "bun:test";
import { splitToolEvents } from "@/lib/merchiva/tool-events";
import { isFailedToolOutput, mcpServerForTool, toolFrameCallbacks } from "@/lib/ai/tool-stream";

function collect(options?: Parameters<typeof toolFrameCallbacks>[1]) {
  const frames: string[] = [];
  const callbacks = toolFrameCallbacks((frame) => frames.push(frame), options);
  const events = () => splitToolEvents(frames.join("")).events;
  return { frames, callbacks, events };
}

describe("tool frame callbacks", () => {
  test("a local tool call emits start then done with count and ms", () => {
    const { callbacks, events } = collect();
    const toolCall = { toolCallId: "call_1", toolName: "viewInventory", input: { lowOnly: true, action: "x" } };
    callbacks.experimental_onToolCallStart({ toolCall });
    callbacks.experimental_onToolCallFinish({
      toolCall,
      durationMs: 41.7,
      success: true,
      output: { items: [1, 2, 3] },
    });
    expect(events()).toEqual([
      { id: "call_1", tool: "viewInventory", phase: "start", args: { lowOnly: true } },
      { id: "call_1", tool: "viewInventory", phase: "done", count: 3, ms: 42 },
    ]);
  });

  test("a thrown tool error is an error frame", () => {
    const { callbacks, events } = collect();
    callbacks.experimental_onToolCallFinish({
      toolCall: { toolCallId: "c2", toolName: "viewSales" },
      durationMs: 5,
      success: false,
      error: new Error("boom"),
    });
    expect(events()).toEqual([{ id: "c2", tool: "viewSales", phase: "error", ms: 5 }]);
  });

  test("a tool that returns { error } is an error frame too", () => {
    const { callbacks, events } = collect();
    callbacks.experimental_onToolCallFinish({
      toolCall: { toolCallId: "c3", toolName: "viewTeam" },
      durationMs: 9,
      success: true,
      output: { error: "live store data unavailable", detail: "x" },
    });
    expect(events()[0]).toMatchObject({ phase: "error" });
    expect(events()[0].count).toBeUndefined();
  });

  test("MCP calls carry the server label on start and finish", () => {
    const { callbacks, events } = collect({ mcpLabels: ["Shop", "Shop Admin"] });
    const toolCall = { toolCallId: "m1", toolName: "mcp_shop_admin_list_orders", input: {} };
    callbacks.experimental_onToolCallStart({ toolCall });
    callbacks.experimental_onToolCallFinish({
      toolCall,
      durationMs: 120,
      success: true,
      output: { server: "Shop Admin", tool: "list_orders", result: { isError: false, content: [] } },
    });
    expect(events()).toEqual([
      { id: "m1", tool: "mcp_shop_admin_list_orders", phase: "start", server: "Shop Admin" },
      { id: "m1", tool: "mcp_shop_admin_list_orders", phase: "done", ms: 120, server: "Shop Admin" },
    ]);
  });

  test("an MCP result flagged isError is an error frame", () => {
    const { callbacks, events } = collect({ mcpLabels: ["Shop"] });
    callbacks.experimental_onToolCallFinish({
      toolCall: { toolCallId: "m2", toolName: "mcp_shop_refund" },
      durationMs: 3,
      success: true,
      output: { server: "Shop", tool: "refund", result: { isError: true, content: [] } },
    });
    expect(events()[0]).toMatchObject({ phase: "error", server: "Shop" });
  });

  test("a failing emit never throws into the SDK", () => {
    const callbacks = toolFrameCallbacks(() => {
      throw new Error("controller closed");
    });
    expect(() =>
      callbacks.experimental_onToolCallStart({ toolCall: { toolCallId: "x", toolName: "viewTeam" } }),
    ).not.toThrow();
  });
});

describe("helpers", () => {
  test("mcpServerForTool matches the normalised key prefix, longest label first", () => {
    expect(mcpServerForTool("mcp_my_crm_search", ["My CRM", "My"])).toBe("My CRM");
    expect(mcpServerForTool("mcp_my_search", ["My CRM", "My"])).toBe("My");
    expect(mcpServerForTool("viewTeam", ["My"])).toBeUndefined();
    expect(mcpServerForTool("mcp_other_x", ["My"])).toBeUndefined();
  });

  test("isFailedToolOutput", () => {
    expect(isFailedToolOutput({ error: "x" })).toBe(true);
    expect(isFailedToolOutput({ result: { isError: true } })).toBe(true);
    expect(isFailedToolOutput({ isError: true })).toBe(true);
    expect(isFailedToolOutput({ rows: [] })).toBe(false);
    expect(isFailedToolOutput([{ error: "row-level field" }])).toBe(false);
    expect(isFailedToolOutput(null)).toBe(false);
  });
});
