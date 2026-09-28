/**
 * Tool-call events: how the server tells the chat that Mr. Merchiva called a tool, while the
 * reply is still being written.
 *
 * Events travel inline with the reply text as `[[MERCHIVA_TOOL]]{json}[[/MERCHIVA_TOOL]]`
 * frames — in the streamed `/api/store-ai` body (only when the request opts in with
 * `events: true`) and in `ai_job.partialText` / `finalText` for background jobs. Custom headers
 * are no use here: they are sent once, before any tool has run.
 *
 * Clients strip the frames AFTER peeling the leading `[[MERCHIVA_ACK]]` and BEFORE
 * `extractActionBlocks` / `parseAllSkills`: the action parser also accepts bare JSON objects, so
 * an event must never carry an `action` key (`sanitizeToolArgs` drops it, and `encodeToolEvent`
 * only writes the known fields).
 *
 * Pure and dependency-free: imported by the API routes and by the browser.
 */

export const TOOL_EVENT_OPEN = "[[MERCHIVA_TOOL]]";
export const TOOL_EVENT_CLOSE = "[[/MERCHIVA_TOOL]]";

export type ToolEventPhase = "start" | "done" | "error";
export type ToolEventArg = string | number | boolean;

export interface ToolEvent {
  /** The SDK's toolCallId; the start and finish events of one call share it. */
  id: string;
  /** Tool name as registered with the model (`viewInventory`, `mcp_<label>_<name>`, …). */
  tool: string;
  phase: ToolEventPhase;
  /** Scalar inputs worth showing ("last 30 days", "low stock only"); see sanitizeToolArgs. */
  args?: Record<string, ToolEventArg>;
  /** How many rows the tool returned, when that is meaningful. */
  count?: number;
  /** Wall time of the call in milliseconds (finish events). */
  ms?: number;
  /** MCP server label, for tools that came from a user-connected MCP server. */
  server?: string;
}

const PHASES: readonly ToolEventPhase[] = ["start", "done", "error"];
const MAX_ARGS = 6;
const MAX_ARG_CHARS = 60;
const MAX_ID_CHARS = 120;

/** Keeps the top-level scalar inputs of a tool call, trimmed, never an `action` key. */
export function sanitizeToolArgs(input: unknown): Record<string, ToolEventArg> | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const out: Record<string, ToolEventArg> = {};
  let n = 0;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (n >= MAX_ARGS) break;
    if (key === "action" || !/^[A-Za-z][\w-]{0,40}$/.test(key)) continue;
    if (typeof value === "string") {
      const trimmed = value.replace(/\s+/g, " ").trim();
      if (!trimmed) continue;
      out[key] = trimmed.length > MAX_ARG_CHARS ? `${trimmed.slice(0, MAX_ARG_CHARS - 1)}…` : trimmed;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = value;
    } else if (typeof value === "boolean") {
      out[key] = value;
    } else {
      continue;
    }
    n++;
  }
  return n > 0 ? out : undefined;
}

/**
 * How many rows a tool returned: an array's length, or the longest array property of an object
 * result. `undefined` for errors and results with no list in them.
 */
export function countToolOutput(output: unknown): number | undefined {
  if (Array.isArray(output)) return output.length;
  if (!output || typeof output !== "object") return undefined;
  const record = output as Record<string, unknown>;
  if ("error" in record) return undefined;
  let best: number | undefined;
  for (const value of Object.values(record)) {
    if (Array.isArray(value) && (best === undefined || value.length > best)) best = value.length;
  }
  return best;
}

export function encodeToolEvent(event: ToolEvent): string {
  const body: ToolEvent = { id: event.id.slice(0, MAX_ID_CHARS), tool: event.tool, phase: event.phase };
  if (event.args && Object.keys(event.args).length > 0) body.args = event.args;
  if (typeof event.count === "number" && Number.isFinite(event.count)) body.count = event.count;
  if (typeof event.ms === "number" && Number.isFinite(event.ms)) body.ms = Math.round(event.ms);
  if (event.server) body.server = event.server;
  // JSON never contains the literal close marker: `[` and `/` are not escaped, but a string
  // holding "[[/MERCHIVA_TOOL]]" would end the frame early, so escape its brackets.
  return `${TOOL_EVENT_OPEN}${JSON.stringify(body).replace(/\[\[/g, "[\\u005b")}${TOOL_EVENT_CLOSE}`;
}

function parseEvent(json: string): ToolEvent | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.tool !== "string") return null;
  if (!PHASES.includes(r.phase as ToolEventPhase)) return null;
  const event: ToolEvent = { id: r.id, tool: r.tool, phase: r.phase as ToolEventPhase };
  const args = sanitizeToolArgs(r.args);
  if (args) event.args = args;
  if (typeof r.count === "number" && Number.isFinite(r.count)) event.count = r.count;
  if (typeof r.ms === "number" && Number.isFinite(r.ms)) event.ms = r.ms;
  if (typeof r.server === "string" && r.server) event.server = r.server;
  return event;
}

/**
 * Pulls every complete frame out of `raw`, in order, and returns the text without them. A frame
 * still being streamed (an opening marker with no close yet) is cut from the text too, so a
 * partial reply never shows half a frame; the next call sees it whole.
 */
export function splitToolEvents(raw: string): { events: ToolEvent[]; text: string } {
  if (!raw.includes(TOOL_EVENT_OPEN)) {
    return { events: [], text: stripPartialOpen(raw) };
  }
  const events: ToolEvent[] = [];
  let text = "";
  let cursor = 0;
  while (cursor < raw.length) {
    const open = raw.indexOf(TOOL_EVENT_OPEN, cursor);
    if (open === -1) {
      text += raw.slice(cursor);
      break;
    }
    text += raw.slice(cursor, open);
    const close = raw.indexOf(TOOL_EVENT_CLOSE, open + TOOL_EVENT_OPEN.length);
    if (close === -1) {
      cursor = raw.length; // unfinished frame: drop it until the rest arrives
      break;
    }
    const event = parseEvent(raw.slice(open + TOOL_EVENT_OPEN.length, close));
    if (event) events.push(event);
    cursor = close + TOOL_EVENT_CLOSE.length;
  }
  return { events, text: stripPartialOpen(text) };
}

/** A chunk boundary can split the opening marker itself (`…[[MERCH`); hide that tail. */
function stripPartialOpen(text: string): string {
  const tail = text.lastIndexOf("[[");
  if (tail === -1) return text;
  const rest = text.slice(tail);
  return rest.length < TOOL_EVENT_OPEN.length && TOOL_EVENT_OPEN.startsWith(rest) ? text.slice(0, tail) : text;
}
