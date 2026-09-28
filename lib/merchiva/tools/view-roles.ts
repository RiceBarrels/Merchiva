/**
 * viewRoles' output: the org's roles, each with its tasks, and the training
 * curriculum (/manager/personnel/training), each day with its objectives. Pure.
 *
 * `role_task.roleId` is stored verbatim from whoever added the task. The
 * manager roles UI and the device Tasks app write the hyphenated uuid, but the
 * chat dashboard's task command card has written the bare 32-hex form, so a
 * task is matched to its role on the canonical form of both — otherwise the
 * model is told a role has no tasks it can see on the page. Objectives are
 * matched to their day (`training_objective.dayId`) the same way.
 */

import { canonicalUuid, opt, rowId, type Row } from "@/lib/merchiva/tools/rows";

/** Objective text is Quill HTML; the model needs enough of it to tell objectives apart, not all of it. */
const OBJECTIVE_TEXT_CHARS = 120;

function plainText(html: unknown, max: number): string {
  const text = String(html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const bySortOrder = (a: Row, b: Row) => Number(a?.sortOrder ?? 0) - Number(b?.sortOrder ?? 0);

/**
 * The curriculum in day order: `dayId` for updateTrainingDay / deleteTrainingDay /
 * addTrainingObjective, `objectiveId` for updateTrainingObjective / deleteTrainingObjective.
 */
export function trainingViews(days: Row[], objectives: Row[]) {
  const byDay = new Map<string, Row[]>();
  for (const o of objectives) {
    const key = canonicalUuid(o?.dayId);
    byDay.set(key, [...(byDay.get(key) ?? []), o]);
  }
  return [...days]
    .sort((a, b) => Number(a?.dayNumber ?? 0) - Number(b?.dayNumber ?? 0) || bySortOrder(a, b))
    .map((d) => {
      const dayId = rowId(d);
      return {
        dayId,
        dayNumber: Number(d.dayNumber),
        title: d.title,
        objectives: [...(byDay.get(canonicalUuid(dayId)) ?? [])].sort(bySortOrder).map((o) => ({
          objectiveId: rowId(o),
          text: plainText(o.text, OBJECTIVE_TEXT_CHARS),
          ...(opt(o.mediaType) ? { mediaType: o.mediaType } : {}),
        })),
      };
    });
}

export function roleViews(roles: Row[], tasks: Row[]) {
  const tasksByRole = new Map<string, Row[]>();
  for (const t of tasks) {
    const key = canonicalUuid(t?.roleId);
    tasksByRole.set(key, [...(tasksByRole.get(key) ?? []), t]);
  }
  return roles.map((r) => {
    const rid = rowId(r);
    return {
      id: rid,
      name: r.name,
      icon: r.icon,
      color: r.color,
      description: r.description,
      tasks: (tasksByRole.get(canonicalUuid(rid)) ?? []).map((t) => ({
        id: rowId(t),
        title: t.title,
        description: t.description,
        startTime: opt(t.startTime),
        endTime: opt(t.endTime),
        requiresEvidence: !!t.requiresEvidence,
      })),
    };
  });
}
