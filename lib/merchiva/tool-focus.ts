/**
 * Moves Mr. Merchiva's cursor (lib/merchiva/ai-focus.ts) as the chat sees him work: to the page
 * of each read tool he starts, and to the page an action changes right before it runs.
 *
 * The chat calls these; the page mapping is lib/merchiva/tool-targets.ts.
 */

import { getAction } from "@/lib/merchiva/action-registry";
import { finishAiFocus, setAiFocus, touchAiFocus } from "@/lib/merchiva/ai-focus";
import type { ToolEvent } from "@/lib/merchiva/tool-events";
import { takeNewStarts } from "@/lib/merchiva/tool-steps";
import { categoryTarget, toolTarget } from "@/lib/merchiva/tool-targets";

export { finishAiFocus };

/** The scope of a chat outside the browser shell (components/merchiva-dock/dock-panel.tsx). */
export const WINDOW_FOCUS_SCOPE = "__window__";

/** A chat's focus scope: its browser tab id, or the window's when it has no tab. */
export function aiFocusScope(sessionScope: string | undefined): string {
  return sessionScope || WINDOW_FOCUS_SCOPE;
}

/**
 * Points the cursor at the page of every tool call in `events` that `seen` has not started yet.
 * Tools with no page (MCP, unknown) leave it where it is. The chat calls this on every update of a
 * reply still coming in, so each call also tells the cursor's watchdog he is still at work.
 */
export function focusToolStarts(scope: string, seen: Set<string>, events: readonly ToolEvent[]): void {
  touchAiFocus(scope);
  for (const event of takeNewStarts(seen, events)) {
    const target = toolTarget(event.tool);
    if (target) setAiFocus(scope, target, event.tool, "tool");
  }
}

// ── Background jobs ──────────────────────────────────────────────────────────

/**
 * An `ai_job` row unchanged for this long belongs to a dead run: the function was killed (platform
 * time limit, crash) or could not write its end, and nothing will ever finish the job. A live run
 * writes at every tool call and every ~250 ms of text, and cannot outlive the function itself.
 */
export const STALE_JOB_MS = 5 * 60_000;

/**
 * How long until a job last written at `updatedAtMs` goes stale: ≤ 0 once it has. Both stamps are on
 * the server's clock. A job without a stamp never goes stale.
 */
export function jobStaleInMs(updatedAtMs: number, serverNowMs: number): number {
  if (!(updatedAtMs > 0)) return Number.POSITIVE_INFINITY;
  return updatedAtMs + STALE_JOB_MS - serverNowMs;
}

/**
 * Follows job `jobId` of a chat: the tool calls in its frames move the cursor (focusToolStarts).
 * `followed` is the chat's set of jobs it follows, until releaseJobs lets them go.
 */
export function followJobFrames(
  scope: string,
  followed: Set<string>,
  seen: Set<string>,
  jobId: string,
  events: readonly ToolEvent[],
): void {
  followed.add(jobId);
  focusToolStarts(scope, seen, events);
}

/**
 * Stops following jobs that ended without this chat finalizing them — consumed by another window,
 * gone from the table, gone stale. Once no followed job is left the cursor stops working (lingers,
 * then leaves). Returns the ids that were being followed; unknown ids are ignored.
 */
export function releaseJobs(scope: string, followed: Set<string>, jobIds: Iterable<string>): string[] {
  const released: string[] = [];
  for (const id of jobIds) if (followed.delete(id)) released.push(id);
  if (released.length > 0 && followed.size === 0) finishAiFocus(scope);
  return released;
}

/** Points the cursor at the page `actionName` is about to change; no-op for unknown actions. */
export function focusAction(scope: string, actionName: string): void {
  const target = categoryTarget(getAction(actionName)?.category);
  if (target) setAiFocus(scope, target, actionName, "action");
}

/** The role and task commands of a parsed reply (parseAllSkills). */
export interface ReplyCommands {
  rolesAdd: readonly unknown[];
  tasksAdd: readonly unknown[];
  tasksDelete: readonly unknown[];
}

/**
 * A reply finished. Role and task commands run on their own as soon as the reply renders
 * (CommandGroup / TaskDeleteGroup in the chat), without passing through an action card, so the
 * cursor goes to the Roles page for them first; then it lingers and leaves (finishAiFocus).
 */
export function finishReplyFocus(scope: string, reply?: ReplyCommands): void {
  if (reply && (reply.rolesAdd.length > 0 || reply.tasksAdd.length > 0 || reply.tasksDelete.length > 0)) {
    focusAction(scope, "addRole");
  }
  finishAiFocus(scope);
}
