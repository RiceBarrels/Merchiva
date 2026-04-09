// @ts-nocheck
import { createClient } from "@/lib/supabase/client";

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
  const supabase = createClient();
  const today = new Date().toISOString().split("T")[0];
  const { data, error } = await supabase
    .from("task_completions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("date", today);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    roleTaskId: r.role_task_id,
    userId: r.user_id,
    organizationId: r.organization_id,
    date: r.date,
    userName: r.user_name,
    createdAt: r.created_at,
  }));
}

/** Mark a role task as completed for today */
export async function completeTask(
  roleTaskId: string,
  organizationId: string,
  userName: string
): Promise<TaskCompletion> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("task_completions")
    .upsert(
      {
        role_task_id: roleTaskId,
        user_id: user.id,
        organization_id: organizationId,
        user_name: userName,
      },
      { onConflict: "role_task_id,organization_id,date" }
    )
    .select()
    .single();
  if (error) throw error;
  return {
    id: data.id,
    roleTaskId: data.role_task_id,
    userId: data.user_id,
    organizationId: data.organization_id,
    date: data.date,
    userName: data.user_name,
    createdAt: data.created_at,
  };
}
