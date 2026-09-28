"use client";

// A role's task list, as `/tasks list <role>` shows it, with a delete per task.

import { useEffect, useState } from "react";
import { Clipboard, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/loaders/geometric";
import { deleteRoleTask as execDeleteRoleTask, getRoleTasks } from "@/lib/spacetimedb/actions";

type ListedTask = { id: string; title: string; description: string; startTime: string | null; endTime: string | null; requiresEvidence: boolean };

// `roleId` is the role's stored (hyphenated) id: role_task.roleId holds that form.
export function TasksListInline({ roleId, roleName }: { roleId: string; roleName: string }) {
  const t = useT();
  const [tasks, setTasks] = useState<ListedTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRoleTasks(roleId)
      .then((t) => setTasks(t.map((tk) => ({
        id: tk.id, title: tk.title, description: tk.description,
        startTime: tk.startTime, endTime: tk.endTime,
        requiresEvidence: tk.requiresEvidence,
      }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [roleId]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 p-3 mt-2 flex items-center gap-2 text-[12px] text-muted-foreground">
        <Spinner size={12} /> {t("merchiva.tasks.loading")}
      </div>
    );
  }

  return <TasksListCard roleName={roleName} tasks={tasks} />;
}

function TasksListCard({ roleName, tasks: initialTasks }: { roleName: string; tasks: ListedTask[] }) {
  const t = useT();
  const [tasks, setTasks] = useState(initialTasks);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());

  const handleDelete = async (id: string) => {
    setDeleting((prev) => new Set(prev).add(id));
    try {
      await execDeleteRoleTask(id);
      setTasks((prev) => prev.filter((task) => task.id !== id));
    } catch (err) {
      console.error(`[TasksListCard] Failed to delete task:`, err);
      toast.error(t("merchiva.tasks.deleteFailed"));
    } finally {
      setDeleting((prev) => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden mt-2">
      <div className="px-3 py-2 border-b border-border flex items-center gap-2">
        <span className="h-5 px-1.5 rounded inline-flex items-center gap-1 bg-muted border border-border text-muted-foreground">
          <Clipboard className="h-[10px] w-[10px]" />
          <span className="font-mono text-[9px] tracking-[0.08em] uppercase font-semibold">{t("merchiva.tasks.tag")}</span>
        </span>
        <span className="text-[12px] font-medium">{roleName}</span>
        <span className="text-[10.5px] text-muted-foreground font-mono ml-auto">{tasks.length}</span>
      </div>
      {tasks.length === 0 ? (
        <div className="px-3 py-4 text-center text-[12px] text-muted-foreground">{t("merchiva.tasks.empty")}</div>
      ) : (
        <div className="divide-y divide-border">
          {tasks.map((task) => (
            <div key={task.id} className="px-3 py-2.5 flex items-center gap-3 group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-[12.5px] font-medium leading-tight">{task.title}</div>
                  {task.requiresEvidence && (
                    <span className="h-4 px-1 rounded bg-amber-50 border border-amber-200 text-amber-700 text-[8px] font-mono uppercase inline-flex items-center">
                      {t("merchiva.tasks.evidence")}
                    </span>
                  )}
                </div>
                {task.description && (
                  <div className="text-[10.5px] text-muted-foreground leading-tight mt-0.5 truncate">{task.description}</div>
                )}
              </div>
              {task.startTime && (
                <span className="text-[10.5px] font-mono text-muted-foreground tabular-nums shrink-0">
                  {task.startTime}–{task.endTime ?? ""}
                </span>
              )}
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => handleDelete(task.id)}
                disabled={deleting.has(task.id)}
                className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive"
              >
                {deleting.has(task.id) ? <Spinner size={12} /> : <Trash2 className="h-3 w-3" />}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
