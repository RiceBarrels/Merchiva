"use client";

import { useState } from "react";
import { formatTs } from "@/lib/merchiva-admin/client";
import { Badge, DataTable, ErrorBanner, Notice, Panel, btnDangerCls, type Column } from "@/components/merchiva-admin/ui";
import type { OrgInvitationRow } from "./types";
import { useAction } from "./use-action";

export function InvitationsTable({
  orgId,
  invitations,
  loading,
  error,
  onChanged,
}: {
  orgId: string;
  invitations: OrgInvitationRow[];
  loading: boolean;
  error: string | null;
  onChanged: () => void;
}) {
  const action = useAction(onChanged);
  // Captured once per mount; the table is remounted on reload so this stays fresh enough for "expired" badges.
  const [now] = useState(() => Date.now());
  const sorted = [...invitations].sort((a, b) => b.createdAt - a.createdAt);

  async function revoke(inv: OrgInvitationRow) {
    if (!window.confirm(`Delete invitation for ${inv.email}? The invite link stops working.`)) return;
    await action.run("cancelInvitation", { organizationId: orgId, invitationId: inv.id }, "Invitation deleted");
  }

  const columns: Column<OrgInvitationRow>[] = [
    { key: "email", header: "Email" },
    { key: "role", header: "Role", render: (i) => <Badge>{i.role}</Badge> },
    {
      key: "state",
      header: "State",
      render: (i) =>
        i.acceptedAt ? <Badge tone="ok">accepted</Badge> : i.expiresAt < now ? <Badge tone="warn">expired</Badge> : <Badge>pending</Badge>,
    },
    { key: "createdAt", header: "Sent", render: (i) => <span className="text-stone-600">{formatTs(i.createdAt)}</span> },
    { key: "expiresAt", header: "Expires", render: (i) => <span className="text-stone-600">{formatTs(i.expiresAt)}</span> },
    { key: "acceptedAt", header: "Accepted", render: (i) => <span className="text-stone-600">{formatTs(i.acceptedAt)}</span> },
    { key: "id", header: "Id", className: "font-mono text-[10.5px] text-stone-500" },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (i) => (
        <button type="button" className={btnDangerCls} disabled={action.busy} onClick={() => revoke(i)}>
          Delete
        </button>
      ),
    },
  ];

  return (
    <Panel title={`Invitations (${invitations.length})`}>
      <ErrorBanner message={error ?? action.error} />
      <Notice message={action.notice} />
      <DataTable columns={columns} rows={sorted} loading={loading} empty="No invitations" rowKey={(i) => i.id} />
    </Panel>
  );
}
