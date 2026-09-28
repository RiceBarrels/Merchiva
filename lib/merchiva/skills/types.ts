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

export interface TaskAddCmd {
  role: string;
  title: string;
  des: string;
  startTime: string | null;
  endTime: string | null;
  requiresEvidence: boolean;
}

export interface TaskDeleteCmd {
  role: string;
  title: string;
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
  voiceCall?: VoiceCallSummary;
  // Tool calls made while writing this reply, in call order (lib/merchiva/tool-steps.ts).
  steps?: ToolStep[];
}
