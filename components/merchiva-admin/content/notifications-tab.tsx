"use client";

import { useMemo, useState } from "react";
import { formatTs, sqlString } from "@/lib/merchiva-admin/client";
import { Badge, DataTable, ErrorBanner, Notice, Panel, btnCls, btnGhostCls, inputCls, type Column } from "@/components/merchiva-admin/ui";
import { useAdminQuery } from "@/components/merchiva-admin/use-admin-query";
import { Field, Mono, NoOrg, Pager, useAction, useOrgMembers, usePaged } from "./shared";

interface NotificationRow {
  id: string;
  organizationId: string;
  targetId: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: number;
}

const ALL_ACTIVE = "__all_active__";

export function NotificationsTab({ orgId }: { orgId: string | null }) {
  const notifications = useAdminQuery<NotificationRow>(orgId ? `SELECT * FROM notification WHERE organization_id = ${sqlString(orgId)}` : null);
  const members = useOrgMembers(orgId);
  const action = useAction();

  const [targetFilter, setTargetFilter] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");

  const [target, setTarget] = useState("");
  const [type, setType] = useState("admin");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const types = useMemo(() => Array.from(new Set(notifications.rows.map((n) => n.type))).sort(), [notifications.rows]);

  const filtered = useMemo(
    () =>
      [...notifications.rows]
        .filter((n) => !targetFilter || n.targetId.toLowerCase() === targetFilter.toLowerCase())
        .filter((n) => !unreadOnly || !n.read)
        .filter((n) => !typeFilter || n.type === typeFilter)
        .sort((a, b) => b.createdAt - a.createdAt),
    [notifications.rows, targetFilter, unreadOnly, typeFilter],
  );
  const paged = usePaged(filtered, 50);
  const unread = notifications.rows.filter((n) => !n.read).length;

  if (!orgId) return <NoOrg what="notifications" />;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    const targets =
      target === ALL_ACTIVE ? members.rows.filter((m) => m.status === "active").map((m) => m.userId) : target ? [target] : [];
    if (targets.length === 0) {
      action.setError("Pick a target");
      return;
    }
    if (targets.length > 1 && !window.confirm(`Send this notification to ${targets.length} active members?`)) return;
    let sent = 0;
    for (const t of targets) {
      const ok = await action.run("serviceCreateNotification", {
        organizationId: orgId,
        targetIdentity: t,
        type: type.trim() || "admin",
        title: title.trim(),
        body: body.trim(),
        link: link.trim() || null,
      });
      if (!ok) break;
      sent += 1;
    }
    if (sent > 0) {
      setNotice(`Sent ${sent} notification${sent === 1 ? "" : "s"}`);
      setTitle("");
      setBody("");
      setLink("");
      notifications.reload();
    }
  };

  const columns: Column<NotificationRow>[] = [
    { key: "createdAt", header: "Created", className: "whitespace-nowrap text-stone-600", render: (n) => formatTs(n.createdAt) },
    {
      key: "target",
      header: "Target",
      className: "whitespace-nowrap",
      render: (n) => (
        <div>
          <div>{members.label(n.targetId)}</div>
          <Mono value={n.targetId} />
        </div>
      ),
    },
    { key: "type", header: "Type", render: (n) => <Badge>{n.type}</Badge> },
    {
      key: "title",
      header: "Title / body",
      render: (n) => (
        <div className="max-w-[560px]">
          <div className="font-medium">{n.title}</div>
          <div className="whitespace-pre-wrap break-words text-stone-600">{n.body}</div>
        </div>
      ),
    },
    {
      key: "link",
      header: "Link",
      render: (n) => (n.link ? <code className="font-mono text-[11px] text-stone-600">{n.link}</code> : <span className="text-stone-300">—</span>),
    },
    { key: "read", header: "Read", render: (n) => (n.read ? <Badge tone="neutral">read</Badge> : <Badge tone="warn">unread</Badge>) },
    { key: "id", header: "Id", render: (n) => <Mono value={n.id} /> },
  ];

  return (
    <div className="space-y-4">
      <Panel
        title="Send notification"
        actions={<span className="font-mono text-[11px] text-stone-500">serviceCreateNotification</span>}
      >
        <ErrorBanner message={members.error ?? action.error} />
        <Notice message={notice} />
        <form onSubmit={send} className="grid gap-3 p-4 md:grid-cols-2">
          <Field label="Target">
            <select className={inputCls} value={target} onChange={(e) => setTarget(e.target.value)} required>
              <option value="">{members.loading ? "Loading members…" : "— pick a member —"}</option>
              <option value={ALL_ACTIVE}>All active members ({members.rows.filter((m) => m.status === "active").length})</option>
              {members.sorted.map((m) => (
                <option key={m.id} value={m.userId}>
                  {m.displayName || m.email} · {m.role}
                  {m.status !== "active" ? ` (${m.status})` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Type">
            <input className={`${inputCls} font-mono`} value={type} onChange={(e) => setType(e.target.value)} list="notif-types" required />
            <datalist id="notif-types">
              {["admin", "system", "info", "warning", ...types].filter((v, i, a) => a.indexOf(v) === i).map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>
          <Field label="Title">
            <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} required />
          </Field>
          <Field label="Link (optional, e.g. /manager/inventory)">
            <input className={`${inputCls} font-mono`} value={link} onChange={(e) => setLink(e.target.value)} />
          </Field>
          <Field label="Body" className="md:col-span-2">
            <textarea className={`${inputCls} min-h-[70px]`} value={body} onChange={(e) => setBody(e.target.value)} required />
          </Field>
          <div className="md:col-span-2">
            <button type="submit" className={btnCls} disabled={action.busy || !target}>
              {action.busy ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      </Panel>

      <Panel
        title={`Notifications (${notifications.rows.length}, ${unread} unread)`}
        actions={
          <>
            <select className={`${inputCls} w-48`} value={targetFilter} onChange={(e) => setTargetFilter(e.target.value)}>
              <option value="">All targets</option>
              {members.sorted.map((m) => (
                <option key={m.id} value={m.userId}>
                  {m.displayName || m.email}
                </option>
              ))}
            </select>
            <select className={`${inputCls} w-36`} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">All types</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 whitespace-nowrap text-[12px]">
              <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} /> unread only
            </label>
            <button type="button" className={btnGhostCls} onClick={() => notifications.reload()}>
              Refresh
            </button>
          </>
        }
      >
        <ErrorBanner message={notifications.error} />
        <Notice message="Read-only: markNotificationRead / dismissNotification only act on the caller's own notifications, so the console cannot mark or delete rows targeted at users." />
        <DataTable columns={columns} rows={paged.slice} loading={notifications.loading} empty="No notifications match" rowKey={(n) => n.id} />
        <Pager page={paged.page} pageCount={paged.pageCount} total={paged.total} pageSize={paged.pageSize} onChange={paged.setPage} label="notifications" />
      </Panel>
    </div>
  );
}
