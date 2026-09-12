"use client";

// Shared role + role-task form dialogs, used by both the desktop staffing
// module (components/personnel/staffing-full.tsx) and the mobile personnel
// pages (components/personnel/mobile.tsx). Rendered via DynamicUIElement so
// they present as a modal on desktop and a full page sheet on mobile.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import {
  Award, Baby, Banknote, Box, Briefcase, Bubbles, Camera, ChefHat, Clipboard,
  Clock, Coffee, Dog, Hammer, HandPlatter, Headphones, HeartPulse, Leaf, Mail,
  MoonStar, Music, Package, Palette, Phone, Receipt, ReceiptText, Shield,
  ShoppingCart, Sparkles, Star, Store, Sun, Truck, User, Utensils, Wine,
  Wrench, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  DynamicUIElement, DynamicUIElementContent, DynamicUIElementDescription,
  DynamicUIElementHeader, DynamicUIElementTitle,
} from "@/components/ui/dynamic-ui-element";
import { Spinner } from "@/components/ui/loaders/geometric";
import {
  addRoleTask, addStaffRole, updateRoleTask, updateStaffRole,
} from "@/lib/spacetimedb/actions";
import type { RoleTask, StaffRole, StaffRolePermissions } from "@/lib/types";
import { hapticSuccess } from "@/lib/haptics";
import { useT } from "@/lib/i18n/context";

// ─── Shared role constants ───────────────────────────────────────────────────

export const ROLE_COLORS = [
  "#44403c", // stone
  "#b91c1c", // red
  "#c2410c", // orange
  "#b45309", // amber
  "#4d7c0f", // olive
  "#15803d", // green
  "#0f766e", // teal
  "#0369a1", // sky
  "#1d4ed8", // blue
  "#6d28d9", // violet
  "#be185d", // pink
];

/** Preset swatches + a free-form color well. The last swatch opens the native
 *  color input so users can pick any custom color for the role background. */
export function RoleColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const t = useT();
  const isPreset = ROLE_COLORS.includes(value);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {ROLE_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`h-6 w-6 rounded-full transition-all ${
            value === c ? "ring-2 ring-offset-1 ring-foreground scale-110" : ""
          }`}
          style={{ backgroundColor: c }}
        />
      ))}
      <label
        title={t("staffing.roleDialog.customColor")}
        className={`relative h-6 w-6 rounded-full cursor-pointer overflow-hidden inline-flex items-center justify-center border border-border ${
          !isPreset ? "ring-2 ring-offset-1 ring-foreground scale-110" : ""
        }`}
        style={
          isPreset
            ? { background: "conic-gradient(#ef4444, #eab308, #22c55e, #06b6d4, #3b82f6, #a855f7, #ef4444)" }
            : { backgroundColor: value }
        }
      >
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#44403c"}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer"
          aria-label={t("staffing.roleDialog.customColor")}
        />
        {isPreset && <Palette className="h-3 w-3 text-white drop-shadow" />}
      </label>
    </div>
  );
}

export const ROLE_ICON_MAP: Record<string, LucideIcon> = {
  "user": User, "coffee": Coffee, "utensils": Utensils, "chef-hat": ChefHat,
  "truck": Truck, "package": Package, "clipboard": Clipboard, "wrench": Wrench,
  "headphones": Headphones, "store": Store, "banknote": Banknote,
  "sparkles": Sparkles, "box": Box, "shopping-cart": ShoppingCart,
  "receipt": Receipt, "heart-pulse": HeartPulse, "baby": Baby, "dog": Dog,
  "leaf": Leaf, "music": Music, "camera": Camera, "palette": Palette,
  "hammer": Hammer, "zap": Zap, "star": Star, "award": Award,
  "briefcase": Briefcase, "phone": Phone, "mail": Mail, "clock": Clock,
  "shield": Shield, "wine": Wine, "bubbles": Bubbles, "moon-star": MoonStar,
  "sun": Sun, "receipt-text": ReceiptText, "hand-platter": HandPlatter,
};

export const ROLE_ICON_LIST = [
  "coffee", "utensils", "chef-hat", "store", "receipt", "banknote",
  "package", "box", "shopping-cart", "truck", "clipboard", "clipboard",
  "wrench", "hammer", "sparkles", "headphones", "heart-pulse", "shield",
  "briefcase", "award", "star", "clock", "phone", "mail",
  "leaf", "music", "camera", "palette", "baby", "dog",
  "zap", "user", "wine", "bubbles", "moon-star", "sun", "receipt-text", "hand-platter",
].filter((v, i, a) => a.indexOf(v) === i); // deduplicate

export function RoleIconComp({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  const Comp = ROLE_ICON_MAP[name] ?? User;
  return <Comp className={className} style={style} />;
}

// ─── Task completion lookup ──────────────────────────────────────────────────

export interface TaskDayCompletion {
  completedAtMs: number;
  /** Identity hex of whoever completed it (assignment.completedBy). */
  completedBy: string | null;
  /** Evidence attachments submitted with the completion. */
  evidence: { url: string; type: string }[];
  note: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function parseEvidence(row: any): { url: string; type: string }[] {
  if (typeof row.evidenceUrls === "string" && row.evidenceUrls.length > 0) {
    try {
      const parsed = JSON.parse(row.evidenceUrls);
      if (Array.isArray(parsed)) {
        return parsed
          .map((e: any) => ({ url: String(e?.url ?? ""), type: String(e?.type ?? "image") }))
          .filter((e) => e.url);
      }
    } catch { /* fall through to legacy single URL */ }
  }
  if (row.evidenceUrl) return [{ url: String(row.evidenceUrl), type: "image" }];
  return [];
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-explicit-any */
function completionMs(ts: any): number {
  if (!ts) return 0;
  if (typeof ts === "number") return ts;
  if (typeof ts === "object" && "microsSinceUnixEpoch" in ts) {
    const micros = (ts as { microsSinceUnixEpoch: bigint | number }).microsSinceUnixEpoch;
    return typeof micros === "bigint" ? Number(micros / 1000n) : Number(micros) / 1000;
  }
  return 0;
}

/** Map taskId → latest completion on `dateStr` (local YYYY-MM-DD), from raw
 *  role_task_assignment rows. Lets the roles views show whether each task got
 *  done on any given day, not just today. */
export function taskCompletionsForDate(
  assignmentRows: unknown[],
  organizationId: string,
  dateStr: string,
): Map<string, TaskDayCompletion> {
  const out = new Map<string, TaskDayCompletion>();
  for (const r of assignmentRows as any[]) {
    if (r.organizationId !== organizationId) continue;
    if (r.status !== "completed") continue;
    const ms = completionMs(r.completedAt);
    if (!ms) continue;
    const d = new Date(ms);
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (local !== dateStr) continue;
    const taskId = String(r.taskId ?? "");
    const prev = out.get(taskId);
    if (prev && prev.completedAtMs >= ms) continue;
    out.set(taskId, {
      completedAtMs: ms,
      completedBy: r.completedBy?.toHexString?.() ?? (r.completedBy ? String(r.completedBy) : null),
      evidence: parseEvidence(r),
      note: r.note ? String(r.note) : null,
    });
  }
  return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const ROLE_PERMISSION_KEYS: { key: keyof StaffRolePermissions; tKey: string }[] = [
  { key: "canViewSchedule", tKey: "staffing.permissions.viewSchedule" },
  { key: "canEditSchedule", tKey: "staffing.permissions.editSchedule" },
  { key: "canViewInventory", tKey: "staffing.permissions.viewInventory" },
  { key: "canEditInventory", tKey: "staffing.permissions.editInventory" },
  { key: "canViewSales", tKey: "staffing.permissions.viewSales" },
  { key: "canHandleCash", tKey: "staffing.permissions.handleCash" },
  { key: "canCloseStore", tKey: "staffing.permissions.closeStore" },
];

// ─── Role form dialog ────────────────────────────────────────────────────────

interface RoleFormState {
  name: string;
  color: string;
  icon: string;
  description: string;
  permissions: StaffRolePermissions;
}

const emptyRoleForm = (): RoleFormState => ({
  name: "", color: "#44403c", icon: "user", description: "", permissions: {},
});

/** Add / edit a staff role. Pass `role` to edit, `null` to create. Owns its
 *  form state; callers only control `open` / `onOpenChange`. Data updates
 *  arrive via the SpacetimeDB subscription; `onSaved` is an optional hook for
 *  callers that keep local optimistic caches. */
export function RoleFormDialog({
  open,
  onOpenChange,
  role,
  organizationId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: StaffRole | null;
  organizationId?: string | null;
  onSaved?: (role: StaffRole | null) => void;
}) {
  const t = useT();
  const [form, setForm] = useState<RoleFormState>(emptyRoleForm);
  const [saving, setSaving] = useState(false);

  // Re-seed the form each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setForm(role
      ? { name: role.name, color: role.color, icon: role.icon, description: role.description, permissions: role.permissions ?? {} }
      : emptyRoleForm());
  }, [open, role]);

  const handleSave = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      if (role) {
        await updateStaffRole(role.id, form);
        onSaved?.({ ...role, ...form });
      } else {
        await addStaffRole(form, undefined, organizationId ?? undefined);
        onSaved?.(null);
      }
      hapticSuccess();
      toast.success(role ? t("staffing.toasts.roleUpdated") : t("staffing.toasts.roleAdded"));
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("staffing.toasts.failedSaveRole"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DynamicUIElement open={open} onOpenChange={onOpenChange}>
      <DynamicUIElementContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DynamicUIElementHeader>
          <DynamicUIElementTitle>{role ? t("staffing.roleDialog.editTitle") : t("staffing.roleDialog.addTitle")}</DynamicUIElementTitle>
          <DynamicUIElementDescription>
            {role ? t("staffing.roleDialog.editDescription") : t("staffing.roleDialog.addDescription")}
          </DynamicUIElementDescription>
        </DynamicUIElementHeader>
        <div className="space-y-4 py-1">
          {/* Icon picker */}
          <div className="space-y-1.5">
            <Label>{t("staffing.roleDialog.icon")}</Label>
            <div className="grid grid-cols-8 gap-1">
              {ROLE_ICON_LIST.map((iconName) => (
                <button
                  key={iconName}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, icon: iconName }))}
                  className={`h-8 w-8 flex items-center justify-center transition-colors ${
                    form.icon === iconName
                      ? "border-2 border-foreground bg-muted"
                      : "border border-transparent bg-muted hover:bg-muted/80"
                  }`}
                  title={iconName}
                >
                  <RoleIconComp name={iconName} className="h-4 w-4 text-foreground" />
                </button>
              ))}
            </div>
          </div>

          {/* Role name */}
          <div className="space-y-1.5">
            <Label>{t("staffing.roleDialog.roleName")}</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={t("staffing.roleDialog.roleNamePlaceholder")}
            />
          </div>

          {/* Color picker */}
          <div className="space-y-1.5">
            <Label>{t("staffing.roleDialog.color")}</Label>
            <RoleColorPicker value={form.color} onChange={(c) => setForm((f) => ({ ...f, color: c }))} />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>{t("staffing.roleDialog.description")}</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder={t("staffing.roleDialog.descriptionPlaceholder")}
              className="resize-none text-sm"
              rows={2}
            />
          </div>

          {/* Permissions */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" /> {t("staffing.roleDialog.permissionsLabel")}
            </Label>
            <div className="space-y-0.5">
              {ROLE_PERMISSION_KEYS.map(({ key, tKey }) => (
                <label key={key} className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-muted/50 cursor-pointer">
                  <Checkbox
                    checked={form.permissions[key] === true}
                    onCheckedChange={() =>
                      setForm((f) => ({
                        ...f,
                        permissions: { ...f.permissions, [key]: !f.permissions[key] },
                      }))
                    }
                  />
                  <span className="text-sm">{t(tKey)}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={handleSave} disabled={saving || !form.name}>
            {saving ? <Spinner size={16} /> : role ? t("staffing.roleDialog.saveCta") : t("staffing.roleDialog.addCta")}
          </Button>
        </div>
      </DynamicUIElementContent>
    </DynamicUIElement>
  );
}

// ─── Role task form dialog ───────────────────────────────────────────────────

interface TaskFormState {
  title: string;
  description: string;
  hasTime: boolean;
  startTime: string;
  endTime: string;
  requiresEvidence: boolean;
  notifyChats: string[];
}

const emptyTaskForm = (): TaskFormState => ({
  title: "", description: "", hasTime: false, startTime: "08:00", endTime: "10:00",
  requiresEvidence: false, notifyChats: [],
});

/** Add / edit a role task. Pass `task` to edit, `null` to create a new task
 *  on `roleId`. Same fields, validation and actions as the desktop editor. */
export function RoleTaskFormDialog({
  open,
  onOpenChange,
  task,
  roleId,
  organizationId,
  sortOrder,
  chatOptions,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: RoleTask | null;
  roleId: string;
  organizationId?: string | null;
  /** sortOrder assigned to a newly created task (usually the current task count). */
  sortOrder: number;
  chatOptions: { id: string; name: string | null; type: string }[];
  onSaved?: (task: RoleTask | null) => void;
}) {
  const t = useT();
  const [form, setForm] = useState<TaskFormState>(emptyTaskForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(task
      ? {
          title: task.title,
          description: task.description,
          hasTime: !!(task.startTime && task.endTime),
          startTime: task.startTime ?? "08:00",
          endTime: task.endTime ?? "10:00",
          requiresEvidence: task.requiresEvidence ?? false,
          notifyChats: task.notifyChats ?? [],
        }
      : emptyTaskForm());
  }, [open, task]);

  const groupChats = chatOptions.filter((c) => c.type === "group");

  const handleSave = async () => {
    if (!form.title || (form.requiresEvidence && form.notifyChats.length === 0)) return;
    setSaving(true);
    const st = form.hasTime ? form.startTime : null;
    const et = form.hasTime ? form.endTime : null;
    try {
      if (task) {
        await updateRoleTask(task.id, {
          title: form.title,
          description: form.description,
          startTime: st,
          endTime: et,
          sortOrder: task.sortOrder,
          requiresEvidence: form.requiresEvidence,
          notifyChats: form.notifyChats,
        });
        onSaved?.({ ...task, title: form.title, description: form.description, startTime: st, endTime: et, requiresEvidence: form.requiresEvidence, notifyChats: form.notifyChats });
      } else {
        await addRoleTask({
          roleId,
          organizationId: organizationId ?? null,
          title: form.title,
          description: form.description,
          startTime: st,
          endTime: et,
          sortOrder,
          requiresEvidence: form.requiresEvidence,
          notifyChats: form.notifyChats,
        });
        onSaved?.(null);
      }
      hapticSuccess();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("staffing.toasts.failedSaveTask"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DynamicUIElement open={open} onOpenChange={onOpenChange}>
      <DynamicUIElementContent className="max-w-sm">
        <DynamicUIElementHeader>
          <DynamicUIElementTitle>{task ? t("staffing.taskDialog.editTitle") : t("staffing.taskDialog.addTitle")}</DynamicUIElementTitle>
          <DynamicUIElementDescription>
            {task ? t("staffing.taskDialog.editDescription") : t("staffing.taskDialog.addDescription")}
          </DynamicUIElementDescription>
        </DynamicUIElementHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>{t("staffing.taskDialog.taskTitle")}</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder={t("staffing.taskDialog.taskTitlePlaceholderAlt")}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("staffing.taskDialog.details")} <span className="text-muted-foreground font-normal">{t("staffing.taskDialog.optional")}</span></Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder={t("staffing.taskDialog.detailsPlaceholder")}
              className="resize-none text-sm"
              rows={3}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>{t("staffing.taskDialog.timeWindow")}</Label>
            <Switch
              checked={form.hasTime}
              onCheckedChange={() => setForm((f) => ({ ...f, hasTime: !f.hasTime }))}
            />
          </div>
          {form.hasTime && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("staffing.taskDialog.startTime")}</Label>
                <Input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("staffing.taskDialog.endTime")}</Label>
                <Input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                />
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <div>
              <Label>{t("staffing.taskDialog.requireEvidence")}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">{t("staffing.taskDialog.requireEvidenceHint")}</p>
            </div>
            <Switch
              checked={form.requiresEvidence}
              onCheckedChange={() => setForm((f) => ({ ...f, requiresEvidence: !f.requiresEvidence }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>
              {t("staffing.taskDialog.notifyChat")}
              {form.requiresEvidence && <span className="text-destructive ml-1">*</span>}
            </Label>
            <p className="text-xs text-muted-foreground">
              {form.requiresEvidence
                ? t("staffing.taskDialog.notifyChatRequired")
                : t("staffing.taskDialog.notifyChatHint")}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {groupChats.map((c) => {
                const selected = form.notifyChats.includes(c.id);
                return (
                  <Button
                    key={c.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-pressed={selected}
                    onClick={() => setForm((f) => ({
                      ...f,
                      notifyChats: selected
                        ? f.notifyChats.filter((id) => id !== c.id)
                        : [...f.notifyChats, c.id],
                    }))}
                    className={`rounded text-xs ${
                      selected
                        ? "border-foreground bg-foreground text-background hover:bg-foreground hover:text-background"
                        : "text-muted-foreground"
                    }`}
                  >
                    {c.name ?? t("staffing.unnamed")}
                  </Button>
                );
              })}
              {groupChats.length === 0 && (
                <p className="text-xs text-muted-foreground">{t("staffing.taskDialog.noGroupChats")}</p>
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={handleSave} disabled={saving || !form.title || (form.requiresEvidence && form.notifyChats.length === 0)}>
            {saving ? <Spinner size={16} /> : task ? t("staffing.taskDialog.saveCta") : t("staffing.taskDialog.addCta")}
          </Button>
        </div>
      </DynamicUIElementContent>
    </DynamicUIElement>
  );
}
