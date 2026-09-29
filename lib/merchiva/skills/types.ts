import type { ToolStep } from "@/lib/merchiva/tool-steps";
import type { GateReason } from "@/lib/merchiva/autonomy-reason";

export interface MerchivaSkill<TParsed = unknown> {
  id: string;
  title?: string;
  description?: string;
  category?: "core" | "workflow" | "memory" | "legacy";
  enabledByDefault?: boolean;
  parse(text: string): { cleanText: string; data: TParsed | null };
  promptSegment: string;
}

export interface PendingAction {
  id: string;
  action: Record<string, unknown>;
  status: "pending" | "approved" | "rejected";
  // Autonomy gate decision, computed when the action is attached to a message:
  //   "auto"    — executes immediately (low-risk under the org's autonomy config)
  //   "propose" — shows Approve/Cancel; runs only on user confirm
  //   "deny"    — the actor lacks the required permission; never runs
  // Absent ⇒ treat as "auto" for backward compatibility with persisted history.
  decision?: "auto" | "propose" | "deny";
  // The gate's rationale in English. The card shows it only for history saved
  // before `why` existed.
  reason?: string;
  // The same rationale as a code plus figures; the card renders it translated.
  why?: GateReason;
  // What each id in the action named when the reply arrived (canonical id →
  // label): a delete removes its row, and the card still shows what it was.
  refLabels?: Record<string, string>;
}

export interface QAItem {
  q: string;
  a: string[];
}

export interface RoleAddCmd {
  title: string;
  des: string;
  tasks: string;
  icon: string;
  color: string;
}

// `role` is a role NAME from the model or a legacy /tasks command; the id of an
// addRoleTask block goes in `roleId`. History saved before that split holds a
// role id in `role`, so readers resolve either field by id or name
// (lib/merchiva/role-ref.ts).
export interface TaskAddCmd {
  role: string;
  roleId?: string;
  title: string;
  des: string;
  startTime: string | null;
  endTime: string | null;
  requiresEvidence: boolean;
}

// A deleteRoleTask block names the task by `taskId`; a legacy command by
// `title` within `role`. When the reply arrives the task it names is pinned
// (role-ref.ts pinTaskDeletes): its stored id, and the title and role name the
// card keeps showing once the row is gone.
export interface TaskDeleteCmd {
  role: string;
  title: string;
  roleId?: string;
  taskId?: string;
  taskTitle?: string;
  roleName?: string;
}

export interface VoiceCallTurn {
  user: string;
  ai: string;
}

export interface VoiceCallSummary {
  durationSec: number;
  turns: VoiceCallTurn[];
}

export interface ChatMessage {
  id: string;
  from: "user" | "merchiva" | "system" | "voice-call";
  text: string;
  time: string;
  actions?: PendingAction[];
  actionsList?: boolean;
  questions?: QAItem[];
  rolesAdd?: RoleAddCmd[];
  rolesList?: boolean;
  tasksAdd?: TaskAddCmd[];
  tasksDelete?: TaskDeleteCmd[];
  tasksList?: string | null;
  executed?: boolean;
  rejectedRoles?: number[];
  rejectedTasks?: number[];
  // tasksDelete items the user declined at the approval step.
  cancelledDeletes?: number[];
  // The reply to a command the user typed (`/tasks delete …`): it still needs the
  // permission, and then runs as typed, without the approval step the autonomy
  // gate puts on Mr. Merchiva's own writes (lib/merchiva/role-task-gate.ts).
  fromCommand?: boolean;
  voiceCall?: VoiceCallSummary;
  // Tool calls made while writing this reply, in call order (lib/merchiva/tool-steps.ts).
  steps?: ToolStep[];
}
