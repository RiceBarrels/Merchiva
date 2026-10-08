import { actionsSkill, toPendingActions } from "./actions";
import { askSkill } from "./ask";
import { rolesSkill } from "./roles";
import { tasksSkill } from "./tasks";
import { memorySkill, parseMemoryCommands } from "./memory";
import { boolParam } from "@/lib/merchiva/action-ids";
import { canonicalUuid } from "@/lib/merchiva/tools/rows";
import type { ChatMessage, MerchivaSkill, PendingAction, QAItem, RoleAddCmd, TaskAddCmd, TaskDeleteCmd } from "./types";

export type { ChatMessage, PendingAction, QAItem, RoleAddCmd, TaskAddCmd, TaskDeleteCmd };

const coreSkills: MerchivaSkill[] = [actionsSkill, askSkill, rolesSkill, tasksSkill, memorySkill];
const dynamicSkills = new Map<string, MerchivaSkill>();

interface MemoryUpdate {
  field: "storeOverview" | "userPreferences";
  value: string;
}

interface ParsedResult {
  cleanText: string;
  actions: PendingAction[];
  actionsList: boolean;
  questions: QAItem[];
  rolesAdd: RoleAddCmd[];
  rolesList: boolean;
  tasksAdd: TaskAddCmd[];
  tasksDelete: TaskDeleteCmd[];
  tasksList: string | null;
  memoryUpdates: MemoryUpdate[];
}

export interface SkillCatalogItem {
  id: string;
  title: string;
  description: string;
  category: NonNullable<MerchivaSkill["category"]>;
  enabledByDefault: boolean;
}

export function registerMerchivaSkill(skill: MerchivaSkill): void {
  if (!skill.id || coreSkills.some((core) => core.id === skill.id)) {
    throw new Error(`Cannot register Merchiva skill "${skill.id}"`);
  }
  dynamicSkills.set(skill.id, skill);
}

export function getRegisteredSkills(): MerchivaSkill[] {
  return [...coreSkills, ...dynamicSkills.values()];
}

export function getSkillCatalog(): SkillCatalogItem[] {
  return getRegisteredSkills().map((skill) => ({
    id: skill.id,
    title: skill.title ?? skill.id,
    description: skill.description ?? "",
    category: skill.category ?? "workflow",
    enabledByDefault: skill.enabledByDefault !== false,
  }));
}

function textParam(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

/** `{ [key]: id }` in the hyphenated form, or nothing when the block has no such id. */
function idField<K extends "roleId" | "taskId">(key: K, v: unknown): Partial<Record<K, string>> {
  const id = textParam(v);
  return id ? ({ [key]: canonicalUuid(id) } as Partial<Record<K, string>>) : {};
}

export function parseAllSkills(text: string): ParsedResult {
  let remaining = text;
  let actions: PendingAction[] = [];
  let actionsList = false;
  let questions: QAItem[] = [];
  let rolesAdd: RoleAddCmd[] = [];
  let rolesList = false;
  let tasksAdd: TaskAddCmd[] = [];
  let tasksDelete: TaskDeleteCmd[] = [];
  let tasksList: string | null = null;

  const actionsResult = actionsSkill.parse(remaining);
  remaining = actionsResult.cleanText;
  if (actionsResult.data) {
    actions = toPendingActions(actionsResult.data.actions);
    actionsList = actionsResult.data.listAll;
  }

  // Convert addRole/updateRole/deleteRole/addRoleTask/etc. action blocks
  // into legacy role/task commands for backward compatibility with the UI
  const roleActions: PendingAction[] = [];
  const otherActions: PendingAction[] = [];
  for (const pa of actions) {
    const name = String(pa.action.action ?? "");
    if (name === "addRole") {
      rolesAdd.push({
        title: String(pa.action.name ?? pa.action.title ?? ""),
        des: String(pa.action.description ?? pa.action.des ?? ""),
        tasks: String(pa.action.tasks ?? ""),
        icon: String(pa.action.icon ?? "user"),
        color: String(pa.action.color ?? "#44403c"),
      });
    } else if (name === "addRoleTask") {
      // Ids and names stay in their own fields: every reader of `role` / `title`
      // shows it to the user, so an id there printed "→ <uuid>" on the card.
      tasksAdd.push({
        role: textParam(pa.action.role ?? pa.action.roleName),
        ...idField("roleId", pa.action.roleId),
        title: textParam(pa.action.title),
        des: String(pa.action.description ?? pa.action.des ?? ""),
        startTime: pa.action.startTime ? String(pa.action.startTime) : null,
        endTime: pa.action.endTime ? String(pa.action.endTime) : null,
        requiresEvidence: boolParam(pa.action.requiresEvidence),
      });
    } else if (name === "deleteRoleTask") {
      tasksDelete.push({
        role: textParam(pa.action.role ?? pa.action.roleName),
        title: textParam(pa.action.title),
        ...idField("roleId", pa.action.roleId),
        ...idField("taskId", pa.action.taskId),
      });
    } else {
      roleActions.push(pa);
      otherActions.push(pa);
    }
  }
  actions = otherActions;

  const askResult = askSkill.parse(remaining);
  remaining = askResult.cleanText;
  if (askResult.data) {
    questions = askResult.data.questions;
  }

  // Legacy /roles text command parsing (backward compat during transition)
  const rolesResult = rolesSkill.parse(remaining);
  remaining = rolesResult.cleanText;
  if (rolesResult.data) {
    rolesAdd = [...rolesAdd, ...rolesResult.data.rolesAdd];
    rolesList = rolesResult.data.rolesList;
  }

  // Legacy /tasks text command parsing (backward compat during transition)
  const tasksResult = tasksSkill.parse(remaining);
  remaining = tasksResult.cleanText;
  if (tasksResult.data) {
    tasksAdd = [...tasksAdd, ...tasksResult.data.tasksAdd];
    tasksDelete = [...tasksDelete, ...tasksResult.data.tasksDelete];
    tasksList = tasksResult.data.tasksList;
  }

  const { cleanText, updates: memoryUpdates } = parseMemoryCommands(remaining);

  return {
    cleanText,
    actions,
    actionsList,
    questions,
    rolesAdd,
    rolesList,
    tasksAdd,
    tasksDelete,
    tasksList,
    memoryUpdates,
  };
}

export function getAllPromptSegments(): string {
  return getRegisteredSkills()
    .filter((skill) => skill.enabledByDefault !== false)
    .map((skill) => skill.promptSegment)
    .join("\n\n");
}

export { executeAction } from "./actions";
export { getActionCatalog } from "@/lib/merchiva/action-registry";
