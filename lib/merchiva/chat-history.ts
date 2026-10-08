/**
 * The `history` a Mr. Merchiva request carries: the chat's messages as
 * user/assistant turns. Pure.
 *
 * A reply's action blocks are parsed out of its text into cards, so the text
 * alone left the model blind to what it had just done: a reply of task cards
 * and no prose was dropped entirely, and the next message ("是一家咖啡店 你安排一下"
 * after the Staff tasks) read as a fresh request — it was taken for a shift
 * schedule. Each reply now ends with one line naming its cards, by the names a
 * person knows (never an id). Cards the user declined are left out.
 */

import { roleRefLabel, type RoleLike } from "@/lib/merchiva/role-ref";
import type { ChatMessage, TaskAddCmd, TaskDeleteCmd } from "@/lib/merchiva/skills/types";
import { looksLikeId } from "@/lib/merchiva/action-ids";

export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

function span(start: string | null, end: string | null): string {
  if (!start) return "";
  return end ? ` ${start}–${end}` : ` ${start}`;
}

function roleName(task: { roleId?: string; role?: string }, roles: readonly RoleLike[]): string {
  return roleRefLabel(roles, task) ?? "unknown role";
}

/** "addRoleTask ×2 → Staff: 开店准备 07:30–08:00, 收银服务" — grouped by role, in order. */
function taskAdds(tasks: readonly TaskAddCmd[], roles: readonly RoleLike[]): string[] {
  const byRole = new Map<string, string[]>();
  for (const task of tasks) {
    const role = roleName(task, roles);
    byRole.set(role, [...(byRole.get(role) ?? []), `${task.title}${span(task.startTime, task.endTime)}`]);
  }
  return [...byRole].map(([role, titles]) => `addRoleTask ×${titles.length} → ${role}: ${titles.join(", ")}`);
}

function taskDeletes(deletes: readonly TaskDeleteCmd[], roles: readonly RoleLike[]): string | null {
  const names = deletes.map((d) => {
    const title = d.taskTitle || (d.title && !looksLikeId(d.title) ? d.title : "a task");
    const role = d.roleName || roleRefLabel(roles, d);
    return role ? `${title} (${role})` : title;
  });
  return names.length > 0 ? `deleteRoleTask ×${names.length}: ${names.join(", ")}` : null;
}

/** One line naming the cards of reply `m`, or "" when it has none left. */
export function cardsNote(m: ChatMessage, roles: readonly RoleLike[] = []): string {
  const parts: string[] = [];
  const rejectedRoles = new Set(m.rejectedRoles ?? []);
  const roleTitles = (m.rolesAdd ?? []).filter((_, i) => !rejectedRoles.has(i)).map((r) => r.title);
  if (roleTitles.length > 0) parts.push(`addRole ×${roleTitles.length}: ${roleTitles.join(", ")}`);
  const rejectedTasks = new Set(m.rejectedTasks ?? []);
  parts.push(...taskAdds((m.tasksAdd ?? []).filter((_, i) => !rejectedTasks.has(i)), roles));
  const cancelled = new Set(m.cancelledDeletes ?? []);
  const deletes = taskDeletes((m.tasksDelete ?? []).filter((_, i) => !cancelled.has(i)), roles);
  if (deletes) parts.push(deletes);
  const counts = new Map<string, number>();
  for (const a of m.actions ?? []) {
    if (a.status === "rejected") continue;
    const name = String(a.action?.action ?? "action");
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  for (const [name, n] of counts) parts.push(`${name} ×${n}`);
  const asked = (m.questions ?? []).map((q) => q.q).filter(Boolean);
  if (asked.length > 0) parts.push(`asked: ${asked.join(" / ")}`);
  return parts.length > 0 ? `[Cards in this reply — ${parts.join("; ")}]` : "";
}

/**
 * The chat as history turns. `roles` (the store's staff_role rows) names a
 * task card's role when the card holds only its id.
 */
export function expandHistoryFromMessages(messages: readonly ChatMessage[], roles: readonly RoleLike[] = []): HistoryTurn[] {
  const out: HistoryTurn[] = [];
  for (const m of messages) {
    if (m.from === "system") continue;
    if (m.from === "voice-call") {
      for (const turn of m.voiceCall?.turns ?? []) {
        if (turn.user) out.push({ role: "user", content: turn.user });
        if (turn.ai) out.push({ role: "assistant", content: turn.ai });
      }
      continue;
    }
    if (m.from === "user") {
      if (m.text) out.push({ role: "user", content: m.text });
      continue;
    }
    const content = [m.text, cardsNote(m, roles)].filter(Boolean).join("\n");
    if (content) out.push({ role: "assistant", content });
  }
  return out;
}
