"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  Clock,
  MessageSquare,
  AlertTriangle,
  Loader2,
  ChevronRight,
  Calendar,
  CheckCircle2,
  Circle,
  Plus,
  X,
  User,
  RefreshCw,
  Coffee,
  Utensils,
  ChefHat,
  Truck,
  Package,
  Clipboard,
  Wrench,
  Headphones,
  Store,
  Banknote,
  Sparkles,
  Box,
  ShoppingCart,
  Receipt,
  HeartPulse,
  Baby,
  Dog,
  Leaf,
  Music,
  Camera,
  Palette,
  Hammer,
  Zap,
  Star,
  Award,
  Briefcase,
  Phone,
  Mail,
  Shield,
  Wine,
  Bubbles,
  MoonStar,
  Sun,
  ReceiptText,
  HandPlatter,
  type LucideIcon,
} from "lucide-react";

const ROLE_ICON_MAP: Record<string, LucideIcon> = {
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
import { getCached, setCache } from "@/lib/cache";
import { getShifts, getRoleTasks, getStaffRoles } from "@/lib/db/staffing";
import { getConversations } from "@/lib/db/chat";
import { addTodo, toggleTodo, deleteTodo } from "@/lib/spacetimedb/actions";
import { getTodos } from "@/lib/db/todos";
import { uploadEvidence } from "@/lib/db/evidence";
import { sendMessage } from "@/lib/spacetimedb/actions";
import { getTodayCompletions, completeTask } from "@/lib/db/task-completions";
import { usePermissions } from "@/lib/context/permissions";
import { useT } from "@/lib/i18n/context";
import type { Shift, ChatConversation, Todo, RoleTask, StaffRole } from "@/lib/types";

function formatTime(t: string) {
  const [h, m] = t.split(":");
  const hr = parseInt(h);
  const ampm = hr >= 12 ? "PM" : "AM";
  return `${hr === 0 ? 12 : hr > 12 ? hr - 12 : hr}:${m} ${ampm}`;
}

function relativeTime(dateStr: string, t: (path: string) => string) {
  const now = new Date();
  const d = new Date(dateStr);
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("dashboard.time.justNow");
  if (mins < 60) return t("dashboard.time.minutesAgo").replace("{n}", String(mins));
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t("dashboard.time.hoursAgo").replace("{n}", String(hrs));
  const days = Math.floor(hrs / 24);
  return t("dashboard.time.daysAgo").replace("{n}", String(days));
}

type DashBgCache = {
  shifts: Shift[];
  conversations: ChatConversation[];
  alerts: { message: string; severity: "high" | "medium" }[];
};

export default function DashboardPage() {
  const { organizationId, currentOrg } = usePermissions();
  const tr = useT();
  const [refreshing, setRefreshing] = useState(false);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [alerts, setAlerts] = useState<{ message: string; severity: "high" | "medium" }[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [roleTasks, setRoleTasks] = useState<(RoleTask & { roleName: string; roleColor: string; roleIcon: string; checked: boolean; checkedBy: string | null; requiresEvidence: boolean })[]>([]);
  const [todoInput, setTodoInput] = useState("");
  const [addingTodo, setAddingTodo] = useState(false);
  // Evidence upload for role tasks
  const [evidenceTaskId, setEvidenceTaskId] = useState<string | null>(null);
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const evidenceInputRef = useRef<HTMLInputElement>(null);
  const [userName, setUserName] = useState("");
  const [userId, setUserId] = useState("");
  const todoInputRef = useRef<HTMLInputElement>(null);

  // Load user + todos first (fast, shown immediately)
  const [userReady, setUserReady] = useState(false);
  useEffect(() => {
    const token = localStorage.getItem("stdb_token");
    if (!token) return;
    const uid = token.slice(0, 36);
    setUserId(uid);
    setUserName(currentOrg?.name ?? "");
    setUserReady(true);
    if (organizationId) {
      const cachedTodos = getCached<Todo[]>(`todos_${organizationId}`);
      if (cachedTodos) setTodos(cachedTodos);
      getTodos(uid, organizationId).then((fetched) => {
        setTodos(fetched);
        setCache(`todos_${organizationId}`, fetched);
      }).catch(() => {});
    }
  }, [organizationId, currentOrg]);

  // Load other data in the background
  useEffect(() => {
    if (!organizationId) return;
    const cacheKey = `dashboard_bg_${organizationId}`;

    // Show cached background data instantly
    const cachedBg = getCached<DashBgCache>(cacheKey);
    if (cachedBg) {
      setShifts(cachedBg.shifts);
      setConversations(cachedBg.conversations);
      setAlerts(cachedBg.alerts);
      setRefreshing(true);
    }

    // Collect fetched values for caching after all resolve
    let fetchedShifts: Shift[] = [];
    let fetchedConversations: ChatConversation[] = [];
    let fetchedAlerts: { message: string; severity: "high" | "medium" }[] = [];

    Promise.all([
      // Load shifts, then fetch role tasks for today's user shifts
      Promise.all([getShifts(1), getStaffRoles()]).then(async ([allShifts, roles]) => {
        fetchedShifts = allShifts;
        setShifts(allShifts);
        const today = new Date().toISOString().split("T")[0];
        // SpacetimeDB: memberId lookup not available without Supabase; skip filtering by member
        const myTodayShifts = allShifts.filter((s) => s.date === today);
        // Collect unique role names from today's shifts
        const myRoleNames = [...new Set(myTodayShifts.flatMap((s) => s.staffRoles))];
        if (myRoleNames.length === 0) return;
        // Find role IDs and fetch tasks
        const matchedRoles = myRoleNames
          .map((name) => roles.find((r) => r.name.toLowerCase() === name.toLowerCase()))
          .filter(Boolean) as StaffRole[];
        const [allTaskArrays, completions] = await Promise.all([
          Promise.all(matchedRoles.map((r) => getRoleTasks(r.id).then((tasks) =>
            tasks.map((t) => ({ ...t, roleName: r.name, roleColor: r.color, roleIcon: r.icon, checked: false, checkedBy: null as string | null, requiresEvidence: t.requiresEvidence }))
          ))),
          getTodayCompletions(organizationId),
        ]);
        const flat = allTaskArrays.flat();
        // Merge completions — localStorage first (shared with staffing), then Supabase
        for (const task of flat) {
          const lsChecked = getCached<boolean>(`task_done_${task.id}_${today}`) ?? false;
          const completion = completions.find((c) => c.roleTaskId === task.id);
          if (completion) {
            task.checked = true;
            task.checkedBy = completion.userName;
            setCache(`task_done_${task.id}_${today}`, true);
          } else if (lsChecked) {
            task.checked = true;
            task.checkedBy = tr("dashboard.todo.you");
          }
        }
        setRoleTasks(flat);
      }).catch(() => {}),
      getConversations(organizationId).then((c) => { fetchedConversations = c; setConversations(c); }).catch(() => {}),
      // Alerts: populated via SpacetimeDB reactive data (no direct DB queries needed)
      Promise.resolve(),
    ]).then(() => {
      setCache(cacheKey, { shifts: fetchedShifts, conversations: fetchedConversations, alerts: fetchedAlerts });
    }).finally(() => {
      setRefreshing(false);
    });
  }, [organizationId]);

  const handleAddTodo = async () => {
    const title = todoInput.trim();
    if (!title || !userId || !organizationId) return;
    setAddingTodo(false);
    setTodoInput("");
    try {
      const todoId = crypto.randomUUID();
      await addTodo(userId, organizationId, title);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setTodos((prev) => [{ id: todoId, userId, organizationId, title, completed: false, createdAt: new Date().toISOString() } as any, ...prev]);
    } catch (err) {
      console.error("Failed to add todo:", err);
    }
  };

  const handleToggleTodo = async (id: string, completed: boolean) => {
    setTodos((prev) => prev.map((t) => t.id === id ? { ...t, completed } : t));
    try {
      await toggleTodo(id, completed);
    } catch (err) {
      console.error("Failed to toggle todo:", err);
      setTodos((prev) => prev.map((t) => t.id === id ? { ...t, completed: !completed } : t));
    }
  };

  const handleDeleteTodo = async (id: string) => {
    const prev = todos;
    setTodos((t) => t.filter((x) => x.id !== id));
    try {
      await deleteTodo(id);
    } catch (err) {
      console.error("Failed to delete todo:", err);
      setTodos(prev);
    }
  };

  const notifyChatsForTask = async (
    task: typeof roleTasks[number],
    evidenceUrls: { url: string; type: string; name: string }[] = []
  ) => {
    if (!task.notifyChats || task.notifyChats.length === 0) return;
    const timeStr = task.startTime && task.endTime
      ? ` · ${formatTime(task.startTime)}–${formatTime(task.endTime)}`
      : "";
    const msg = `[task:done] ${task.title} | ${task.roleName}${timeStr}`;
    // Build message with all evidence URLs embedded
    let fullMsg = msg;
    if (evidenceUrls.length > 0) {
      const urls = evidenceUrls.map((e) => `[${e.type}](${e.url})`).join("\n");
      fullMsg = `${msg}\n${urls}`;
    }
    for (const chatId of task.notifyChats) {
      try {
        await sendMessage(chatId, fullMsg);
      } catch { /* ignore send failures */ }
    }
  };

  const handleEvidenceSubmit = async () => {
    if (!evidenceTaskId || evidenceFiles.length === 0 || !organizationId) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(
        evidenceFiles.map((f) => uploadEvidence(f, evidenceTaskId, organizationId))
      );
      const evidenceUrls = uploaded.map((e) => ({
        url: e.fileUrl,
        type: e.fileType,
        name: `evidence-${e.id}`,
      }));
      const task = roleTasks.find((rt) => rt.id === evidenceTaskId);
      setRoleTasks((prev) => prev.map((rt) => rt.id === evidenceTaskId ? { ...rt, checked: true, checkedBy: userName || tr("dashboard.todo.you") } : rt));
      if (organizationId) {
        setCache(`task_done_${evidenceTaskId}_${today}`, true);
        completeTask(evidenceTaskId, organizationId, userName || "Unknown").catch(() => {});
      }
      setEvidenceTaskId(null);
      setEvidenceFiles([]);
      if (task) notifyChatsForTask(task, evidenceUrls);
    } catch (err) {
      console.error("Failed to upload evidence:", err);
    } finally {
      setUploading(false);
    }
  };

  const today = new Date().toISOString().split("T")[0];
  const todayShifts = shifts.filter((s) => s.date === today);
  const upcomingShifts = shifts.filter((s) => s.date > today).slice(0, 5);
  const recentConvos = conversations.filter((c) => c.lastMessage).slice(0, 5);
  const pendingTodos = todos.filter((t) => !t.completed);
  const completedTodos = todos.filter((t) => t.completed);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return tr("dashboard.greeting.morning");
    if (h < 17) return tr("dashboard.greeting.afternoon");
    return tr("dashboard.greeting.evening");
  })();

  return (
    <div className="p-3 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            {greeting}{userName ? `, ${userName}` : ""}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        {refreshing && <RefreshCw className="h-3.5 w-3.5 mt-1 animate-spin text-muted-foreground shrink-0" />}
      </div>

      {/* Todos — rendered immediately, before other data loads */}
      <section>
        <div className="flex items-center gap-2 mb-2.5">
          <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">{tr("dashboard.todo.title")}</h2>
          {(pendingTodos.length + roleTasks.filter((t) => !t.checked).length) > 0 && (
            <span className="text-xs text-muted-foreground">
              {tr("dashboard.todo.remaining").replace(
                "{n}",
                String(pendingTodos.length + roleTasks.filter((t) => !t.checked).length)
              )}
            </span>
          )}
          <button
            onClick={() => { setAddingTodo(true); setTimeout(() => todoInputRef.current?.focus(), 50); }}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"
          >
            <Plus className="h-3 w-3" /> {tr("dashboard.todo.add")}
          </button>
        </div>

        {/* Add input */}
        {addingTodo && (
          <div className="flex gap-2 mb-2">
            <input
              ref={todoInputRef}
              type="text"
              value={todoInput}
              onChange={(e) => setTodoInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddTodo();
                if (e.key === "Escape") { setAddingTodo(false); setTodoInput(""); }
              }}
              placeholder={tr("dashboard.todo.placeholder")}
              className="flex-1 rounded border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
            <button onClick={handleAddTodo} className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
              {tr("dashboard.todo.add")}
            </button>
          </div>
        )}

        {todos.length === 0 && roleTasks.length === 0 && !addingTodo ? (
          <div className="rounded border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            {tr("dashboard.todo.empty")}
          </div>
        ) : (
          <div className="space-y-1">
            {/* Role tasks for today's shifts */}
            {roleTasks.filter((t) => !t.checked).map((t) => {
              const Icon = ROLE_ICON_MAP[t.roleIcon] ?? User;
              return (
                <div key={`rt-${t.id}`} className="flex items-center gap-2.5 rounded border border-border px-3 py-2 group">
                  <button
                    onClick={() => {
                      if (t.requiresEvidence) {
                        setEvidenceTaskId(t.id);
                        setEvidenceFiles([]);
                      } else if (organizationId) {
                        setCache(`task_done_${t.id}_${today}`, true);
                        setRoleTasks((prev) => prev.map((rt) => rt.id === t.id ? { ...rt, checked: true, checkedBy: userName || tr("dashboard.todo.you") } : rt));
                        completeTask(t.id, organizationId, userName || "Unknown").catch(() => {});
                        notifyChatsForTask(t);
                      }
                    }}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <Circle className="h-4 w-4" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{t.title}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Icon className="h-3 w-3" style={{ color: t.roleColor }} />
                      <span className="text-[10px] text-muted-foreground">{t.roleName}</span>
                      {t.startTime && t.endTime && (
                        <span className="text-[10px] font-mono text-muted-foreground ml-1">
                          {formatTime(t.startTime)}–{formatTime(t.endTime)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {/* Checked role tasks */}
            {roleTasks.filter((t) => t.checked).map((t) => {
              const Icon = ROLE_ICON_MAP[t.roleIcon] ?? User;
              return (
                <div key={`rt-${t.id}`} className="flex items-center gap-2.5 rounded border border-border/50 px-3 py-2 opacity-50">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate line-through">{t.title}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Icon className="h-3 w-3" style={{ color: t.roleColor }} />
                      <span className="text-[10px] text-muted-foreground">{t.roleName}</span>
                      {t.checkedBy && (
                        <>
                          <span className="text-[10px] text-muted-foreground">&middot;</span>
                          <span className="text-[10px] text-muted-foreground">
                            {tr("dashboard.todo.checkedBy").replace("{name}", t.checkedBy)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {/* Personal todos */}
            {pendingTodos.map((t) => (
              <div key={t.id} className="flex items-center gap-2.5 rounded border border-border px-3 py-2 group">
                <button onClick={() => handleToggleTodo(t.id, true)} className="shrink-0 text-muted-foreground hover:text-foreground">
                  <Circle className="h-4 w-4" />
                </button>
                <span className="flex-1 text-sm truncate">{t.title}</span>
                <button onClick={() => handleDeleteTodo(t.id)} className="shrink-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {completedTodos.length > 0 && (
              <div className="pt-1 space-y-1">
                {completedTodos.map((t) => (
                  <div key={t.id} className="flex items-center gap-2.5 rounded border border-border/50 px-3 py-2 group opacity-50">
                    <button onClick={() => handleToggleTodo(t.id, false)} className="shrink-0 text-foreground">
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                    <span className="flex-1 text-sm truncate line-through">{t.title}</span>
                    <button onClick={() => handleDeleteTodo(t.id)} className="shrink-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Alerts */}
      {alerts.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold">{tr("dashboard.alerts.title")}</h2>
            <span className="ml-auto text-xs text-muted-foreground">{alerts.length}</span>
          </div>
          <div className="space-y-1.5">
            {alerts.map((a, i) => (
              <div
                key={i}
                className={`flex items-center gap-2.5 rounded border px-3 py-2 text-sm ${
                  a.severity === "high"
                    ? "border-destructive/30 bg-destructive/5"
                    : "border-border bg-muted/30"
                }`}
              >
                <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                  a.severity === "high" ? "bg-destructive" : "bg-stone-400"
                }`} />
                <span className="text-foreground/80 text-sm">{a.message}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Today's Shifts */}
      <section>
        <div className="flex items-center gap-2 mb-2.5">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">{tr("dashboard.shifts.today")}</h2>
          <Link href="/staffing" className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">
            {tr("dashboard.shifts.viewAll")} <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        {todayShifts.length === 0 ? (
          <div className="rounded border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            {tr("dashboard.shifts.emptyToday")}
          </div>
        ) : (
          <div className="space-y-1.5">
            {todayShifts.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded border border-border px-3 py-2.5">
                <div className="h-8 w-8 rounded-full bg-stone-100 flex items-center justify-center text-xs font-bold text-stone-500 shrink-0">
                  {s.staffName[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{s.staffName}</p>
                  <p className="text-xs text-muted-foreground">{s.staffRoles.length > 0 ? s.staffRoles.join(", ") : s.shiftType}</p>
                </div>
                <span className="text-xs font-mono text-muted-foreground shrink-0">
                  {formatTime(s.startTime)}–{formatTime(s.endTime)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Upcoming Shifts */}
      {upcomingShifts.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2.5">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">{tr("dashboard.shifts.upcoming")}</h2>
          </div>
          <div className="space-y-1.5">
            {upcomingShifts.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded border border-border px-3 py-2">
                <span className="text-xs font-medium text-muted-foreground w-16 shrink-0">
                  {new Date(s.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm truncate">{s.staffName}</span>
                </div>
                <span className="text-xs font-mono text-muted-foreground shrink-0">
                  {formatTime(s.startTime)}–{formatTime(s.endTime)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent Messages */}
      <section>
        <div className="flex items-center gap-2 mb-2.5">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">{tr("dashboard.chat.title")}</h2>
          <Link href="/chat" className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">
            {tr("dashboard.chat.open")} <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        {recentConvos.length === 0 ? (
          <div className="rounded border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            {tr("dashboard.chat.empty")}
          </div>
        ) : (
          <div className="space-y-1.5">
            {recentConvos.map((c) => (
              <Link
                key={c.id}
                href="/chat"
                className="flex items-center gap-3 rounded border border-border px-3 py-2.5 hover:bg-muted/50 transition-colors"
              >
                <div className="h-8 w-8 rounded-full bg-stone-100 flex items-center justify-center text-xs font-bold text-stone-500 shrink-0">
                  {(c.name ?? c.lastMessage?.senderName ?? "?")[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">
                      {c.name ?? c.lastMessage?.senderName ?? tr("dashboard.chat.fallback")}
                    </p>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {c.lastMessage ? relativeTime(c.lastMessage.createdAt, tr) : ""}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {c.lastMessage?.content ?? ""}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Evidence upload modal */}
      {evidenceTaskId && (() => {
        const task = roleTasks.find((t) => t.id === evidenceTaskId);
        if (!task) return null;
        const TaskIcon = ROLE_ICON_MAP[task.roleIcon] ?? User;
        return (
          <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => { setEvidenceTaskId(null); setEvidenceFiles([]); }} />
            <div className="relative w-full max-w-sm bg-background rounded-t-2xl sm:rounded-xl p-4 space-y-4 z-10">
              <div className="flex items-center gap-2.5">
                <TaskIcon className="h-4 w-4" style={{ color: task.roleColor }} />
                <div>
                  <p className="text-sm font-semibold">{task.title}</p>
                  <p className="text-xs text-muted-foreground">{task.roleName}{task.startTime && task.endTime ? ` \u00b7 ${formatTime(task.startTime)}–${formatTime(task.endTime)}` : ""}</p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">{tr("dashboard.evidence.prompt")}</p>

              <input
                ref={evidenceInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length > 0) setEvidenceFiles((prev) => [...prev, ...files]);
                  e.target.value = "";
                }}
              />

              {/* Preview */}
              {evidenceFiles.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {evidenceFiles.map((f, i) => (
                    <div key={i} className="relative h-16 w-16 rounded border border-border overflow-hidden bg-muted">
                      {f.type.startsWith("image/") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={URL.createObjectURL(f)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-[10px] text-muted-foreground">{tr("dashboard.evidence.video")}</div>
                      )}
                      <button
                        onClick={() => setEvidenceFiles((prev) => prev.filter((_, j) => j !== i))}
                        className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-black/60 text-white flex items-center justify-center"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => evidenceInputRef.current?.click()}
                  className="flex-1 rounded border border-border px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
                >
                  {evidenceFiles.length > 0 ? tr("dashboard.evidence.addMore") : tr("dashboard.evidence.choose")}
                </button>
                <button
                  onClick={handleEvidenceSubmit}
                  disabled={evidenceFiles.length === 0 || uploading}
                  className="flex-1 rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : tr("dashboard.evidence.complete")}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
