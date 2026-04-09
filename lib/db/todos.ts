import type { Todo } from "@/lib/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function todoFromDb(row: any): Todo {
  return {
    id: row.id,
    userId: row.user_id,
    organizationId: row.organization_id,
    title: row.title,
    completed: row.completed ?? false,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
  };
}

export async function getTodos(
  userId: string,
  organizationId: string
): Promise<Todo[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("todos")
    .select("*")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .order("completed")
    .order("sort_order")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(todoFromDb);
}

export async function addTodo(
  userId: string,
  organizationId: string,
  title: string
): Promise<Todo> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("todos")
    .insert({ user_id: userId, organization_id: organizationId, title })
    .select()
    .single();
  if (error) throw error;
  return todoFromDb(data);
}

export async function toggleTodo(id: string, completed: boolean): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("todos")
    .update({ completed, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteTodo(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("todos").delete().eq("id", id);
  if (error) throw error;
}
