"use client";

// The role and task cards Mr. Merchiva's replies render: the role list, a new
// role and a new task (a role's task list is in tasks-list-card.tsx). Cards
// name a role by its name — the id an action block carries is resolved by the
// caller (role-ref.ts). A new role or task not added yet carries the autonomy
// gate's decision (role-task-gate.ts): denied shows why and offers no button,
// proposed offers Confirm / Cancel, like an action card.

import Link from "next/link";
import { Camera, Check, Clipboard, Clock, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Spinner } from "@/components/ui/loaders/geometric";
import { RoleIcon } from "@/components/merchiva-dock/role-icon";
import { ApproveBar, GateBadge } from "@/components/merchiva-dock/gate-controls";
import { GateReasonNote } from "@/components/merchiva-dock/gate-reason-note";
import type { CardGate } from "@/lib/merchiva/role-task-gate";
import type { RoleAddCmd, TaskAddCmd } from "@/lib/merchiva/skills/types";

export function RolesListCard({ roles }: { roles: Array<{ id: string; name: string; color: string; icon: string; description: string }> }) {
  const t = useT();
  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden mt-2">
      <div className="px-3 py-2 border-b border-border flex items-center gap-2">
        <span className="h-5 px-1.5 rounded inline-flex items-center gap-1 bg-muted border border-border text-muted-foreground">
          <Users className="h-[10px] w-[10px]" />
          <span className="font-mono text-[9px] tracking-[0.08em] uppercase font-semibold">{t("merchiva.rolesList.tag")}</span>
        </span>
        <span className="text-[11px] text-muted-foreground font-mono">{t("merchiva.rolesList.count").replace("{count}", String(roles.length))}</span>
      </div>
      {roles.length === 0 ? (
        <div className="px-3 py-4 text-center text-[12px] text-muted-foreground">{t("merchiva.rolesList.empty")}</div>
      ) : (
        <div className="divide-y divide-border">
          {roles.map((role) => (
            <div key={role.id} className="px-3 py-2.5 flex items-center gap-3">
              <div className="h-8 w-8 shrink-0 flex items-center justify-center border rounded-lg"
                style={{ borderColor: role.color, color: role.color }}>
                <RoleIcon name={role.icon} className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-medium leading-tight">{role.name}</div>
                {role.description && (
                  <div className="text-[10.5px] text-muted-foreground leading-tight mt-0.5 truncate">{role.description}</div>
                )}
              </div>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: role.color }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export type RoleCardStatus = "pending" | "adding" | "added" | "rejected" | "deleting" | "not-added";

export function RoleAddCard({ role, status, gate, canDelete, onApprove, onReject, onDelete }: {
  role: RoleAddCmd;
  status: RoleCardStatus;
  // The gate's decision on adding it; only a card not added yet shows it.
  gate: CardGate;
  // Whether the viewer may delete the role once it is added.
  canDelete: boolean;
  // Confirm a proposed role, or add one that wasn't added (a restored reply, a failed write).
  onApprove: () => void;
  onReject: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const denied = (status === "pending" || status === "not-added") && gate.decision === "deny";
  const proposed = status === "pending" && gate.decision === "propose";
  return (
    <div className={cn(
      "rounded-lg border p-3 mt-2",
      status === "added" ? "border-emerald-200 bg-emerald-50/50" :
      status === "rejected" ? "border-destructive/30 bg-destructive/5" :
      "border-border bg-muted/40"
    )}>
      <div className="flex items-center gap-2 mb-2.5">
        <span className="h-5 px-1.5 rounded inline-flex items-center gap-1 bg-muted border border-border text-muted-foreground">
          <Users className="h-[10px] w-[10px]" />
          <span className="font-mono text-[9px] tracking-[0.08em] uppercase font-semibold">{t("merchiva.roleAdd.tag")}</span>
        </span>
        {denied && <GateBadge decision="deny" />}
        {proposed && <GateBadge decision="propose" />}
        {status === "adding" && (
          <span className="text-[10.5px] font-mono text-muted-foreground inline-flex items-center gap-1 ml-auto">
            <Spinner size={12} /> {t("merchiva.status.adding")}
          </span>
        )}
        {status === "deleting" && (
          <span className="text-[10.5px] font-mono text-destructive inline-flex items-center gap-1 ml-auto">
            <Spinner size={12} /> {t("merchiva.status.deleting")}
          </span>
        )}
        {status === "added" && (
          <span className="text-[10.5px] font-mono text-emerald-600 inline-flex items-center gap-1 ml-auto">
            <Check className="h-3 w-3" /> {t("merchiva.status.added")}
          </span>
        )}
        {status === "rejected" && (
          <span className="text-[10.5px] font-mono text-destructive ml-auto">{t("merchiva.status.deleted")}</span>
        )}
        {status === "not-added" && (
          <span className="text-[10.5px] font-mono text-muted-foreground ml-auto">{t("merchiva.status.notAdded")}</span>
        )}
      </div>
      <div className="flex items-center gap-3 mb-2">
        <div className="h-10 w-10 shrink-0 flex items-center justify-center border rounded-lg"
          style={{ borderColor: role.color, color: role.color }}>
          <RoleIcon name={role.icon} className="h-5 w-5" />
        </div>
        <div>
          <div className="text-[14px] font-semibold leading-tight">{role.title}</div>
          {role.des && <div className="text-[11.5px] text-muted-foreground mt-0.5">{role.des}</div>}
        </div>
      </div>
      {role.tasks && (
        <div className="mb-2.5">
          <Eyebrow as="span" size="xs">{t("merchiva.roleAdd.responsibilities")}</Eyebrow>
          <div className="flex flex-wrap gap-1 mt-1">
            {role.tasks.split(",").map((t) => t.trim()).filter(Boolean).map((task) => (
              <span key={task} className="inline-flex items-center px-2 py-0.5 rounded border border-border bg-background text-[11px]">
                {task}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: role.color }} />
        <span className="text-[11px] font-mono text-muted-foreground">{role.color}</span>
      </div>
      {(denied || proposed) && <GateReasonNote why={gate.why} className="mt-2.5 mb-0" />}
      {proposed && <ApproveBar onApprove={onApprove} onReject={onReject} />}
      {status === "not-added" && !denied && (
        <Button size="sm" onClick={onApprove} className="px-3 mt-2.5">
          <Check className="h-3 w-3" /> {t("merchiva.taskAdd.add")}
        </Button>
      )}
      {status === "added" && canDelete && (
        <Button variant="outline" size="sm" onClick={onDelete}
          className="px-3 mt-2.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-3 w-3" /> {t("common.delete")}
        </Button>
      )}
    </div>
  );
}

// "waiting-role": cleared to run, but its role is one this reply creates that still waits for approval.
export type TaskCardStatus = "pending" | "adding" | "added" | "rejected" | "deleting" | "needs-chat" | "failed" | "waiting-role";
/** Why a task card stopped short of adding its task. */
export type TaskCardFailure = "roleNotFound" | "addFailed" | "notAdded";

export function TaskAddCard({ task, roleName, roleColor, evidence, status, failure, gate, canDelete, groupChats, selectedChats, onToggleChat, onApprove, onConfirm, onRetry, onDelete }: {
  task: TaskAddCmd;
  // The role's name — never the id the action block carried.
  roleName: string;
  roleColor: string;
  // Whether the task needs photo proof: as asked until it is added, then as
  // stored ("Add without evidence" stores it without).
  evidence: boolean;
  status: TaskCardStatus;
  failure?: TaskCardFailure;
  // The gate's decision on adding it; only a card not added yet shows it.
  gate: CardGate;
  // Whether the viewer may delete the task once it is added.
  canDelete: boolean;
  groupChats: Array<{ id: string; name: string }>;
  selectedChats: string[];
  onToggleChat: (chatId: string) => void;
  // Confirm a proposed task.
  onApprove: () => void;
  // true: add with photo proof, sent to the selected channels; false: add without it.
  onConfirm: (withEvidence: boolean) => void;
  onRetry: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const denied = gate.decision === "deny"
    && (status === "pending" || status === "needs-chat" || status === "failed" || status === "waiting-role");
  const proposed = status === "pending" && gate.decision === "propose";
  const failureText =
    failure === "roleNotFound" ? t("merchiva.command.roleNotFound").replace("{role}", roleName)
    : failure === "addFailed" ? t("merchiva.command.addTaskFailed")
    : t("merchiva.status.notAdded");
  const skipButton = (
    <Button
      variant="outline"
      size="sm"
      onClick={onDelete}
      className="px-3 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
    >
      <Trash2 className="h-3 w-3" /> {t("merchiva.taskAdd.skip")}
    </Button>
  );
  return (
    <div className={cn(
      "rounded-lg border p-3 mt-2",
      status === "added" ? "border-emerald-200 bg-emerald-50/50" :
      status === "rejected" ? "border-destructive/30 bg-destructive/5" :
      status === "needs-chat" || status === "failed" ? "border-amber-300 bg-amber-50/40 dark:bg-amber-950/20" :
      "border-border bg-muted/40"
    )}>
      <div className="flex items-center gap-2 mb-2.5">
        <span className="h-5 px-1.5 rounded inline-flex items-center gap-1 bg-muted border border-border text-muted-foreground">
          <Clipboard className="h-[10px] w-[10px]" />
          <span className="font-mono text-[9px] tracking-[0.08em] uppercase font-semibold">{t("merchiva.taskAdd.tag")}</span>
        </span>
        <span className="text-[11px] text-muted-foreground truncate">→ {roleName}</span>
        {denied && <GateBadge decision="deny" />}
        {proposed && <GateBadge decision="propose" />}
        {status === "adding" && (
          <span className="text-[10.5px] font-mono text-muted-foreground inline-flex items-center gap-1 ml-auto">
            <Spinner size={12} /> {t("merchiva.status.adding")}
          </span>
        )}
        {status === "deleting" && (
          <span className="text-[10.5px] font-mono text-destructive inline-flex items-center gap-1 ml-auto">
            <Spinner size={12} /> {t("merchiva.status.deleting")}
          </span>
        )}
        {status === "added" && (
          <span className="text-[10.5px] font-mono text-emerald-600 inline-flex items-center gap-1 ml-auto">
            <Check className="h-3 w-3" /> {t("merchiva.status.added")}
          </span>
        )}
        {status === "rejected" && (
          <span className="text-[10.5px] font-mono text-destructive ml-auto">{t("merchiva.status.deleted")}</span>
        )}
        {status === "needs-chat" && !denied && (
          <span className="text-[10.5px] font-mono text-amber-700 ml-auto">{t("merchiva.taskAdd.chooseChat")}</span>
        )}
        {status === "waiting-role" && !denied && (
          <span className="text-[10.5px] font-mono text-muted-foreground ml-auto">{t("merchiva.taskAdd.waitingForRole")}</span>
        )}
      </div>
      <div className="flex items-start gap-3 mb-2">
        <span className="h-1.5 w-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: roleColor }} />
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-semibold leading-tight">{task.title}</div>
          {task.des && <div className="text-[11.5px] text-muted-foreground mt-0.5">{task.des}</div>}
        </div>
      </div>
      <div className="flex items-center gap-3 mb-2.5 text-[11px]">
        {task.startTime && (
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="font-mono tabular-nums">{task.startTime}–{task.endTime ?? ""}</span>
          </div>
        )}
        {evidence && (
          <span className="h-5 px-1.5 rounded bg-amber-50 border border-amber-200 text-amber-700 text-[9px] font-mono uppercase inline-flex items-center gap-1">
            <Camera className="h-[10px] w-[10px]" /> {t("merchiva.taskAdd.evidenceRequired")}
          </span>
        )}
      </div>
      {(denied || proposed) && <GateReasonNote why={gate.why} />}
      {proposed && <ApproveBar onApprove={onApprove} onReject={onDelete} />}
      {status === "waiting-role" && !denied && skipButton}
      {status === "needs-chat" && !denied && (
        // Photo proof needs a group channel to receive it, as in every task
        // editor. With none (or none wanted) the task is still added, without
        // proof — the card is never a dead end.
        <div className="mt-2 pt-2.5 border-t border-amber-200/60 dark:border-amber-800/60">
          <div className="text-[10.5px] text-amber-800 dark:text-amber-200 mb-1.5">
            {t("merchiva.taskAdd.evidencePrompt")}
          </div>
          {groupChats.length === 0 ? (
            <div className="text-[10.5px] text-muted-foreground">
              <span className="italic">{t("merchiva.taskAdd.noGroupChats")}</span>{" "}
              <Link href="/manager/channel" className="underline text-foreground hover:text-foreground">
                {t("merchiva.taskAdd.createChannel")}
              </Link>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {groupChats.map((c) => {
                const isSel = selectedChats.includes(c.id);
                return (
                  <Button
                    key={c.id}
                    variant="outline"
                    size="xs"
                    onClick={() => onToggleChat(c.id)}
                    className={cn(
                      isSel
                        ? "border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background"
                        : "text-muted-foreground"
                    )}
                  >
                    {c.name}
                  </Button>
                );
              })}
            </div>
          )}
          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            {groupChats.length > 0 && (
              <Button
                size="sm"
                onClick={() => onConfirm(true)}
                disabled={selectedChats.length === 0}
                className="px-3 disabled:opacity-40"
              >
                <Check className="h-3 w-3" /> {t("merchiva.taskAdd.add")}
              </Button>
            )}
            <Button
              variant={groupChats.length > 0 ? "outline" : "default"}
              size="sm"
              onClick={() => onConfirm(false)}
              className="px-3"
            >
              <Check className="h-3 w-3" /> {t("merchiva.taskAdd.addWithoutEvidence")}
            </Button>
            {skipButton}
          </div>
        </div>
      )}
      {status === "failed" && !denied && (
        <div className="mt-2 pt-2.5 border-t border-amber-200/60 dark:border-amber-800/60">
          <div className="text-[10.5px] text-amber-800 dark:text-amber-200 mb-1.5">{failureText}</div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={onRetry} className="px-3">
              <Check className="h-3 w-3" /> {t("merchiva.taskAdd.add")}
            </Button>
            {skipButton}
          </div>
        </div>
      )}
      {status === "added" && canDelete && (
        <Button variant="outline" size="sm" onClick={onDelete}
          className="px-3 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-3 w-3" /> {t("common.delete")}
        </Button>
      )}
    </div>
  );
}
