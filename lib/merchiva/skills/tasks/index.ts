import type { MerchivaSkill, TaskAddCmd, TaskDeleteCmd } from "../types";
import { extractBalancedObject } from "../utils";

interface TasksData {
  tasksAdd: TaskAddCmd[];
  tasksDelete: TaskDeleteCmd[];
  tasksList: string | null;
}

function parseTasksCommands(text: string): { cleanText: string; data: TasksData | null } {
  const tasksAdd: TaskAddCmd[] = [];
  const tasksDelete: TaskDeleteCmd[] = [];
  let tasksList: string | null = null;
  const removals: { start: number; end: number }[] = [];

  const taskAddRe = /\/tasks\s+add\s+['"`]?(?=\{)/g;
  let m: RegExpExecArray | null;
  while ((m = taskAddRe.exec(text)) !== null) {
    const braceStart = text.indexOf("{", m.index + m[0].length - 1);
    if (braceStart === -1) continue;
    const json = extractBalancedObject(text, braceStart);
    if (!json) continue;
    let end = braceStart + json.length;
    if (end < text.length && /['"`]/.test(text[end])) end++;
    try {
      const parsed = JSON.parse(json);
      if (parsed.title && parsed.role) {
        tasksAdd.push({
          role: String(parsed.role),
          title: String(parsed.title),
          des: String(parsed.des ?? parsed.description ?? ""),
          startTime: parsed.startTime ? String(parsed.startTime) : null,
          endTime: parsed.endTime ? String(parsed.endTime) : null,
          requiresEvidence: !!parsed.requiresEvidence,
        });
        removals.push({ start: m.index, end });
      }
    } catch {}
  }

  const taskDelRe = /\/tasks\s+delete\s+['"`]?(?=\{)/g;
  while ((m = taskDelRe.exec(text)) !== null) {
    const braceStart = text.indexOf("{", m.index + m[0].length - 1);
    if (braceStart === -1) continue;
    const json = extractBalancedObject(text, braceStart);
    if (!json) continue;
    let end = braceStart + json.length;
    if (end < text.length && /['"`]/.test(text[end])) end++;
    try {
      const parsed = JSON.parse(json);
      if (parsed.title && parsed.role) {
        tasksDelete.push({
          role: String(parsed.role),
          title: String(parsed.title),
        });
        removals.push({ start: m.index, end });
      }
    } catch {}
  }

  const taskListRe = /\/tasks\s+list\s+['"`]?([^'"`\n]+)['"`]?/g;
  while ((m = taskListRe.exec(text)) !== null) {
    tasksList = m[1].trim();
    removals.push({ start: m.index, end: m.index + m[0].length });
  }

  let cleaned = text;
  removals.sort((a, b) => b.start - a.start);
  for (const r of removals) {
    cleaned = cleaned.slice(0, r.start) + cleaned.slice(r.end);
  }

  const hasData = tasksAdd.length > 0 || tasksDelete.length > 0 || tasksList !== null;
  return { cleanText: cleaned.trim(), data: hasData ? { tasksAdd, tasksDelete, tasksList } : null };
}

export const tasksSkill: MerchivaSkill<TasksData> = {
  id: "tasks",
  title: "Legacy Tasks",
  description: "Backward-compatible parser for role task command syntax.",
  category: "legacy",
  enabledByDefault: true,
  parse: parseTasksCommands,
  promptSegment: `LEGACY TASKS COMMANDS (prefer action blocks instead):
- /tasks list '<RoleName>' — displays tasks for a role.
- /tasks add '{"role":"...","title":"...","des":"..."}' — legacy format, still supported.
- /tasks delete '{"role":"...","title":"..."}' — legacy format, still supported.
PREFERRED: Use action blocks — addRoleTask, updateRoleTask, deleteRoleTask with the real roleId / taskId (see IDS).`,
};
