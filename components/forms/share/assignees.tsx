"use client";

// Assign a form to members (decision C12: members only in v1), each with an optional due date. With the
// "assigned" audience only these members may answer; with "members" an assignment just puts the form in the
// member's To fill with its due date.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { DateCommitInput } from "@/components/forms/share/date-commit-input";
import { Users } from "lucide-react";
import { usePermissions } from "@/lib/context/permissions";
import { idString } from "@/lib/docs/mappers";
import { useT } from "@/lib/i18n/context";
import { assignForm, formsErrorKey, unassignForm } from "@/lib/spacetimedb/actions/forms";
import { useOrgMembers } from "@/lib/spacetimedb/hooks";
import { useFormAssignments } from "@/lib/spacetimedb/hooks/useForms";

interface MemberOption {
  id: string;
  name: string;
  role: string;
}

/** Active members of the store, by name. */
function useActiveMembers(): MemberOption[] {
  const { organizationId } = usePermissions();
  const [rows] = useOrgMembers();
  return useMemo(
    () => rows
      .filter((m) => m.organizationId === organizationId && m.status === "active")
      .map((m) => ({ id: idString(m.id).toLowerCase(), name: m.displayName || m.email, role: m.role }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [rows, organizationId],
  );
}

export function Assignees({ formId, disabled }: { formId: string; disabled?: boolean }) {
  const t = useT();
  const members = useActiveMembers();
  const { assignments } = useFormAssignments();
  const [busy, setBusy] = useState<string | null>(null);

  const byMember = useMemo(() => {
    const out = new Map<string, string>();
    for (const a of assignments) if (a.formId === formId) out.set(a.memberId.toLowerCase(), a.dueDate);
    return out;
  }, [assignments, formId]);

  const run = async (memberId: string, task: () => Promise<void>) => {
    setBusy(memberId);
    try {
      await task();
    } catch (err) {
      toast.error(t(formsErrorKey(err)));
    } finally {
      setBusy(null);
    }
  };

  if (members.length === 0) {
    return <EmptyState compact icon={Users} description={t("forms.share.noMembers")} />;
  }

  return (
    <ul className="divide-y divide-border rounded border border-border">
      {members.map((m) => {
        const assigned = byMember.has(m.id);
        const due = byMember.get(m.id) ?? "";
        const rowBusy = busy === m.id;
        return (
          <li key={m.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
              <Checkbox
                checked={assigned}
                disabled={disabled || rowBusy}
                onCheckedChange={(checked) => {
                  void run(m.id, () => (checked ? assignForm(formId, m.id, "") : unassignForm(formId, m.id)));
                }}
              />
              <span className="truncate">{m.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{t(`forms.share.role.${m.role === "owner" || m.role === "manager" ? m.role : "staff"}`)}</span>
            </label>
            {assigned && (
              <DateCommitInput
                aria-label={t("forms.share.dueDate")}
                title={t("forms.share.dueDate")}
                className="h-8 w-40 font-mono text-xs tabular-nums"
                value={due}
                disabled={disabled}
                onCommit={(key) => { void run(m.id, () => assignForm(formId, m.id, key)); }}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
