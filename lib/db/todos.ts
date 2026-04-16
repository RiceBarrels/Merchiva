// @ts-nocheck
import { getConnection, getActiveOrgId } from "@/lib/spacetimedb/client";
import type { Todo } from "@/lib/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function todoFromRow(row: any): Todo {
  return {
    id: row.id,
    userId: row.userId,
    organizationId: row.organizationId,
    title: row.title,
    completed: row.completed ?? false,
    sortOrder: row.sortOrder ?? 0,
    createdAt: row.createdAt,
  };
}

export async function getTodos(
  userId: string,
  organizationId: string
): Promise<Todo[]> {
  const c = getConnection();
  if (!c) return [];
  const rows = (c as any).db.todo.iter();
  return Array.from(rows)
    .filter(
      (r: any) =>
        r.organizationId === organizationId && String(r.userId) === userId
    )
    .map(todoFromRow)
    .sort((a, b) => {
      // Sort: incomplete first, then by sortOrder, then by createdAt desc
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
}

export async function addTodo(
  userId: string,
  organizationId: string,
  title: string
): Promise<Todo> {
  // TODO: call SpacetimeDB reducer when available
  throw new Error("addTodo: SpacetimeDB reducer not yet implemented");
}

export async function toggleTodo(id: string, completed: boolean): Promise<void> {
  // TODO: call SpacetimeDB reducer when available
  throw new Error("toggleTodo: SpacetimeDB reducer not yet implemented");
}

export async function deleteTodo(id: string): Promise<void> {
  // TODO: call SpacetimeDB reducer when available
  throw new Error("deleteTodo: SpacetimeDB reducer not yet implemented");
}
