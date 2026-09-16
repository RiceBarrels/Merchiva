"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  inviteToOrg,
  updateMember,
  removeMember,
  cancelInvitation,
} from "@/lib/spacetimedb/actions";
import { defaultPermissions, getInvitations } from "@/lib/db/team";
import { useOrgInvitations, useOrgMembers } from "@/lib/spacetimedb/hooks";
import { fmt } from "@/components/personnel/team/data";
import { usePermissions } from "@/lib/context/permissions";
import { useAuth } from "@/lib/auth/context";
import type { Permissions } from "@/lib/types";
import { useT } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import { DialogActions } from "@/components/ui/dialog-actions";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  DynamicUIElement,
  DynamicUIElementContent,
  DynamicUIElementHeader,
  DynamicUIElementTitle,
  DynamicUIElementDescription,
} from "@/components/ui/dynamic-ui-element";

// ── Permissions editor ──────────────────────────────────────────────────────

const PERMISSION_SECTIONS: ReadonlyArray<{
  key: keyof Permissions;
  i18nKey: string;
  actions: ReadonlyArray<"view" | "edit" | "invite">;
}> = [
  { key: "dashboard",        i18nKey: "dashboard",       actions: ["view"] },
  { key: "inventory",        i18nKey: "inventory",       actions: ["view", "edit"] },
  { key: "sales",            i18nKey: "sales",           actions: ["view"] },
  { key: "staffing",         i18nKey: "staffing",        actions: ["view", "edit"] },
  { key: "products",         i18nKey: "products",        actions: ["view", "edit"] },
  { key: "settings",         i18nKey: "settings",        actions: ["view"] },
  { key: "team",             i18nKey: "team",            actions: ["view", "invite", "edit"] },
  { key: "training_grading", i18nKey: "trainingGrading", actions: ["view", "edit"] },
  { key: "merchiva",         i18nKey: "merchiva",        actions: ["view"] },
];

export function PermissionsEditor({
  value,
  onChange,
}: {
  value: Permissions;
  onChange: (next: Permissions) => void;
}) {
  const t = useT();
  return (
    <div className="mt-1 border border-border rounded-lg divide-y divide-border max-h-[260px] overflow-y-auto">
      {PERMISSION_SECTIONS.map(({ key, i18nKey, actions }) => {
        const sec = (value[key] ?? {}) as { view?: boolean; edit?: boolean; invite?: boolean };
        return (
          <div key={key} className="flex items-center gap-3 px-2.5 py-1.5">
            <span className="text-[12px] flex-1 truncate">
              {t(`personnel.team.permissionSection.${i18nKey}`)}
            </span>
            {actions.map((action) => {
              const cbId = `perm-${key}-${action}`;
              return (
                <label
                  key={action}
                  htmlFor={cbId}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer"
                >
                  <Checkbox
                    id={cbId}
                    checked={sec[action] === true}
                    onCheckedChange={() => {
                      const next: { view?: boolean; edit?: boolean; invite?: boolean } = { ...sec };
                      next[action] = !next[action];
                      if (action === "view" && !next.view) { next.edit = false; next.invite = false; }
                      if ((action === "edit" || action === "invite") && next[action]) next.view = true;
                      onChange({ ...value, [key]: next } as Permissions);
                    }}
                  />
                  {t(`personnel.team.permissionAction.${action}`)}
                </label>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Invite dialog ───────────────────────────────────────────────────────────

interface MemberRowLike { organizationId: string; email?: string | null; status?: string | null }
interface InvitationRowLike {
  organizationId: string;
  email?: string | null;
  acceptedAt?: unknown;
  expiresAt?: unknown;
}

function timestampToMs(value: unknown): number | null {
  if (value == null) return null;
  const ts = value as { toDate?: () => Date; microsSinceUnixEpoch?: unknown };
  if (typeof ts.toDate === "function") {
    const ms = ts.toDate().getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof ts.microsSinceUnixEpoch === "bigint") return Number(ts.microsSinceUnixEpoch / BigInt(1000));
  const ms = new Date(String(value)).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Why an email can't be invited to this org right now, or null. */
function inviteConflict(
  orgId: string,
  email: string,
  members: readonly MemberRowLike[],
  invitations: readonly InvitationRowLike[],
): "member" | "invited" | null {
  const wanted = email.trim().toLowerCase();
  if (!wanted) return null;
  const isMember = members.some(
    (m) => m.organizationId === orgId && m.status !== "removed" && (m.email ?? "").trim().toLowerCase() === wanted,
  );
  if (isMember) return "member";
  const now = Date.now();
  const pending = invitations.some((i) => {
    if (i.organizationId !== orgId || i.acceptedAt != null) return false;
    if ((i.email ?? "").trim().toLowerCase() !== wanted) return false;
    const expires = timestampToMs(i.expiresAt);
    return expires == null || expires > now;
  });
  return pending ? "invited" : null;
}

export function InviteMemberDialog({
  open,
  onClose,
  orgId,
}: {
  open: boolean;
  onClose: () => void;
  orgId: string;
}) {
  const t = useT();
  const { currentOrg, isOwner } = usePermissions();
  const { user } = useAuth();
  const orgName = currentOrg?.name ?? null;
  const userEmail = user?.email ?? null;
  // Generated rows are structurally compatible with the *RowLike shapes.
  const [rawMembers] = useOrgMembers();
  const [rawInvitations] = useOrgInvitations();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"staff" | "manager">("staff");
  const [perms, setPerms] = useState<Permissions>(() => defaultPermissions());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setEmail("");
      setRole("staff");
      setPerms(defaultPermissions());
    }
  }, [open]);

  async function handleSubmit() {
    const v = email.trim();
    if (!v || busy) return;
    // The server rejects these too once the module is published; checking here
    // avoids duplicate invitations (and a second seat for existing members).
    const conflict = inviteConflict(orgId, v, rawMembers ?? [], rawInvitations ?? []);
    if (conflict) {
      toast.error(t(conflict === "member" ? "personnel.team.org.dialog.alreadyMember" : "personnel.team.org.dialog.alreadyInvited"));
      return;
    }
    setBusy(true);
    try {
      await inviteToOrg({ email: v, role, permissions: JSON.stringify(perms) });

      // Find the freshly-created invitation token (subscription latency).
      let token: string | null = null;
      for (let attempt = 0; attempt < 10 && !token; attempt++) {
        await new Promise((r) => setTimeout(r, 150));
        const fresh = await getInvitations(orgId);
        const match = fresh
          .filter((inv: { email: string; acceptedAt?: unknown }) =>
            inv.email.toLowerCase() === v.toLowerCase() && !inv.acceptedAt)
          .sort((a: { expiresAt: string }, b: { expiresAt: string }) =>
            new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime(),
          )[0];
        if (match) token = (match as { token: string }).token;
      }

      if (token) {
        try {
          const res = await fetch("/api/team/send-invite-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: v,
              token,
              orgName: orgName || "your team",
              inviterEmail: userEmail || "a teammate",
              role,
            }),
          });
          if (res.ok) toast.success(t("personnel.team.toastInviteSent"));
          else toast.warning(t("personnel.team.toastInviteEmailFailed"));
        } catch {
          toast.warning(t("personnel.team.toastInviteEmailFailed"));
        }
      } else {
        // The invitation was created; only the email lookup timed out.
        toast.warning(t("personnel.team.toastInviteEmailFailed"));
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("personnel.team.toastInviteCreateFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DynamicUIElement open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DynamicUIElementContent>
        <DynamicUIElementHeader>
          <DynamicUIElementTitle mobileTitle={t("personnel.team.dialogInviteMobileTitle")}>
            {t("personnel.team.dialogInviteTitle")}
          </DynamicUIElementTitle>
          <DynamicUIElementDescription>
            {t("personnel.team.dialogInviteDescription")}
          </DynamicUIElementDescription>
        </DynamicUIElementHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Eyebrow>{t("personnel.team.fieldEmail")}</Eyebrow>
            <Input
              autoFocus
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Eyebrow>{t("personnel.team.fieldRole")}</Eyebrow>
            <SegmentedControl
              fullWidth
              value={role}
              onChange={setRole}
              options={(isOwner ? (["staff", "manager"] as const) : (["staff"] as const)).map((r) => ({ value: r, label: t(`personnel.team.role.${r}`) }))}
            />
          </div>
          <div className="space-y-1.5">
            <Eyebrow>{t("personnel.team.fieldPermissions")}</Eyebrow>
            <PermissionsEditor value={perms} onChange={setPerms} />
          </div>
          <DialogActions
            divider={false}
            size="default"
            className="pt-1"
            onCancel={onClose}
            onConfirm={handleSubmit}
            saving={busy}
            disabled={!email.trim()}
            cancelLabel={t("personnel.team.cancel")}
            confirmLabel={t("personnel.team.sendInvite")}
          />
        </div>
      </DynamicUIElementContent>
    </DynamicUIElement>
  );
}

// ── Edit member dialog ──────────────────────────────────────────────────────

export interface EditMemberInput {
  id: string;
  displayName: string;
  email: string;
  /** Raw org_member.role: "staff" | "manager" or a staff-role name. It is sent
   *  back unchanged unless the user picks another option, so custom roles
   *  survive a permissions-only save. */
  role: string;
  perms: Permissions;
}

export function EditMemberDialog({
  member,
  onClose,
}: {
  member: EditMemberInput | null;
  onClose: () => void;
}) {
  const t = useT();
  const [role, setRole] = useState<string>(member?.role ?? "staff");
  const [perms, setPerms] = useState<Permissions>(member?.perms ?? defaultPermissions());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (member) {
      setRole(member.role);
      setPerms(member.perms);
    }
  }, [member]);

  const roleOptions = useMemo(() => {
    const base = (["staff", "manager"] as const).map((r) => ({
      value: r as string,
      label: t(`personnel.team.role.${r}`),
    }));
    const current = member?.role;
    return current && current !== "staff" && current !== "manager"
      ? [{ value: current, label: current }, ...base]
      : base;
  }, [member?.role, t]);

  async function handleSave() {
    if (!member || busy) return;
    setBusy(true);
    try {
      await updateMember(member.id, { role, permissions: JSON.stringify(perms) });
      toast.success(t("personnel.team.toastUpdated"));
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("personnel.team.toastUpdateFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (!member || busy) return;
    if (!confirm(fmt(t("personnel.team.removeConfirm"), { name: member.displayName }))) return;
    setBusy(true);
    try {
      await removeMember(member.id);
      toast.success(t("personnel.team.toastRemoved"));
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("personnel.team.toastRemoveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DynamicUIElement open={!!member} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DynamicUIElementContent>
        <DynamicUIElementHeader>
          <DynamicUIElementTitle mobileTitle={t("personnel.team.dialogEditMobileTitle")}>
            {t("personnel.team.dialogEditTitle")}{member ? ` · ${member.displayName}` : ""}
          </DynamicUIElementTitle>
          <DynamicUIElementDescription>
            {member?.email || t("personnel.team.dialogEditDescription")}
          </DynamicUIElementDescription>
        </DynamicUIElementHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Eyebrow>{t("personnel.team.fieldRole")}</Eyebrow>
            <SegmentedControl<string>
              fullWidth
              value={role}
              onChange={setRole}
              options={roleOptions}
            />
          </div>
          <div className="space-y-1.5">
            <Eyebrow>{t("personnel.team.fieldPermissions")}</Eyebrow>
            <PermissionsEditor value={perms} onChange={setPerms} />
          </div>
          <DialogActions
            divider={false}
            size="default"
            className="pt-1"
            onCancel={onClose}
            onConfirm={handleSave}
            saving={busy}
            cancelLabel={t("personnel.team.cancel")}
            confirmLabel={t("personnel.team.save")}
            secondary={
              <Button variant="destructive" onClick={handleRemove} disabled={busy}>
                {t("personnel.team.remove")}
              </Button>
            }
          />
        </div>
      </DynamicUIElementContent>
    </DynamicUIElement>
  );
}

// ── Helpers for callers ─────────────────────────────────────────────────────

export async function resendInviteEmail(args: {
  email: string;
  token: string;
  role: string;
  orgName: string | null;
  inviterEmail: string | null;
}): Promise<boolean> {
  try {
    const res = await fetch("/api/team/send-invite-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: args.email,
        token: args.token,
        orgName: args.orgName || "your team",
        inviterEmail: args.inviterEmail || "a teammate",
        role: args.role,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function cancelPendingInvite(id: string): Promise<boolean> {
  try {
    await cancelInvitation(id);
    return true;
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Failed to cancel invitation");
    return false;
  }
}

