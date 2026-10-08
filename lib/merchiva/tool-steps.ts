/**
 * Tool steps: the tool calls Mr. Merchiva made while writing one reply, shown at the top of his
 * chat bubble (components/merchiva-dock/tool-steps.tsx) and saved on the message
 * (`ChatMessage.steps`) inside `ai_chat_session.messages`.
 *
 * Steps are built from the `[[MERCHIVA_TOOL]]` frames of lib/merchiva/tool-events.ts. Both
 * transports re-deliver every frame on each update — a background job's `partialText` is the
 * whole reply so far, and the streaming loop re-splits the whole body — so every merge here is
 * idempotent and keyed by the tool call id.
 *
 * Pure and dependency-free: used by the chat and by the tests.
 */

import { sanitizeToolArgs, type ToolEvent, type ToolEventArg } from "@/lib/merchiva/tool-events";

export type ToolStepStatus = "running" | "done" | "error" | "interrupted";

export interface ToolStep {
  /** The tool call id; the start and finish frames of one call share it. */
  id: string;
  tool: string;
  /** `interrupted`: the reply ended (or the page reloaded) before this call reported back. */
  status: ToolStepStatus;
  args?: Record<string, ToolEventArg>;
  count?: number;
  ms?: number;
  server?: string;
}

/** A message is saved as part of one session string; a runaway reply must not bloat it. */
export const MAX_TOOL_STEPS = 50;

const STATUSES: readonly ToolStepStatus[] = ["running", "done", "error", "interrupted"];

function makeStep(
  id: string,
  tool: string,
  status: ToolStepStatus,
  extra: Pick<ToolStep, "args" | "count" | "ms" | "server">,
): ToolStep {
  const step: ToolStep = { id, tool, status };
  if (extra.args && Object.keys(extra.args).length > 0) step.args = extra.args;
  if (typeof extra.count === "number" && Number.isFinite(extra.count)) step.count = extra.count;
  if (typeof extra.ms === "number" && Number.isFinite(extra.ms)) step.ms = extra.ms;
  if (extra.server) step.server = extra.server;
  return step;
}

function sameStep(a: ToolStep, b: ToolStep): boolean {
  return (
    a.id === b.id &&
    a.tool === b.tool &&
    a.status === b.status &&
    a.args === b.args &&
    a.count === b.count &&
    a.ms === b.ms &&
    a.server === b.server
  );
}

/** One event applied to the step it belongs to (`undefined` when this is the call's first frame). */
function mergeStep(prev: ToolStep | undefined, event: ToolEvent): ToolStep {
  const finished = event.phase === "done" || event.phase === "error";
  if (!prev) {
    // A finish frame without its start still becomes a step: the start may have been cut off.
    return makeStep(event.id, event.tool, event.phase === "start" ? "running" : event.phase, event);
  }
  if (!finished) {
    // A re-delivered start never moves a finished call back to running. An `interrupted` step was
    // only a guess made when the session reloaded (settleSteps): its job is still streaming.
    const status = prev.status === "interrupted" ? "running" : prev.status;
    return makeStep(prev.id, prev.tool, status, {
      args: prev.args ?? event.args,
      count: prev.count,
      ms: prev.ms,
      server: prev.server ?? event.server,
    });
  }
  return makeStep(prev.id, prev.tool, event.phase === "done" ? "done" : "error", {
    args: prev.args ?? event.args,
    count: event.count ?? prev.count,
    ms: event.ms ?? prev.ms,
    server: prev.server ?? event.server,
  });
}

/**
 * Merges `events` into `steps`: one step per call id, in the order each call first appeared.
 * Returns `steps` itself when nothing changed, so React can skip the render.
 */
export function applyToolEvents(
  steps: ToolStep[] | undefined,
  events: readonly ToolEvent[],
): ToolStep[] | undefined {
  if (events.length === 0) return steps;
  const next = steps ? [...steps] : [];
  let changed = false;
  for (const event of events) {
    const index = next.findIndex((s) => s.id === event.id);
    if (index === -1 && next.length >= MAX_TOOL_STEPS) continue;
    const prev = index === -1 ? undefined : next[index];
    const merged = mergeStep(prev, event);
    if (prev && sameStep(prev, merged)) continue;
    if (index === -1) next.push(merged);
    else next[index] = merged;
    changed = true;
  }
  return changed ? next : steps;
}

/** The reply is over: a call still `running` never reported back, so it is `interrupted`. */
export function settleSteps(steps: ToolStep[] | undefined): ToolStep[] | undefined {
  if (!steps || !steps.some((s) => s.status === "running")) return steps;
  return steps.map((s) => (s.status === "running" ? { ...s, status: "interrupted" } : s));
}

/**
 * Steps read back from a saved session: drops anything malformed and settles calls that were
 * still running when the session was saved. A job that is in fact still streaming revives them
 * with its next update (see mergeStep).
 */
export function restoreSteps(raw: unknown): ToolStep[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const steps: ToolStep[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.tool !== "string") continue;
    if (!STATUSES.includes(r.status as ToolStepStatus)) continue;
    steps.push(makeStep(r.id, r.tool, r.status as ToolStepStatus, {
      args: sanitizeToolArgs(r.args),
      count: typeof r.count === "number" ? r.count : undefined,
      ms: typeof r.ms === "number" ? r.ms : undefined,
      server: typeof r.server === "string" ? r.server : undefined,
    }));
    if (steps.length >= MAX_TOOL_STEPS) break;
  }
  return steps.length > 0 ? settleSteps(steps) : undefined;
}

/**
 * The start events in `events` not seen before, recording them in `seen`. Partial updates hand
 * over every frame again; this keeps each call from moving Mr. Merchiva's cursor more than once.
 */
export function takeNewStarts(seen: Set<string>, events: readonly ToolEvent[]): ToolEvent[] {
  const fresh: ToolEvent[] = [];
  for (const event of events) {
    if (event.phase !== "start" || seen.has(event.id)) continue;
    seen.add(event.id);
    fresh.push(event);
  }
  return fresh;
}

type WithSteps = { id: string; steps?: ToolStep[] };

/** `messages` with `events` merged into message `id`; the same array when nothing changed. */
export function withToolEvents<M extends WithSteps>(messages: M[], id: string, events: readonly ToolEvent[]): M[] {
  if (events.length === 0) return messages;
  let changed = false;
  const next = messages.map((m) => {
    if (m.id !== id) return m;
    const steps = applyToolEvents(m.steps, events);
    if (steps === m.steps) return m;
    changed = true;
    return { ...m, steps };
  });
  return changed ? next : messages;
}

/** `messages` with the steps of message `id` settled; the same array when nothing changed. */
export function withSettledSteps<M extends WithSteps>(messages: M[], id: string): M[] {
  let changed = false;
  const next = messages.map((m) => {
    if (m.id !== id) return m;
    const steps = settleSteps(m.steps);
    if (steps === m.steps) return m;
    changed = true;
    return { ...m, steps };
  });
  return changed ? next : messages;
}
