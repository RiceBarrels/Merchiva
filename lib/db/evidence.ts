// @ts-nocheck
// NOTE: task_evidence table does not exist in SpacetimeDB yet.
// All functions return empty results / stubs until a SpacetimeDB table is created.

export interface TaskEvidence {
  id: string;
  userId: string;
  organizationId: string;
  roleTaskId: string;
  date: string;
  fileUrl: string;
  fileType: string;
  createdAt: string;
}

export async function uploadEvidence(
  file: File,
  roleTaskId: string,
  organizationId: string
): Promise<TaskEvidence> {
  // No SpacetimeDB table for task_evidence yet
  throw new Error("uploadEvidence: SpacetimeDB table not yet available");
}
