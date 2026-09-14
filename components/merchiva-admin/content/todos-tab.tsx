"use client";

import { useMemo, useState } from "react";
import { formatTs, sqlString } from "@/lib/merchiva-admin/client";
import { Badge, DataTable, ErrorBanner, Notice, Panel, btnCls, btnDangerCls, btnGhostCls, inputCls, type Column } from "@/components/merchiva-admin/ui";
import { useAdminQuery } from "@/components/merchiva-admin/use-admin-query";
import { Mono, NoOrg, Pager, useAction, useOrgMembers, usePaged } from "./shared";

interface TodoRow {
  id: string;
  userId: string;
  organizationId: string;
  title: string;
  completed: boolean;
  sortOrder: number;
  createdAt: number;
}

export function TodosTab({ orgId }: { orgId: string | null }) {
  const todos = useAdminQuery<TodoRow>(orgId ? `SELECT * FROM todo WHERE organization_id = ${sqlString(orgId)}` : null);
  const members = useOrgMembers(orgId);
  const action = useAction();
  const [title, setTitle] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [showDone, setShowDone] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      [...todos.rows]
        .filter((t) => !ownerFilter || t.userId.toLowerCase() === ownerFilter.toLowerCase())
        .filter((t) => showDone || !t.completed)
        .sort((a, b) => Number(a.completed) - Number(b.completed) || a.sortOrder - b.sortOrder || b.createdAt - a.createdAt),
    [todos.rows, ownerFilter, showDone],
  );
  const paged = usePaged(sorted, 50);
  const open = todos.rows.filter((t) => !t.completed).length;

  if (!orgId) return <NoOrg what="todos" />;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await action.run("addTodo", { organizationId: orgId, title: title.trim() });
    if (ok) {
      setNotice(`Added "${title.trim()}" (owned by the platform identity)`);
      setTitle("");
      todos.reload();
    }
  };

  const toggle = async (t: TodoRow) => {
    setNotice(null);
    const ok = await action.run("toggleTodo", { todoId: t.id, completed: !t.completed });
    if (ok) todos.reload();
  };

  const remove = async (t: TodoRow) => {
    if (!window.confirm(`Delete todo "${t.title}"?`)) return;
    setNotice(null);
    const ok = await action.run("deleteTodo", { todoId: t.id });
    if (ok) {
      setNotice(`Deleted "${t.title}"`);
      todos.reload();
    }
  };

  const columns: Column<TodoRow>[] = [
    { key: "completed", header: "Done", render: (t) => (t.completed ? <Badge tone="ok">done</Badge> : <Badge tone="warn">open</Badge>) },
    { key: "title", header: "Title", render: (t) => <span className={t.completed ? "text-stone-500 line-through" : ""}>{t.title}</span> },
    {
      key: "owner",
      header: "Owner",
      className: "whitespace-nowrap",
      render: (t) => (
        <div>
          <div>{members.label(t.userId)}</div>
          <Mono value={t.userId} />
        </div>
      ),
    },
    { key: "sortOrder", header: "Sort", className: "font-mono text-[11px] text-stone-600" },
    { key: "createdAt", header: "Created", className: "whitespace-nowrap text-stone-600", render: (t) => formatTs(t.createdAt) },
    { key: "id", header: "Id", render: (t) => <Mono value={t.id} /> },
    {
      key: "actions",
      header: "",
      className: "text-right whitespace-nowrap",
      render: (t) => (
        <span className="inline-flex gap-1.5">
          <button type="button" className={btnGhostCls} disabled={action.busy} onClick={() => toggle(t)}>
            {t.completed ? "Reopen" : "Complete"}
          </button>
          <button type="button" className={btnDangerCls} disabled={action.busy} onClick={() => remove(t)}>
            Delete
          </button>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Panel title="Add todo" actions={<span className="font-mono text-[11px] text-stone-500">addTodo</span>}>
        <form onSubmit={add} className="flex flex-wrap items-center gap-2 p-4">
          <input className={`${inputCls} max-w-md`} placeholder="Todo title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <button type="submit" className={btnCls} disabled={action.busy || !title.trim()}>
            {action.busy ? "Saving…" : "Add"}
          </button>
        </form>
      </Panel>

      <Panel
        title={`Todos (${todos.rows.length}, ${open} open)`}
        actions={
          <>
            <select className={`${inputCls} w-48`} value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
              <option value="">All owners</option>
              {members.sorted.map((m) => (
                <option key={m.id} value={m.userId}>
                  {m.displayName || m.email}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 whitespace-nowrap text-[12px]">
              <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> show done
            </label>
            <button type="button" className={btnGhostCls} onClick={() => todos.reload()}>
              Refresh
            </button>
          </>
        }
      >
        <ErrorBanner message={todos.error ?? members.error ?? action.error} />
        <Notice message={notice} />
        <Notice message="toggleTodo / deleteTodo only match todos owned by the caller, so Complete / Delete succeed for todos created here (platform identity) and fail with 'Todo not found' for members' own todos." />
        <DataTable columns={columns} rows={paged.slice} loading={todos.loading} empty="No todos match" rowKey={(t) => t.id} />
        <Pager page={paged.page} pageCount={paged.pageCount} total={paged.total} pageSize={paged.pageSize} onChange={paged.setPage} label="todos" />
      </Panel>
    </div>
  );
}
