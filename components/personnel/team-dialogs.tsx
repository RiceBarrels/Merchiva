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
  label: string;
  actions: ReadonlyArray<"view" | "edit" | "invite">;
}> = [
  { key: "dashboard",        label: "看板",       actions: ["view"] },
  { key: "inventory",        label: "库存",       actions: ["view", "edit"] },
  { key: "sales",            label: "销售",       actions: ["view"] },
  { key: "staffing",         label: "人员",       actions: ["view", "edit"] },
  { key: "products",         label: "产品",       actions: ["view", "edit"] },
  { key: "pos",              label: "POS",        actions: ["view"] },
  { key: "settings",         label: "设置",       actions: ["view"] },
  { key: "team",             label: "团队",       actions: ["view", "invite", "edit"] },
  { key: "website",          label: "网站",       actions: ["view", "edit"] },
  { key: "training_grading", label: "培训评分",   actions: ["view", "edit"] },
];

export function PermissionsEditor({
  value,
  onChange,
}: {
  value: Permissions;
  onChange: (next: Permissions) => void;
}) {
  return (
    <div className="mt-1 border border-border rounded-[0.3rem] divide-y divide-border max-h-[260px] overflow-y-auto">
      {PERMISSION_SECTIONS.map(({ key, label, actions }) => {
        const sec = (value[key] ?? {}) as { view?: boolean; edit?: boolean; invite?: boolean };
        return (
          <div key={key} className="flex items-center gap-3 px-2.5 py-1.5">
            <span className="text-[12px] flex-1 truncate">{label}</span>
            {actions.map((action) => (
              <label key={action} className="flex items-center gap-1 text-[11px] text-muted-foreground capitalize cursor-pointer">
                <input
                  type="checkbox"
                  checked={sec[action] === true}
                  onChange={() => {
                    const next: { view?: boolean; edit?: boolean; invite?: boolean } = { ...sec };
                    next[action] = !next[action];
                    if (action === "view" && !next.view) { next.edit = false; next.invite = false; }
                    if ((action === "edit" || action === "invite") && next[action]) next.view = true;
                    onChange({ ...value, [key]: next } as Permissions);
                  }}
                  className="h-3.5 w-3.5 accent-foreground"
                />
                {action === "view" ? "查看" : action === "edit" ? "编辑" : "邀请"}
              </label>
            ))}
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
          if (res.ok) toast.success("邀请已发送");
          else toast.warning("邀请已创建，但邮件发送失败");
        } catch {
          toast.warning("邀请已创建，但邮件发送失败");
        }
      } else {
        toast.warning("邀请已创建（未取到令牌，无法发送邮件）");
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "邀请失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DynamicUIElement open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DynamicUIElementContent>
        <DynamicUIElementHeader>
          <DynamicUIElementTitle mobileTitle="邀请">邀请新成员</DynamicUIElementTitle>
          <DynamicUIElementDescription>发送邀请链接，新成员通过邮件接受邀请加入团队。</DynamicUIElementDescription>
        </DynamicUIElementHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">邮箱</label>
            <input
              autoFocus
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@example.com"
              className="w-full rounded-[0.3rem] border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">角色</label>
            <div className="flex gap-2">
              {(["staff", "manager"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={cn(
                    "flex-1 rounded-[0.3rem] border px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                    role === r
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background text-foreground hover:bg-muted",
                  )}
                >
                  {r === "staff" ? "员工" : "管理员"}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">权限</label>
            <PermissionsEditor value={perms} onChange={setPerms} />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => !busy && onClose()}
              className="flex-1 rounded-[0.3rem] border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              取消
            </button>
            <button
              type="button"
              disabled={busy || !email.trim()}
              onClick={handleSubmit}
              className="flex-1 rounded-[0.3rem] bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "发送邀请"}
            </button>
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
      toast.success("已更新成员权限");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "更新失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (!member || busy) return;
    if (!confirm(`确认移除 ${member.displayName}？`)) return;
    setBusy(true);
    try {
      await removeMember(member.id);
      toast.success("已移除成员");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "移除失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DynamicUIElement open={!!member} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DynamicUIElementContent>
        <DynamicUIElementHeader>
          <DynamicUIElementTitle mobileTitle="编辑成员">
            编辑成员{member ? ` · ${member.displayName}` : ""}
          </DynamicUIElementTitle>
          <DynamicUIElementDescription>
            {member?.email || "调整角色与各模块的权限"}
          </DynamicUIElementDescription>
        </DynamicUIElementHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">角色</label>
            <div className="flex gap-2">
              {(["staff", "manager"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={cn(
                    "flex-1 rounded-[0.3rem] border px-3 py-1.5 text-sm font-medium transition-colors",
                    role === r
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background text-foreground hover:bg-muted",
                  )}
                >
                  {r === "staff" ? "员工" : "管理员"}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">权限</label>
            <PermissionsEditor value={perms} onChange={setPerms} />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleRemove}
              disabled={busy}
              className="rounded-[0.3rem] border border-destructive/40 text-destructive px-3 py-1.5 text-sm hover:bg-destructive/10 disabled:opacity-40"
            >
              移除
            </button>
            <button
              type="button"
              onClick={() => !busy && onClose()}
              className="flex-1 rounded-[0.3rem] border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              取消
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleSave}
              className="flex-1 rounded-[0.3rem] bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "保存"}
            </button>
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
    toast.error(err instanceof Error ? err.message : "撤回失败");
    return false;
  }
}

