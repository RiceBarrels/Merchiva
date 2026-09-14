/**
 * Row shapes for the staffing console. Mirrors lib/spacetimedb/generated/*_table.ts
 * with the adminSql conventions: camelCase keys, uuid/identity as strings,
 * timestamps as unix millis, option none as null.
 */

export interface OrgMemberRow {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  displayName: string;
  email: string;
  permissions: string;
  status: string;
  joinedAt: number;
  punchInCode: string | null;
  hourlyRate: number | null;
}

export interface StaffMemberRow {
  id: string;
  organizationId: string;
  name: string;
  role: string;
  hourlyRate: number;
  availability: string;
  createdAt: number;
  updatedAt: number;
}

export interface StaffRoleRow {
  id: string;
  organizationId: string;
  name: string;
  color: string;
  icon: string;
  description: string;
  permissions: string;
  createdAt: number;
  updatedAt: number;
}

export interface RoleTaskRow {
  id: string;
  roleId: string;
  organizationId: string | null;
  title: string;
  description: string;
  startTime: string | null;
  endTime: string | null;
  sortOrder: number;
  requiresEvidence: boolean;
  notifyChats: string;
  createdAt: number;
}

export interface RoleTaskAssignmentRow {
  id: string;
  organizationId: string;
  taskId: string;
  memberId: string;
  dueAt: number;
  status: string;
  evidenceUrl: string | null;
  note: string | null;
  completedAt: number | null;
  completedBy: string | null;
  skipReason: string | null;
  createdAt: number;
  createdBy: string;
  evidenceUrls: string | null;
}

export interface ShiftRow {
  id: string;
  organizationId: string;
  memberId: string | null;
  staffName: string;
  staffRole: string | null;
  staffRoles: string;
  date: string;
  shiftType: string;
  startTime: string;
  endTime: string;
  predictedDemand: string;
  createdAt: number;
}

export interface ShiftPresetRow {
  id: string;
  organizationId: string;
  name: string;
  startTime: string;
  endTime: string;
  color: string;
  sortOrder: number;
  createdAt: number;
}

export interface ShiftTradeRow {
  id: string;
  organizationId: string;
  shiftId: string;
  requesterId: string;
  targetId: string;
  targetShiftId: string | null;
  type: string;
  status: string;
  managerApproved: boolean;
  managerId: string | null;
  comments: string;
  createdAt: number;
  broadcastToAll: boolean;
  acceptedById: string | null;
}

export interface TimeOffRequestRow {
  id: string;
  userId: string;
  organizationId: string;
  startDate: string;
  endDate: string;
  fullDays: boolean;
  startTime: string | null;
  endTime: string | null;
  comments: string;
  status: string;
  reviewedBy: string | null;
  reviewedAt: number | null;
  createdAt: number;
}

export interface StaffAvailabilityRow {
  id: string;
  userId: string;
  organizationId: string;
  type: string;
  startDate: string | null;
  endDate: string | null;
  days: string;
  dayTimes: string;
  status: string;
  fullDay: boolean;
  startTime: string | null;
  endTime: string | null;
  comments: string;
  createdAt: number;
}

export interface PunchEventRow {
  id: string;
  organizationId: string;
  memberId: string;
  pin: string;
  action: string;
  at: number;
  closed: boolean;
  pairEventId: string | null;
  createdAt: number;
}

export interface TrainingDayRow {
  id: string;
  organizationId: string;
  dayNumber: number;
  title: string;
  description: string | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface TrainingObjectiveRow {
  id: string;
  organizationId: string;
  dayId: string;
  text: string;
  mediaUrl: string | null;
  mediaType: string | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface TrainingDayGradeRow {
  id: string;
  organizationId: string;
  traineeId: string;
  dayId: string;
  rating: number;
  comment: string | null;
  gradedBy: string;
  gradedAt: number;
}

export interface TrainingObjectiveGradeRow {
  id: string;
  organizationId: string;
  traineeId: string;
  objectiveId: string;
  status: string;
  comment: string | null;
  gradedBy: string;
  gradedAt: number;
}

export interface TrainingReviewRequestRow {
  id: string;
  organizationId: string;
  traineeId: string;
  dayId: string;
  status: string;
  createdAt: number;
  resolvedAt: number | null;
  resolvedBy: string | null;
}
