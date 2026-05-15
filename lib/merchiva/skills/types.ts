export interface MerchivaSkill<TParsed = unknown> {
  id: string;
  parse(text: string): { cleanText: string; data: TParsed | null };
  promptSegment: string;
}

export interface PendingAction {
  id: string;
  action: Record<string, unknown>;
  status: "pending" | "approved" | "rejected";
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
}
