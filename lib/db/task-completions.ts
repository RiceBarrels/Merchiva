// @ts-nocheck
// NOTE: task_completions table does not exist in SpacetimeDB yet.
// All functions return empty results / stubs until a SpacetimeDB table is created.

export interface TaskCompletion {
  id: string;
  roleTaskId: string;
  userId: string;
  organizationId: string;
  date: string;
  userName: string;
  createdAt: string;
}

/** Get all completions for today for the given organization */
export async function getTodayCompletions(
  organizationId: string
): Promise<TaskCompletion[]> {
  // No SpacetimeDB table for task_completions yet — return empty
  return [];
}

/** Mark a role task as completed for today */
export async function completeTask(
  roleTaskId: string,
  organizationId: string,
  userName: string
): Promise<TaskCompletion> {
  // No SpacetimeDB table for task_completions yet
  throw new Error("completeTask: SpacetimeDB table not yet available");
}
