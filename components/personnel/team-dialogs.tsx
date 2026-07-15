"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  inviteToOrg,
  updateMember,
  removeMember,
  cancelInvitation,
} from "@/lib/spacetimedb/actions";
import { defaultPermissions, getInvitations } from "@/lib/db/team";
import { usePermissions } from "@/lib/context/permissions";
import { useAuth } from "@/lib/auth/context";
import type { Permissions } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
  { key: "pos",              i18nKey: "pos",             actions: ["view"] },
  { key: "settings",         i18nKey: "settings",        actions: ["view"] },
  { key: "team",             i18nKey: "team",            actions: ["view", "invite", "edit"] },
  { key: "website",          i18nKey: "website",         actions: ["view", "edit"] },
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
    <div className="mt-1 border border-border rounded-[0.3rem] divide-y divide-border max-h-[260px] overflow-y-auto">
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
  const { currentOrg } = usePermissions();
  const { user } = useAuth();
  const orgName = currentOrg?.name ?? null;
  const userEmail = user?.email ?? null;

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
        toast.warning(t("personnel.team.toastInviteNoToken"));
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
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("personnel.team.fieldEmail")}
            </Label>
            <Input
              autoFocus
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@example.com"
              className="rounded-[0.3rem]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("personnel.team.fieldRole")}
            </Label>
            <div className="flex gap-2">
              {(["staff", "manager"] as const).map((r) => (
                <Button
                  key={r}
                  variant={role === r ? "default" : "outline"}
                  onClick={() => setRole(r)}
                  className={cn("flex-1 rounded-[0.3rem]")}
                >
                  {t(`personnel.team.role.${r}`)}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("personnel.team.fieldPermissions")}
            </Label>
            <PermissionsEditor value={perms} onChange={setPerms} />
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              onClick={() => !busy && onClose()}
              className="flex-1 rounded-[0.3rem]"
            >
              {t("personnel.team.cancel")}
            </Button>
            <Button
              disabled={busy || !email.trim()}
              onClick={handleSubmit}
              className="flex-1 rounded-[0.3rem]"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("personnel.team.sendInvite")}
            </Button>
          </div>
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
  role: "staff" | "manager";
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
  const [role, setRole] = useState<"staff" | "manager">(member?.role ?? "staff");
  const [perms, setPerms] = useState<Permissions>(member?.perms ?? defaultPermissions());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (member) {
      setRole(member.role);
      setPerms(member.perms);
    }
  }, [member]);

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
    if (!confirm(t("personnel.team.removeConfirm").replace("{name}", member.displayName))) return;
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
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("personnel.team.fieldRole")}
            </Label>
            <div className="flex gap-2">
              {(["staff", "manager"] as const).map((r) => (
                <Button
                  key={r}
                  variant={role === r ? "default" : "outline"}
                  onClick={() => setRole(r)}
                  className="flex-1 rounded-[0.3rem]"
                >
                  {t(`personnel.team.role.${r}`)}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("personnel.team.fieldPermissions")}
            </Label>
            <PermissionsEditor value={perms} onChange={setPerms} />
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              variant="destructive"
              onClick={handleRemove}
              disabled={busy}
              className="rounded-[0.3rem]"
            >
              {t("personnel.team.remove")}
            </Button>
            <Button
              variant="outline"
              onClick={() => !busy && onClose()}
              className="flex-1 rounded-[0.3rem]"
            >
              {t("personnel.team.cancel")}
            </Button>
            <Button
              disabled={busy}
              onClick={handleSave}
              className="flex-1 rounded-[0.3rem]"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("personnel.team.save")}
            </Button>
          </div>
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

