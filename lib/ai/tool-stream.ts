/**
 * Turns the AI SDK's tool-call callbacks into `[[MERCHIVA_TOOL]]` frames (lib/merchiva/tool-events.ts)
 * so the chat can show each call as it happens.
 *
 * Spread the result into streamText: `streamText({ ...toolFrameCallbacks(emit, …), … })`. The SDK
 * awaits both callbacks around every tool execution and swallows anything they throw; `emit`
 * should hand the frame off (enqueue it, buffer it) rather than wait on a network write.
 *
 * Pure apart from the injected `emit` and clock: safe to unit-test.
 */

import {
  countToolOutput,
  encodeToolEvent,
  sanitizeToolArgs,
  type ToolEvent,
} from "@/lib/merchiva/tool-events";

interface ToolCallInfo {
  toolCallId: string;
  toolName: string;
  input?: unknown;
}

/** The part of the SDK's OnToolCallStartEvent this module reads. */
export interface ToolStartLike {
  toolCall: ToolCallInfo;
}

/** The part of the SDK's OnToolCallFinishEvent this module reads. */
export type ToolFinishLike = { toolCall: ToolCallInfo; durationMs: number } & (
  | { success: true; output: unknown }
  | { success: false; error: unknown }
);

export interface ToolFrameCallbacks {
  experimental_onToolCallStart: (event: ToolStartLike) => void;
  experimental_onToolCallFinish: (event: ToolFinishLike) => void;
}

export interface ToolFrameOptions {
  /** Labels of the connected MCP servers, to name the server a `mcp_<label>_<tool>` call went to. */
  mcpLabels?: readonly string[];
}

/** Mirrors the key normalisation in lib/merchiva/mcp/ai-tools.ts (`mcp_<label>_<name>`). */
function mcpKeyPrefix(label: string): string {
  return `mcp_${label}_`.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
}

/** The MCP server a registered tool key belongs to — the longest matching label wins. */
export function mcpServerForTool(toolName: string, labels: readonly string[]): string | undefined {
  if (!toolName.startsWith("mcp_")) return undefined;
  let best: string | undefined;
  let bestLength = 0;
  for (const label of labels) {
    const prefix = mcpKeyPrefix(label);
    if (toolName.startsWith(prefix) && prefix.length > bestLength) {
      best = label;
      bestLength = prefix.length;
    }
  }
  return best;
}

/**
 * A tool that "succeeded" but reports a failure. Local read tools catch their own errors and
 * return `{ error }`; MCP tools return `{ server, tool, result: { isError: true } }`.
 */
export function isFailedToolOutput(output: unknown): boolean {
  if (!output || typeof output !== "object" || Array.isArray(output)) return false;
  const record = output as Record<string, unknown>;
  if (record.error !== undefined && record.error !== null && record.error !== false) return true;
  if (record.isError === true) return true;
  const result = record.result;
  return !!result && typeof result === "object" && (result as Record<string, unknown>).isError === true;
}

export function toolFrameCallbacks(
  emit: (frame: string) => void,
  { mcpLabels = [] }: ToolFrameOptions = {},
): ToolFrameCallbacks {
  const serverFor = (toolName: string, output?: unknown): string | undefined => {
    if (output && typeof output === "object" && !Array.isArray(output)) {
      const server = (output as Record<string, unknown>).server;
      if (typeof server === "string" && server && toolName.startsWith("mcp_")) return server;
    }
    return mcpServerForTool(toolName, mcpLabels);
  };

  const send = (event: ToolEvent) => {
    try {
      emit(encodeToolEvent(event));
    } catch (err) {
      // A closed stream (the client went away) must not fail the tool call.
      console.warn("[tool-stream] could not emit a tool frame:", err instanceof Error ? err.message : err);
    }
  };

  return {
    experimental_onToolCallStart: ({ toolCall }) => {
      send({
        id: toolCall.toolCallId,
        tool: toolCall.toolName,
        phase: "start",
        args: sanitizeToolArgs(toolCall.input),
        server: serverFor(toolCall.toolName),
      });
    },
    experimental_onToolCallFinish: (event) => {
      const { toolCall, durationMs } = event;
      const failed = !event.success || isFailedToolOutput(event.output);
      send({
        id: toolCall.toolCallId,
        tool: toolCall.toolName,
        phase: failed ? "error" : "done",
        count: event.success && !failed ? countToolOutput(event.output) : undefined,
        ms: durationMs,
        server: serverFor(toolCall.toolName, event.success ? event.output : undefined),
      });
    },
  };
}
