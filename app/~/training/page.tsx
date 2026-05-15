"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Loader2, Camera, CheckCircle2, Clock, AlertTriangle,
  ChevronRight, RotateCcw, ImageIcon, X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { PermissionGuard } from "@/components/permission-guard";
import { PageHeader } from "@/components/page-header";
import { usePermissions } from "@/lib/context/permissions";
import { useRoleTasks, useStaffRoles } from "@/lib/spacetimedb/hooks";
import { useUploadThing } from "@/lib/uploadthing";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { PageTabs } from "@/components/page-tabs";
import { CurriculumSettingsTab } from "@/components/training/curriculum-settings-tab";
import { CurriculumView } from "@/components/training/curriculum-view";
import { GradingTab } from "@/components/training/grading-tab";
import type { RoleTask, StaffRole } from "@/lib/types";

// ── Types ────────────────────────────────────────────────────────────────────

interface ChecklistState {
  [taskId: string]: boolean;
}

interface EvidenceState {
  [taskId: string]: string; // uploaded image URL
}

interface TrainingModule {
  id: string;
  titleKey: string;
  descKey: string;
  stepKeys: string[];
  completedSteps: boolean[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function getChecklistKey(orgId: string): string {
  return `checklist_${orgId}_${getToday()}`;
}

function getEvidenceKey(orgId: string): string {
  return `evidence_${orgId}_${getToday()}`;
}

function getModulesKey(orgId: string): string {
  return `training_modules_${orgId}`;
}

function parseTimeToMinutes(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function getNowMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function getTaskTimeStatus(
  startTime: string | null,
  endTime: string | null
): "active" | "overdue" | "upcoming" | "none" {
  if (!startTime && !endTime) return "none";
  const now = getNowMinutes();
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  if (start !== null && end !== null) {
    if (now >= start && now <= end) return "active";
    if (now > end) return "overdue";
    return "upcoming";
  }
  if (start !== null && now >= start) return "active";
  if (end !== null && now > end) return "overdue";
  return "upcoming";
}

function progressColor(pct: number): string {
  if (pct >= 80) return "bg-stone-800 dark:bg-stone-200";
  if (pct >= 50) return "bg-stone-500";
  return "bg-stone-300 dark:bg-stone-600";
}

function progressTextColor(pct: number): string {
  if (pct >= 80) return "text-stone-800 dark:text-stone-200";
  if (pct >= 50) return "text-stone-600 dark:text-stone-400";
  return "text-stone-400 dark:text-stone-500";
}

// ── Default training modules ────────────────────────────────────────────────

function getDefaultModules(): TrainingModule[] {
  return [
    {
      id: "opening",
      titleKey: "training.openingProcedures",
      descKey: "training.openingProceduresDesc",
      stepKeys: [
        "training.openingStep1",
        "training.openingStep2",
        "training.openingStep3",
        "training.openingStep4",
        "training.openingStep5",
        "training.openingStep6",
      ],
      completedSteps: [false, false, false, false, false, false],
    },
    {
      id: "cash",
      titleKey: "training.cashHandling",
      descKey: "training.cashHandlingDesc",
      stepKeys: [
        "training.cashStep1",
        "training.cashStep2",
        "training.cashStep3",
        "training.cashStep4",
        "training.cashStep5",
        "training.cashStep6",
      ],
      completedSteps: [false, false, false, false, false, false],
    },
    {
      id: "food",
      titleKey: "training.foodSafety",
      descKey: "training.foodSafetyDesc",
      stepKeys: [
        "training.foodStep1",
        "training.foodStep2",
        "training.foodStep3",
        "training.foodStep4",
        "training.foodStep5",
      ],
      completedSteps: [false, false, false, false, false],
    },
  ];
}

// ── Evidence Upload Button ──────────────────────────────────────────────────

function EvidenceButton({
  taskId,
  evidenceUrl,
  onUpload,
}: {
  taskId: string;
  evidenceUrl: string | undefined;
  onUpload: (taskId: string, url: string) => void;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const { startUpload, isUploading } = useUploadThing("siteImage", {
    onClientUploadComplete: (res) => {
      if (res?.[0]) {
        onUpload(taskId, res[0].ufsUrl);
      }
    },
    onUploadError: () => {},
  });

  const handleFile = useCallback(
    async (file: File) => {
      const accepted = ["image/png", "image/jpeg", "image/gif", "image/webp"];
      if (!accepted.includes(file.type) || file.size > 4 * 1024 * 1024) return;
      await startUpload([file]);
    },
    [startUpload]
  );

  if (evidenceUrl) {
    return (
      <div className="mt-1.5 flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={evidenceUrl}
          alt={t("training.evidenceUploaded")}
          className="h-10 w-10 rounded-[0.3rem] border border-border object-cover"
        />
        <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          {t("training.evidenceUploaded")}
        </span>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={isUploading}
        onClick={() => inputRef.current?.click()}
        className="mt-1.5 inline-flex items-center gap-1.5 rounded-[0.3rem] border border-dashed border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
      >
        {isUploading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Camera className="h-3 w-3" />
        )}
        {isUploading ? "..." : t("training.uploadEvidence")}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </>
  );
}

// ── Daily Checklists Tab ────────────────────────────────────────────────────

function DailyChecklistsTab({
  tasks,
  roles,
  orgId,
}: {
  tasks: RoleTask[];
  roles: StaffRole[];
  orgId: string;
}) {
  const t = useT();
  const [checklist, setChecklist] = useState<ChecklistState>({});
  const [evidence, setEvidence] = useState<EvidenceState>({});

  // Load from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(getChecklistKey(orgId));
      if (stored) setChecklist(JSON.parse(stored));
    } catch {}
    try {
      const stored = localStorage.getItem(getEvidenceKey(orgId));
      if (stored) setEvidence(JSON.parse(stored));
    } catch {}
  }, [orgId]);

  // Save to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(getChecklistKey(orgId), JSON.stringify(checklist));
    } catch {}
  }, [checklist, orgId]);

  useEffect(() => {
    try {
      localStorage.setItem(getEvidenceKey(orgId), JSON.stringify(evidence));
    } catch {}
  }, [evidence, orgId]);

  const toggleTask = useCallback((taskId: string) => {
    setChecklist((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
  }, []);

  const handleEvidence = useCallback((taskId: string, url: string) => {
    setEvidence((prev) => ({ ...prev, [taskId]: url }));
  }, []);

  const roleMap = useMemo(() => {
    const map = new Map<string, StaffRole>();
    for (const role of roles) map.set(role.id, role);
    return map;
  }, [roles]);

  // Group tasks by role — skip orphans whose role was deleted but tasks weren't
  // cascaded (legacy data from before deleteStaffRole cascaded role_tasks).
  const tasksByRole = useMemo(() => {
    const map = new Map<string, RoleTask[]>();
    for (const task of tasks) {
      if (!roleMap.has(task.roleId)) continue;
      const existing = map.get(task.roleId) ?? [];
      existing.push(task);
      map.set(task.roleId, existing);
    }
    for (const [, arr] of map) {
      arr.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return map;
  }, [tasks, roleMap]);

  // Summary stats — only count tasks whose role still exists.
  const activeTasks = useMemo(
    () => tasks.filter((task) => roleMap.has(task.roleId)),
    [tasks, roleMap],
  );
  const totalTasks = activeTasks.length;
  const completedTasks = activeTasks.filter((t) => checklist[t.id]).length;
  const overdueTasks = activeTasks.filter(
    (t) =>
      !checklist[t.id] &&
      getTaskTimeStatus(t.startTime, t.endTime) === "overdue"
  ).length;
  const evidenceCount = Object.keys(evidence).length;
  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  if (totalTasks === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <CheckCircle2 className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">{t("training.noTasksConfigured")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card size="sm">
          <CardContent className="pt-3">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              {t("training.todaysProgress")}
            </p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className={cn("text-xl font-bold tabular-nums", progressTextColor(progressPct))}>
                {completedTasks}/{totalTasks}
              </span>
              <span className="text-[10px] text-muted-foreground">{t("training.tasks")}</span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", progressColor(progressPct))}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="pt-3">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              {t("training.overdueTasks")}
            </p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className={cn("text-xl font-bold tabular-nums", overdueTasks > 0 ? "text-red-600" : "text-foreground")}>
                {overdueTasks}
              </span>
              <span className="text-[10px] text-muted-foreground">{t("training.tasks")}</span>
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="pt-3">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              {t("training.evidenceUploaded")}
            </p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-bold tabular-nums">{evidenceCount}</span>
              <span className="text-[10px] text-muted-foreground">{t("training.photos")}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* All complete banner */}
      {completedTasks === totalTasks && (
        <div className="flex items-center gap-2 rounded-[0.3rem] border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {t("training.allTasksComplete")}
        </div>
      )}

      {/* Tasks grouped by role */}
      {Array.from(tasksByRole.entries()).map(([roleId, roleTasks]) => {
        const role = roleMap.get(roleId);
        const roleCompleted = roleTasks.filter((t) => checklist[t.id]).length;
        const rolePct = Math.round((roleCompleted / roleTasks.length) * 100);
        return (
          <Card key={roleId}>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {role?.color && (
                    <div
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: role.color }}
                    />
                  )}
                  <CardTitle className="text-sm">
                    {role?.name ?? roleId}
                  </CardTitle>
                </div>
                <Badge variant="outline" className="text-[10px] tabular-nums">
                  {roleCompleted}/{roleTasks.length}
                </Badge>
              </div>
              <div className="mt-1.5 h-1 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", progressColor(rolePct))}
                  style={{ width: `${rolePct}%` }}
                />
              </div>
            </CardHeader>
            <CardContent className="py-0">
              <ul className="divide-y divide-border">
                {roleTasks.map((task) => {
                  const done = !!checklist[task.id];
                  const timeStatus = getTaskTimeStatus(task.startTime, task.endTime);
                  return (
                    <li key={task.id} className="py-2.5">
                      <div className="flex items-start gap-2.5">
                        <Checkbox
                          checked={done}
                          onCheckedChange={() => toggleTask(task.id)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={cn(
                                "text-[13px] font-medium leading-tight",
                                done && "line-through text-muted-foreground"
                              )}
                            >
                              {task.title}
                            </span>
                            {timeStatus === "active" && (
                              <Badge variant="default" className="text-[9px] h-4 bg-emerald-600">
                                {t("training.active")}
                              </Badge>
                            )}
                            {timeStatus === "overdue" && !done && (
                              <Badge variant="destructive" className="text-[9px] h-4">
                                {t("training.overdue")}
                              </Badge>
                            )}
                            {timeStatus === "upcoming" && (
                              <Badge variant="outline" className="text-[9px] h-4">
                                {t("training.upcoming")}
                              </Badge>
                            )}
                            {task.requiresEvidence && (
                              <Camera className="h-3 w-3 text-muted-foreground shrink-0" />
                            )}
                          </div>
                          {task.description && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                              {task.description}
                            </p>
                          )}
                          {(task.startTime || task.endTime) && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                              <Clock className="h-2.5 w-2.5" />
                              {t("training.timeWindow")}: {task.startTime ?? "..."} - {task.endTime ?? "..."}
                            </p>
                          )}
                          {task.requiresEvidence && (
                            <EvidenceButton
                              taskId={task.id}
                              evidenceUrl={evidence[task.id]}
                              onUpload={handleEvidence}
                            />
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ── Training Modules Tab ────────────────────────────────────────────────────

function TrainingModulesTab({ orgId }: { orgId: string }) {
  const t = useT();
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Load or seed from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(getModulesKey(orgId));
      if (stored) {
        const parsed = JSON.parse(stored) as TrainingModule[];
        if (parsed.length > 0) {
          setModules(parsed);
          return;
        }
      }
    } catch {}
    // Seed defaults
    const defaults = getDefaultModules();
    setModules(defaults);
    try {
      localStorage.setItem(getModulesKey(orgId), JSON.stringify(defaults));
    } catch {}
  }, [orgId]);

  // Persist on changes
  useEffect(() => {
    if (modules.length === 0) return;
    try {
      localStorage.setItem(getModulesKey(orgId), JSON.stringify(modules));
    } catch {}
  }, [modules, orgId]);

  const toggleStep = useCallback((moduleId: string, stepIdx: number) => {
    setModules((prev) =>
      prev.map((m) => {
        if (m.id !== moduleId) return m;
        const newSteps = [...m.completedSteps];
        newSteps[stepIdx] = !newSteps[stepIdx];
        return { ...m, completedSteps: newSteps };
      })
    );
  }, []);

  const resetModule = useCallback((moduleId: string) => {
    setModules((prev) =>
      prev.map((m) => {
        if (m.id !== moduleId) return m;
        return { ...m, completedSteps: m.completedSteps.map(() => false) };
      })
    );
  }, []);

  return (
    <div className="space-y-3">
      {modules.map((mod) => {
        const completed = mod.completedSteps.filter(Boolean).length;
        const total = mod.stepKeys.length;
        const pct = Math.round((completed / total) * 100);
        const isComplete = completed === total;
        const isExpanded = expandedId === mod.id;

        return (
          <Card key={mod.id}>
            <CardHeader>
              <button
                type="button"
                className="flex w-full items-center gap-3 text-left"
                onClick={() => setExpandedId(isExpanded ? null : mod.id)}
              >
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {t(mod.titleKey)}
                    {isComplete && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    )}
                  </CardTitle>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{t(mod.descKey)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="text-[10px] tabular-nums">
                    {completed}/{total} {t("training.steps")}
                  </Badge>
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform",
                      isExpanded && "rotate-90"
                    )}
                  />
                </div>
              </button>
              <div className="mt-2 h-1 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", progressColor(pct))}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </CardHeader>

            {isExpanded && (
              <CardContent className="pt-0">
                <ul className="space-y-1.5">
                  {mod.stepKeys.map((key, idx) => {
                    const stepDone = mod.completedSteps[idx];
                    return (
                      <li key={idx} className="flex items-start gap-2.5">
                        <Checkbox
                          checked={stepDone}
                          onCheckedChange={() => toggleStep(mod.id, idx)}
                          className="mt-0.5"
                        />
                        <span
                          className={cn(
                            "text-[13px] leading-snug",
                            stepDone && "line-through text-muted-foreground"
                          )}
                        >
                          {t(key)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-3 flex items-center gap-2">
                  {isComplete ? (
                    <button
                      type="button"
                      onClick={() => resetModule(mod.id)}
                      className="inline-flex items-center gap-1.5 rounded-[0.3rem] border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <RotateCcw className="h-3 w-3" />
                      {t("training.resetModule")}
                    </button>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">
                      {t("training.stepOf")
                        .replace("{current}", String(completed + 1))
                        .replace("{total}", String(total))}
                    </span>
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function TrainingPage() {
  const t = useT();
  const { organizationId, isOwner, role: orgRole, can } = usePermissions();
  const [rawTasks] = useRoleTasks();
  const [rawRoles] = useStaffRoles();

  const canEditCurriculum = isOwner || orgRole === "manager";
  const canGrade = canEditCurriculum || can("training_grading", "edit");

  // Map SpacetimeDB rows to typed objects
  const tasks = useMemo<RoleTask[]>(() => {
    if (!organizationId) return [];
    return rawTasks
      .filter(
        (r) =>
          r.organizationId === organizationId ||
          r.organizationId === null ||
          r.organizationId === undefined
      )
      .map((r) => ({
        id: r.id.toString(),
        roleId: r.roleId,
        organizationId: r.organizationId ?? null,
        title: r.title,
        description: r.description,
        startTime: r.startTime ?? null,
        endTime: r.endTime ?? null,
        sortOrder: r.sortOrder,
        requiresEvidence: r.requiresEvidence,
        notifyChats: (() => {
          try {
            return JSON.parse(r.notifyChats) as string[];
          } catch {
            return [];
          }
        })(),
      }));
  }, [rawTasks, organizationId]);

  const roles = useMemo<StaffRole[]>(() => {
    if (!organizationId) return [];
    return rawRoles
      .filter((r) => r.organizationId === organizationId)
      .map((r) => ({
        id: r.id.toString(),
        name: r.name,
        color: r.color,
        icon: r.icon,
        description: r.description,
        permissions: (() => {
          try {
            return JSON.parse(r.permissions);
          } catch {
            return {};
          }
        })(),
      }));
  }, [rawRoles, organizationId]);

  return (
    <PermissionGuard section="staffing">
      <PageHeader
        title={t("training.title")}
        subtitle={t("training.subtitle")}
      />
      <PageTabs tabs={[
        { label: t("nav.staffing"), href: "/~/staffing" },
        { label: t("nav.training"), href: "/~/training" },
      ]} />
      <div className="px-4 lg:px-6 py-4 max-w-3xl">
        <Tabs defaultValue="checklists">
          <TabsList variant="line" className="w-full justify-start mb-4 flex-wrap">
            <TabsTrigger value="checklists">{t("training.dailyChecklists")}</TabsTrigger>
            <TabsTrigger value="modules">{t("training.trainingModules")}</TabsTrigger>
            <TabsTrigger value="curriculum">{t("training.curriculumDays")}</TabsTrigger>
            {canEditCurriculum && (
              <TabsTrigger value="settings">{t("training.settings")}</TabsTrigger>
            )}
            {canGrade && (
              <TabsTrigger value="grading">{t("training.gradingTab")}</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="checklists">
            {organizationId ? (
              <DailyChecklistsTab tasks={tasks} roles={roles} orgId={organizationId} />
            ) : (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </TabsContent>

          <TabsContent value="modules">
            {organizationId ? (
              <TrainingModulesTab orgId={organizationId} />
            ) : (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </TabsContent>

          <TabsContent value="curriculum">
            {organizationId ? (
              <CurriculumView orgId={organizationId} />
            ) : (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </TabsContent>

          {canEditCurriculum && (
            <TabsContent value="settings">
              {organizationId ? (
                <CurriculumSettingsTab orgId={organizationId} />
              ) : (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
            </TabsContent>
          )}

          {canGrade && (
            <TabsContent value="grading">
              {organizationId ? (
                <GradingTab orgId={organizationId} />
              ) : (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>
    </PermissionGuard>
  );
}
