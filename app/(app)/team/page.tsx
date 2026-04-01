"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users,
  UserPlus,
  Loader2,
  Mail,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  PenLine,
  ShieldAlert,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import {
  getTeamMembers,
  getInvitations,
  updateMember,
  removeMember,
  cancelInvitation,
  defaultPermissions,
} from "@/lib/db/team";
import type { OrgMember, OrgInvitation, Permissions, OrgRole } from "@/lib/types";

// ─── Permission Checkboxes ─────────────────────────────────────────────────────

const PERMISSION_SECTIONS: Array<{
  key: keyof Permissions;
  label: string;
  hasEdit: boolean;
}> = [
  { key: "dashboard", label: "Dashboard", hasEdit: false },
  { key: "inventory", label: "Inventory", hasEdit: true },
  { key: "sales", label: "Sales", hasEdit: false },
  { key: "staffing", label: "Staffing", hasEdit: true },
  { key: "products", label: "Products", hasEdit: true },
  { key: "settings", label: "Settings", hasEdit: false },
];

function PermissionsEditor({
  permissions,
  onChange,
}: {
  permissions: Permissions;
  onChange: (p: Permissions) => void;
}) {
  const toggle = (section: keyof Permissions, action: "view" | "edit") => {
    const updated = { ...permissions };
    const sec = { ...updated[section] };
    if (action === "view") {
      sec.view = !sec.view;
      // If turning off view, also turn off edit
      if (!sec.view) sec.edit = false;
    } else {
      sec.edit = !sec.edit;
      // If turning on edit, also turn on view
      if (sec.edit) sec.view = true;
    }
    updated[section] = sec as Permissions[typeof section];
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 text-xs font-medium text-muted-foreground px-1">
        <span>Section</span>
        <span className="text-center">View</span>
        <span className="text-center">Edit</span>
      </div>
      {PERMISSION_SECTIONS.map(({ key, label, hasEdit }) => (
        <div key={key} className="grid grid-cols-3 items-center rounded-md px-1 py-1 hover:bg-muted/50">
          <span className="text-sm">{label}</span>
          <div className="flex justify-center">
            <input
              type="checkbox"
              checked={permissions[key]?.view === true}
              onChange={() => toggle(key, "view")}
              className="h-4 w-4 accent-primary cursor-pointer"
            />
          </div>
          <div className="flex justify-center">
            {hasEdit ? (
              <input
                type="checkbox"
                checked={permissions[key]?.edit === true}
                onChange={() => toggle(key, "edit")}
                className="h-4 w-4 accent-primary cursor-pointer"
              />
            ) : (
              <span className="text-muted-foreground text-xs">—</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Role Badge ────────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: OrgRole }) {
  if (role === "owner") return <Badge className="bg-stone-900 text-white hover:bg-stone-900 text-xs">Owner</Badge>;
  if (role === "manager") return <Badge className="bg-stone-200 text-stone-800 hover:bg-stone-200 text-xs">Manager</Badge>;
  return <Badge variant="secondary" className="text-xs">Staff</Badge>;
}

// ─── Invite Dialog ─────────────────────────────────────────────────────────────

function InviteDialog({
  organizationId,
  onInvited,
}: {
  organizationId: string;
  onInvited: (inv: OrgInvitation) => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"manager" | "staff">("staff");
  const [permissions, setPermissions] = useState<Permissions>(defaultPermissions());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role, permissions }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to send invitation");
        return;
      }
      // Build a local OrgInvitation object to show immediately
      onInvited({
        id: crypto.randomUUID(),
        organizationId,
        email,
        role,
        permissions,
        token: json.token,
        expiresAt: json.expiresAt,
        acceptedAt: null,
      });
      setOpen(false);
      setEmail("");
      setRole("staff");
      setPermissions(defaultPermissions());
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button className="gap-2">
            <UserPlus className="h-4 w-4" />
            Invite Member
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email address</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="colleague@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label>Role</Label>
            <div className="flex gap-2">
              {(["manager", "staff"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize transition-colors ${
                    role === r
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground hover:bg-accent"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Permissions</Label>
            <PermissionsEditor permissions={permissions} onChange={setPermissions} />
          </div>

          {error && (
            <p className="text-sm text-destructive rounded-lg bg-destructive/10 px-3 py-2">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={loading} className="w-full gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              {loading ? "Sending…" : "Send Invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Member Dialog ────────────────────────────────────────────────────────

function EditMemberDialog({
  member,
  onUpdated,
}: {
  member: OrgMember;
  onUpdated: (updated: OrgMember) => void;
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<"manager" | "staff">(
    member.role === "owner" ? "manager" : (member.role as "manager" | "staff")
  );
  const [permissions, setPermissions] = useState<Permissions>(member.permissions);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    setLoading(true);
    try {
      await updateMember(member.id, { role, permissions });
      onUpdated({ ...member, role, permissions });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update member");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md hover:bg-accent w-full text-left">
            <PenLine className="h-3.5 w-3.5" />
            Edit role & permissions
          </button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {member.displayName || member.email}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Role</Label>
            <div className="flex gap-2">
              {(["manager", "staff"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize transition-colors ${
                    role === r
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground hover:bg-accent"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Permissions</Label>
            <PermissionsEditor permissions={permissions} onChange={setPermissions} />
          </div>

          {error && (
            <p className="text-sm text-destructive rounded-lg bg-destructive/10 px-3 py-2">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={loading} className="gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Member Row Actions ────────────────────────────────────────────────────────

function MemberActions({
  member,
  onUpdated,
  onRemoved,
}: {
  member: OrgMember;
  onUpdated: (m: OrgMember) => void;
  onRemoved: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [disabling, setDisabling] = useState(false);

  const handleDisable = async () => {
    setDisabling(true);
    try {
      await removeMember(member.id);
      onRemoved(member.id);
    } finally {
      setDisabling(false);
      setOpen(false);
    }
  };

  if (member.role === "owner") return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 rounded-md hover:bg-accent text-muted-foreground"
        aria-label="Member actions"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-52 rounded-lg border border-border bg-popover shadow-md py-1 text-sm">
            <EditMemberDialog member={member} onUpdated={(m) => { onUpdated(m); setOpen(false); }} />
            <Separator className="my-1" />
            <button
              onClick={handleDisable}
              disabled={disabling}
              className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md hover:bg-destructive/10 text-destructive w-full"
            >
              {disabling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Remove member
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function TeamPage() {
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<OrgRole>("staff");
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invitations, setInvitations] = useState<OrgInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadData = useCallback(async (orgId: string) => {
    const [mems, invs] = await Promise.all([
      getTeamMembers(orgId),
      getInvitations(orgId),
    ]);
    setMembers(mems);
    setInvitations(invs);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser()
      .then(async ({ data: { user } }) => {
        if (!user) return;
        setCurrentUserId(user.id);

        const { data: memberRow } = await supabase
          .from("org_members")
          .select("organization_id, role")
          .eq("user_id", user.id)
          .eq("status", "active")
          .single();

        if (memberRow) {
          const orgId = memberRow.organization_id as string;
          setOrganizationId(orgId);
          setCurrentRole(memberRow.role as OrgRole);
          await loadData(orgId);
        }
      })
      .catch((err) => {
        console.error("Failed to load team:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [loadData]);

  const handleInvited = (inv: OrgInvitation) => {
    setInvitations((prev) => [inv, ...prev]);
  };

  const handleMemberUpdated = (updated: OrgMember) => {
    setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
  };

  const handleMemberRemoved = (id: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== id));
  };

  const handleCancelInvitation = async (id: string) => {
    setCancellingId(id);
    try {
      await cancelInvitation(id);
      setInvitations((prev) => prev.filter((i) => i.id !== id));
    } finally {
      setCancellingId(null);
    }
  };

  const handleResendInvitation = async (inv: OrgInvitation) => {
    // Cancel old and create a new one
    await cancelInvitation(inv.id);
    setInvitations((prev) => prev.filter((i) => i.id !== inv.id));
    const res = await fetch("/api/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: inv.email,
        role: inv.role,
        permissions: inv.permissions,
      }),
    });
    if (res.ok) {
      const json = await res.json();
      setInvitations((prev) => [
        {
          ...inv,
          id: crypto.randomUUID(),
          token: json.token,
          expiresAt: json.expiresAt,
        },
        ...prev,
      ]);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!organizationId) {
    return (
      <div className="p-3 sm:p-6 max-w-2xl space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Team</h1>
        <Card>
          <CardContent className="p-6 flex flex-col items-center gap-3 text-center">
            <ShieldAlert className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No organization found. Please sign out and sign up again to create one.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isOwner = currentRole === "owner";
  const activeMembers = members.filter((m) => m.status === "active");
  const disabledMembers = members.filter((m) => m.status === "disabled");

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Team</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Manage your team members and their access
          </p>
        </div>
        {isOwner && organizationId && (
          <InviteDialog organizationId={organizationId} onInvited={handleInvited} />
        )}
      </div>

      {/* Active Members */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Team Members
            <Badge variant="secondary" className="ml-auto">{activeMembers.length}</Badge>
          </CardTitle>
          <CardDescription>People with access to your BizOps account</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {activeMembers.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              No team members yet. Invite someone to get started.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {activeMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 px-4 sm:px-6 py-3"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                    {(member.displayName || member.email || "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {member.displayName || member.email || "—"}
                      {member.userId === currentUserId && (
                        <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>
                      )}
                    </p>
                    {member.displayName && member.email && (
                      <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                    )}
                  </div>
                  <RoleBadge role={member.role} />
                  {isOwner && (
                    <MemberActions
                      member={member}
                      onUpdated={handleMemberUpdated}
                      onRemoved={handleMemberRemoved}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      {isOwner && invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Pending Invitations
              <Badge variant="outline" className="ml-auto">{invitations.length}</Badge>
            </CardTitle>
            <CardDescription>Invitations waiting to be accepted</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {invitations.map((inv) => (
                <div key={inv.id} className="flex items-center gap-3 px-4 sm:px-6 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Expires {new Date(inv.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <RoleBadge role={inv.role} />
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleResendInvitation(inv)}
                      className="p-1.5 rounded-md hover:bg-accent text-muted-foreground"
                      title="Resend invitation"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleCancelInvitation(inv.id)}
                      disabled={cancellingId === inv.id}
                      className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      title="Cancel invitation"
                    >
                      {cancellingId === inv.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Disabled Members */}
      {isOwner && disabledMembers.length > 0 && (
        <Card className="opacity-60">
          <CardHeader>
            <CardTitle className="text-base text-muted-foreground">Disabled Members</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {disabledMembers.map((member) => (
                <div key={member.id} className="flex items-center gap-3 px-4 sm:px-6 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground">
                    {(member.displayName || member.email || "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-muted-foreground truncate line-through">
                      {member.displayName || member.email || "—"}
                    </p>
                  </div>
                  <RoleBadge role={member.role} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
