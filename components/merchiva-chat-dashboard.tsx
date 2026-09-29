"use client";

import { useState, useEffect, useRef, useMemo, useCallback, isValidElement, cloneElement, Children, type ReactNode, type ReactElement } from "react";
import { Package, Users, Eye, ChevronRight, ChevronDown, ChevronUp, Bell, Paperclip, Mic, AtSign, ArrowUp, ArrowRight, Check, Calendar, Sparkles, ArrowLeftRight, CalendarX, Truck, Trash2, Plus, ShoppingCart, Phone, Pencil, UserPlus, UserMinus, ListChecks, Tag, Ticket, X, CheckCircle2, AlertTriangle, Copy, RotateCcw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/context/permissions";
import { useCurrency } from "@/lib/currency";
import { useNotifications } from "@/lib/spacetimedb/hooks";
import { useInventory } from "@/lib/spacetimedb/hooks/useInventory";
import { useSales } from "@/lib/spacetimedb/hooks/useSales";
import { useStaffing } from "@/lib/spacetimedb/hooks/useStaffing";
import { useProducts } from "@/lib/spacetimedb/hooks/useProducts";
import { generateInsights, generateGreeting, type MerchivaInsight } from "@/lib/merchiva-insights";
import {
  createAiChatSession as execCreateSession,
  saveAiChatSession as execSaveSession,
} from "@/lib/spacetimedb/actions";
import { getConnection } from "@/lib/spacetimedb/client";
import { useSpacetimeDB } from "spacetimedb/react";
import { useStaffRoles, useRoleTasks, useAiChatSessions, useTrainingDays, useTrainingObjectives, useSettingsRows, useSuppliers } from "@/lib/spacetimedb/hooks";
import { getUpcomingHolidays, inferCountryFromLocale, parseOpeningHours } from "@/lib/holidays";
import { toast } from "sonner";
import { parseAllSkills, executeAction, getActionCatalog } from "@/lib/merchiva/skills/registry";
import { extractActionBlocks } from "@/lib/merchiva/skills/actions";
import { gateAction } from "@/lib/merchiva/autonomy";
import { useAssistantConfig } from "@/lib/spacetimedb/hooks/useSettings";
import { useTabChatSession } from "@/components/merchiva-dock/tab-sessions";
import { ToolSteps, ToolStepsAnnouncer } from "@/components/merchiva-dock/tool-steps";
import { ActionApprovalCard } from "@/components/merchiva-dock/action-card";
import { CommandGroup } from "@/components/merchiva-dock/command-group";
import { TaskDeleteGroup } from "@/components/merchiva-dock/task-delete-group";
import { RolesListCard } from "@/components/merchiva-dock/task-cards";
import { TasksListInline } from "@/components/merchiva-dock/tasks-list-card";
import { ROLE_ICON_MAP } from "@/components/merchiva-dock/role-icon";
import { useRefIndex } from "@/components/merchiva-dock/use-ref-index";
import { sameId, storedId } from "@/lib/merchiva/action-ids";
import { pinTaskDeletes, resolveRoleRef, roleRefLabel, tasksOfRole } from "@/lib/merchiva/role-ref";
import { expandHistoryFromMessages } from "@/lib/merchiva/chat-history";
import { actionTarget, captureRefLabels } from "@/lib/merchiva/ref-labels";
import { actionFailureText, actionSuccessText } from "@/lib/merchiva/action-toasts";
import { resolveShiftRoles, resolveShiftStaff } from "@/lib/merchiva/shift-refs";
import { splitToolEvents } from "@/lib/merchiva/tool-events";
import { finishJobMessage } from "@/lib/merchiva/job-reply";
import { applyToolEvents, restoreSteps, settleSteps, withSettledSteps, withToolEvents } from "@/lib/merchiva/tool-steps";
import { aiFocusScope, finishAiFocus, finishReplyFocus, focusAction, focusToolStarts, followJobFrames, jobStaleInMs, releaseJobs } from "@/lib/merchiva/tool-focus";
import { currentPagePayload } from "@/lib/merchiva/current-page";
import { useServerClockOffset } from "@/lib/presence/store";
import { captureUndoSnapshot, buildInverse, type UndoSnapshot } from "@/lib/merchiva/undo";
import { useAiJobs } from "@/lib/spacetimedb/hooks";
import { consumeAiJob, deleteAiJob, markNotificationRead } from "@/lib/spacetimedb/actions";
import { getStoredToken } from "@/lib/spacetimedb/client";
import { useAuth } from "@/lib/auth/context";
import type { ChatMessage, PendingAction, TaskDeleteCmd } from "@/lib/merchiva/skills/types";
import { loadMemory, saveMemoryField } from "@/lib/merchiva/memory";
import { loadStoredMcpServers, redactMcpServers } from "@/lib/merchiva/mcp/config";
import { useI18n, useT } from "@/lib/i18n/context";
import { MerchivaLogo } from "@/components/logo";
import { MerchivaCallModal } from "@/components/merchiva-call-modal";
import type { InventoryItem, Permissions } from "@/lib/types";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Eyebrow } from "@/components/ui/eyebrow";
import { StatTile, StatGrid } from "@/components/ui/stat-tile";
import { STATUS_TONE_CLASSES } from "@/components/ui/status-badge";

// ── Brand colors ────────────────────────────────────────────────────────────

const M_ACC = "var(--m-acc)";
const M_ACC_SOFT = "var(--m-acc-soft)";
const M_ACC_BD = "var(--m-acc-bd)";

type RowIdLike = unknown;
type TimestampLike = { microsSinceUnixEpoch?: bigint | number | string } | null | undefined;
type AiChatSessionRow = {
  id?: RowIdLike;
  organizationId?: string;
  userId?: RowIdLike;
  createdAt?: TimestampLike;
  updatedAt?: TimestampLike;
  archived?: boolean;
  messages?: string;
};
type AiJobRow = {
  id?: RowIdLike;
  organizationId?: string;
  sessionId?: string;
  status?: string;
  /**
   * Set by the `consumeAiJob` reducer once this client has finalized the job.
   *
   * The field existed and was written but never read here, and the two
   * de-dupe refs below are created fresh on every mount — so a finished job
   * whose row outlived the 60-second delete timeout (close the tab and it
   * never fires) was re-finalized on the next load. Its actions were rebuilt
   * as `pending`, putting an Approve button back on an order that had already
   * been placed, and an auto-run action could re-fire unattended.
   */
  consumed?: boolean;
  prompt?: string;
  partialText?: string;
  resultText?: string;
  finalText?: string;
  error?: string;
  /** Bumped by every chunk the server run writes; a long silence means the run died. */
  updatedAt?: TimestampLike;
};
type SettingsCacheRow = { organizationId?: string; openingHours?: string | null; countryCode?: string | null };

function rowIdString(id: RowIdLike): string {
  const value = id as { toHexString?: () => string } | null | undefined;
  return typeof value === "object" && value?.toHexString ? value.toHexString() : String(id ?? "");
}

function timestampMicros(value: TimestampLike): number {
  return value && typeof value === "object" && "microsSinceUnixEpoch" in value
    ? Number(value.microsSinceUnixEpoch ?? 0)
    : 0;
}

function tupleRows<T>(value: unknown): T[] {
  if (Array.isArray(value) && Array.isArray(value[0])) return value[0] as T[];
  return Array.isArray(value) ? (value as T[]) : [];
}

// Triage acks are wrapped in this sentinel so the client can peel them off the
// front of a reply and render them as their own chat bubble. Both transports —
// the streaming /api/store-ai body and the background ai_job row — use it, so
// neither depends on a custom HTTP header (which the dev proxy can strip).
const ACK_OPEN = "[[MERCHIVA_ACK]]";
const ACK_CLOSE = "[[/MERCHIVA_ACK]]";

// Monotonic message id generator. `Date.now()` alone collides when two
// messages are created within the same millisecond (e.g. user + ack, or two
// errors in quick succession), producing React "duplicate key" warnings and
// dropped/duplicated rows. The counter guarantees uniqueness per session.
let _msgIdCounter = 0;
function msgId(prefix: string): string {
  _msgIdCounter += 1;
  return `${prefix}-${Date.now()}-${_msgIdCounter}`;
}

// Verbose client-side logging of what we POST to /api/store-ai — mirrors the
// server's raw prompt dump so the full round-trip is inspectable from the
// browser console. On by default; silence with
// `localStorage.setItem("merchiva:logSend", "0")`.
function logMerchivaSend(label: string, payload: Record<string, unknown>) {
  try {
    if (typeof window !== "undefined" && localStorage.getItem("merchiva:logSend") === "0") return;
  } catch { /* localStorage unavailable — log anyway */ }
  const p = payload as { message?: string; history?: unknown[]; context?: unknown; permissions?: unknown };
  console.groupCollapsed(
    `%c[Mr. Merchiva → /api/store-ai] ${label}`,
    "color:#0ea5e9;font-weight:600",
    `${(p.message ?? "").toString().length} msg chars, ${Array.isArray(p.history) ? p.history.length : 0} history turns`,
  );
  console.log("message:", p.message);
  console.log("history:", p.history);
  console.log("context:", p.context);
  console.log("permissions:", p.permissions);
  // Redact auth material before dumping the full payload to the console.
  const redacted = { ...payload };
  if ("token" in redacted) redacted.token = "[redacted]";
  if ("mcpServers" in redacted) redacted.mcpServers = redactMcpServers(redacted.mcpServers);
  console.log("full payload:", redacted);
  console.groupEnd();
}
function splitAck(raw: string): { ack: string; rest: string } {
  if (!raw.startsWith(ACK_OPEN)) return { ack: "", rest: raw };
  const closeIdx = raw.indexOf(ACK_CLOSE);
  if (closeIdx === -1) {
    // Closing tag hasn't streamed in yet — show what we have as the ack.
    return { ack: raw.slice(ACK_OPEN.length), rest: "" };
  }
  return {
    ack: raw.slice(ACK_OPEN.length, closeIdx),
    rest: raw.slice(closeIdx + ACK_CLOSE.length),
  };
}

// ── Notch M (agent mark) ────────────────────────────────────────────────────

export function NotchM({ size = 28, fg = "#fff", bg = "#1c1917" }: { size?: number; fg?: string; bg?: string }) {
  return (
    <span
      className="inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size, borderRadius: 4, background: bg }}
    >
      <svg width={Math.round(size * 0.6)} height={Math.round(size * 0.6)} viewBox="0 0 100 100">
        <path d="M14 14 L40 14 L50 42 L60 14 L86 14 L86 86 L14 86 Z" fill={fg} />
      </svg>
    </span>
  );
}

// ── Sparkline ───────────────────────────────────────────────────────────────

function Sparkline({
  data, color = "#1c1917", width = 80, height = 26, fill,
}: { data: number[]; color?: string; width?: number; height?: number; fill?: boolean }) {
  const max = Math.max(...data) * 1.05;
  const min = Math.min(...data) * 0.95;
  const sx = (i: number) => (i / (data.length - 1)) * width;
  const sy = (v: number) => height - ((v - min) / (max - min || 1)) * height;
  const path = data.map((v, i) => `${i === 0 ? "M" : "L"} ${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} className="block">
      {fill && <path d={`${path} L ${width} ${height} L 0 ${height} Z`} fill={color} fillOpacity="0.08" />}
      <path d={path} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={sx(data.length - 1)} cy={sy(data[data.length - 1])} r="2.2" fill={color} />
    </svg>
  );
}

// ── KPI Strip ───────────────────────────────────────────────────────────────

function KpiStrip() {
  const t = useT();
  const { format } = useCurrency();
  const { organizationId } = usePermissions();
  const { history: salesHistory, hourly: salesHourly, isReady: salesReady } = useSales();
  const { items: invItems, isReady: invReady } = useInventory(organizationId);
  const { shifts: allShifts, loading: staffLoading } = useStaffing(organizationId, null, false);

  const today = todayKey();
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  const todayRevenue = useMemo(() => {
    if (!salesReady) return null;
    const dailyRecord = salesHistory.find((s) => s.date === today);
    if (dailyRecord) return dailyRecord.actual;
    return salesHourly.reduce((sum, s) => sum + s.actual, 0);
  }, [salesHistory, salesHourly, salesReady, today]);

  const todayOrders = useMemo(() => {
    if (!salesReady) return null;
    return salesHourly.length;
  }, [salesHourly, salesReady]);

  const onShiftCount = useMemo(() => {
    if (staffLoading) return null;
    const todayShifts = allShifts.filter((s) => s.date === today);
    const [sh, sm] = [Math.floor(nowMin / 60), nowMin % 60];
    return todayShifts.filter((s) => {
      const [startH, startM] = s.startTime.split(":").map(Number);
      const [endH, endM] = s.endTime.split(":").map(Number);
      const sMin = startH * 60 + startM;
      const eMin = endH * 60 + endM;
      const cur = sh * 60 + sm;
      return cur >= sMin && cur < eMin;
    }).length;
  }, [allShifts, staffLoading, today, nowMin]);

  const totalTodayShifts = useMemo(() => {
    if (staffLoading) return 0;
    return allShifts.filter((s) => s.date === today).length;
  }, [allShifts, staffLoading, today]);

  const atRisk = useMemo(() => {
    if (!invReady) return null;
    return invItems.filter((i) => i.currentStock <= i.minStock).length;
  }, [invItems, invReady]);

  const kpis = [
    {
      label: t("merchiva.kpi.revenueToday"),
      v: todayRevenue != null ? format(todayRevenue, { decimals: 0 }) : "—",
      sub: t("merchiva.kpi.vsAvg"),
      delta: todayRevenue != null && todayRevenue > 0 ? t("merchiva.kpi.live") : "—",
      good: todayRevenue != null && todayRevenue > 0,
    },
    {
      label: t("merchiva.kpi.orders"),
      v: todayOrders != null ? String(todayOrders) : "—",
      sub: t("merchiva.kpi.today"),
      delta: todayOrders != null && todayOrders > 0 ? t("merchiva.kpi.live") : "—",
      good: todayOrders != null && todayOrders > 0,
    },
    {
      label: t("merchiva.kpi.onShift"),
      v: onShiftCount != null ? `${onShiftCount} / ${totalTodayShifts}` : "—",
      sub: t("merchiva.kpi.live"),
      delta: t("merchiva.kpi.live"),
      mono: true,
    },
    {
      label: t("merchiva.kpi.skusAtRisk"),
      v: atRisk != null ? String(atRisk) : "—",
      sub: t("merchiva.kpi.ofTracked").replace("{count}", String(invItems.length)),
      delta: atRisk != null && atRisk > 0 ? t("merchiva.kpi.nHigh").replace("{n}", String(Math.min(atRisk, 3))) : "0",
      warn: atRisk != null && atRisk > 0,
    },
  ];

  return (
    <div className="grid grid-cols-4 border-b border-border bg-background">
      {kpis.map((k, i) => (
        <div key={i} className={cn("px-6 py-4", i > 0 && "border-l border-border")}>
          <Eyebrow as="span" size="xs">{k.label}</Eyebrow>
          <div className="flex items-baseline gap-2 mt-2">
            <div className={cn(
              "text-[26px] font-semibold leading-none tracking-tight",
              k.mono && "font-mono",
              k.warn ? "text-amber-600" : "text-foreground",
            )}>
              {k.v}
            </div>
            <div className={cn(
              "text-[11px] font-mono tabular-nums",
              k.warn ? "text-amber-600" : k.good ? "text-emerald-600" : "text-muted-foreground",
            )}>
              {k.delta}
            </div>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1.5">{k.sub}</div>
        </div>
      ))}
    </div>
  );
}

// ── Watchlist ────────────────────────────────────────────────────────────────

const WATCHLIST = [
  { sku: "SYR-VAN-750", name: "Vanilla syrup · 750ml", stock: 3, par: 6, cover: 2, risk: "high" as const, spark: [7, 6, 6, 5, 5, 4, 3] },
  { sku: "MILK-WH-1G", name: "Whole milk · 1 gal", stock: 6, par: 12, cover: 2, risk: "high" as const, spark: [12, 11, 10, 9, 8, 7, 6] },
  { sku: "BEAN-ETH-1KG", name: "Beans · Ethiopia · 1kg", stock: 18, par: 24, cover: 5, risk: "med" as const, spark: [26, 25, 23, 22, 21, 19, 18] },
];

function WatchlistMini() {
  const { organizationId } = usePermissions();
  const { items: invItems } = useInventory(organizationId);

  const riskItems = useMemo(() => {
    const atRisk = invItems
      .filter((i) => i.currentStock <= i.minStock * 1.5)
      .sort((a, b) => (a.currentStock / (a.minStock || 1)) - (b.currentStock / (b.minStock || 1)))
      .slice(0, 3);

    if (atRisk.length > 0) {
      return atRisk.map((item) => ({
        sku: item.id.slice(0, 12).toUpperCase(),
        name: item.name,
        stock: item.currentStock,
        par: item.maxStock,
        cover: Math.max(1, Math.round((item.currentStock / (item.maxStock || 1)) * 7)),
        risk: (item.currentStock <= item.minStock ? "high" : "med") as "high" | "med",
        spark: Array.from({ length: 7 }, (_, j) => Math.max(0, item.currentStock + (6 - j) * Math.ceil(item.maxStock * 0.05))),
      }));
    }
    return WATCHLIST;
  }, [invItems]);

  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden">
      {riskItems.map((r, i) => {
        const tone = r.risk === "high" ? "#dc2626" : r.risk === "med" ? "#d97706" : "#059669";
        return (
          <div key={r.sku} className={cn("flex items-center gap-3 px-3 py-2", i > 0 && "border-t border-border")}>
            <span className="font-mono text-[10.5px] text-muted-foreground w-[100px] shrink-0">{r.sku}</span>
            <span className="text-[12.5px] flex-1 truncate">{r.name}</span>
            <span className="font-mono text-[11px] tabular-nums">
              <span style={{ color: tone, fontWeight: 600 }}>{r.stock}</span>
              <span className="text-muted-foreground">/{r.par}</span>
            </span>
            <Sparkline data={r.spark} color={tone} width={48} height={18} fill />
            <span className="font-mono text-[10.5px] tabular-nums" style={{ color: tone, width: 30, textAlign: "right" }}>
              {r.cover}d
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Chat components ─────────────────────────────────────────────────────────

// Rotating kaomoji faces shown in the chat's empty state. Picked once at
// mount and then cycled every 2.4s with a quick fade between faces. Kept
// short so they all render in a single monospace line.
const KAOMOJIS = [
  "(｡◕‿◕｡)",
  "ʕ•ᴥ•ʔ",
  "(•‿•)",
  "(ᵔᴥᵔ)",
  "ヽ(°〇°)ﾉ",
  "(｡♥‿♥｡)",
  "(◕‿◕✿)",
  "(✿◠‿◠)",
  "⊂(◉‿◉)つ",
  "(｡• ᵕ •｡)",
  "(◠‿◠)",
  "(=^･ω･^=)",
  "(•◡•)",
  "ヽ(•‿•)ノ",
  "(づ｡◕‿‿◕｡)づ",
  "(￣ω￣)",
  "(っ˘ω˘ς )",
  "(*´︶`*)",
] as const;

// Watermark backdrop for the Merchiva chat thread. Renders absolutely
// behind the scrolling message list so it stays visible even after the
// conversation starts — messages with opaque Bubble backgrounds cover it
// where they sit; the watermark fills the gaps. Pointer-events disabled
// so the user can still scroll/select through it.
//
// The face is static while the chat is idle (one random pick at mount).
// It only changes when the OSS triage model picks a mood for its reply
// and the chat dashboard dispatches `merchiva:set-kaomoji` — at that
// point we fade to the AI's chosen face and leave it there until the
// next AI turn.
// Talking face used during voice calls. The watermark swaps between
// these two while the AI's TTS audio is playing, driven by the audio
// analyser's amplitude reading dispatched from the call modal.
const TALK_FACE_CLOSED = "(◕‿◕)";
const TALK_FACE_OPEN = "(◕O◕)";

function MerchivaWatermark() {
  const t = useT();
  const [face, setFace] = useState<string>(() => KAOMOJIS[Math.floor(Math.random() * KAOMOJIS.length)]);
  const [visible, setVisible] = useState(true);
  const [voiceActive, setVoiceActive] = useState(false);
  const [mouthOpen, setMouthOpen] = useState(false);

  // AI-driven kaomoji from the OSS triage layer. The chat dashboard
  // dispatches this after reading the X-Merchiva-Kaomoji response header.
  useEffect(() => {
    function onSetKaomoji(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (typeof detail !== "string" || !detail.trim()) return;
      setVisible(false);
      const swap = setTimeout(() => {
        setFace(detail);
        setVisible(true);
      }, 200);
      return () => clearTimeout(swap);
    }
    window.addEventListener("merchiva:set-kaomoji", onSetKaomoji);
    return () => window.removeEventListener("merchiva:set-kaomoji", onSetKaomoji);
  }, []);

  // Voice-call mouth animation. The call modal dispatches one event per
  // animation frame while a TTS clip is playing — `{active:true, level}` —
  // and `{active:false}` when the clip ends. We flip between an open and
  // closed face based on a level threshold; the inactive transition is
  // debounced by 600ms so the gap between back-to-back sentences doesn't
  // briefly reset the face.
  useEffect(() => {
    let restoreTimer: ReturnType<typeof setTimeout> | null = null;
    function onMouth(e: Event) {
      const detail = (e as CustomEvent).detail as { active?: boolean; level?: number } | undefined;
      if (!detail) return;
      if (detail.active) {
        if (restoreTimer) { clearTimeout(restoreTimer); restoreTimer = null; }
        setVoiceActive(true);
        setMouthOpen((detail.level ?? 0) > 0.12);
      } else {
        restoreTimer = setTimeout(() => {
          setVoiceActive(false);
          setMouthOpen(false);
          restoreTimer = null;
        }, 600);
      }
    }
    window.addEventListener("merchiva:voice-mouth", onMouth);
    return () => {
      window.removeEventListener("merchiva:voice-mouth", onMouth);
      if (restoreTimer) clearTimeout(restoreTimer);
    };
  }, []);

  // While the call is speaking, the dedicated talking face overrides the
  // AI's chosen mood face so the mouth animation is legible (most picked
  // faces don't have an obvious open variant). When voice playback ends
  // we revert to whatever face the OSS layer last picked.
  const displayedFace = voiceActive ? (mouthOpen ? TALK_FACE_OPEN : TALK_FACE_CLOSED) : face;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 flex flex-col items-center justify-center gap-2 select-none"
    >
      <div
        className={cn(
          "font-mono leading-none tracking-normal",
          // While speaking we want crisp swaps between open/closed mouth;
          // outside voice mode we fade between AI-picked faces.
          voiceActive ? "transition-none" : "transition-opacity duration-300",
        )}
        style={{ color: M_ACC, opacity: visible ? 0.42 : 0, fontSize: 32 }}
      >
        {displayedFace}
      </div>
      <div
        className="flex flex-col items-center gap-2 transition-opacity duration-300"
        style={{ opacity: visible ? 0.32 : 0 }}
      >
        <MerchivaLogo size={64} fg="var(--foreground)" />
        <span className="text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground">
          {t("merchiva.brand") || "Mr. Merchiva"}
        </span>
      </div>
    </div>
  );
}

function Bubble({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 max-w-[680px]">
      <div className="rounded-lg border border-border bg-background p-4 flex flex-col gap-3">
        {children}
      </div>
      {footer && <div className="px-1">{footer}</div>}
    </div>
  );
}

function ChatRow({ from = "merchiva", children, time, footer }: {
  from?: "merchiva" | "system";
  children: React.ReactNode;
  time?: string;
  footer?: React.ReactNode;
}) {
  const t = useT();
  if (from === "system") {
    return (
      <div className="flex items-center gap-3 py-2">
        <div className="flex-1 h-px bg-border" />
        <Eyebrow as="span" size="xs">{children}</Eyebrow>
        <div className="flex-1 h-px bg-border" />
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3">
      <NotchM size={32} fg="#fff" bg="#1c1917" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[12.5px] font-semibold tracking-tight">{t("merchiva.name")}</span>
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{time}</span>
        </div>
        <div className="flex flex-col gap-2">
          {children}
        </div>
        {footer && <div className="mt-2">{footer}</div>}
      </div>
    </div>
  );
}

function VoiceCallRow({ message }: { message: ChatMessage }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const turns = message.voiceCall?.turns ?? [];
  const durationSec = message.voiceCall?.durationSec ?? 0;
  const mm = Math.floor(durationSec / 60);
  const ss = (durationSec % 60).toString().padStart(2, "0");
  const dur = `${mm}:${ss}`;
  const canExpand = turns.length > 0;
  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <button
        type="button"
        onClick={() => canExpand && setExpanded((v) => !v)}
        disabled={!canExpand}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground",
          canExpand && "hover:bg-muted cursor-pointer",
        )}
      >
        <Phone className="h-3 w-3" />
        <span>{t("merchiva.call.title")}</span>
        <span className="text-muted-foreground">·</span>
        <span className="tabular-nums">{dur}</span>
        {canExpand && (
          <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
        )}
      </button>
      {expanded && canExpand && (
        <div className="w-full max-w-[680px] rounded-lg border border-border bg-muted/30 p-3 text-[12.5px] space-y-3 leading-[1.55]">
          {turns.map((turn, i) => (
            <div key={i} className="space-y-1.5">
              <div>
                <Eyebrow as="span" size="xs" className="mr-2">
                  {t("merchiva.call.youSaid")}
                </Eyebrow>
                <span className="whitespace-pre-wrap">{turn.user}</span>
              </div>
              <div>
                <Eyebrow as="span" size="xs" className="mr-2">
                  {t("merchiva.call.merchivaSaid")}
                </Eyebrow>
                <span className="whitespace-pre-wrap">{turn.ai}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InsightCard({
  pill, icon: IconComp, title, body, confidence, primary, secondary, embed, reasoning,
}: {
  pill: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  confidence: number;
  primary: { label: string; icon?: React.ReactNode };
  secondary: string;
  embed?: React.ReactNode;
  reasoning?: string[];
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  return (
    <Bubble>
      <div className="flex items-center gap-2">
        <span className="h-6 px-2 rounded inline-flex items-center gap-1.5"
          style={{ background: M_ACC_SOFT, border: `1px solid ${M_ACC_BD}`, color: M_ACC }}>
          {IconComp}
          <span className="font-mono text-[10px] tracking-[0.08em] uppercase font-semibold">{pill}</span>
        </span>
        <div className="flex-1" />
        <div className="inline-flex items-center gap-1.5 text-[10.5px] font-mono text-muted-foreground">
          {t("merchiva.insight.confidence")}
          <span className="tabular-nums text-foreground font-semibold">{(confidence * 100).toFixed(0)}%</span>
          <span className="inline-block w-12 h-1 rounded-full bg-muted overflow-hidden">
            <span className="block h-full" style={{ width: `${confidence * 100}%`, background: M_ACC }} />
          </span>
        </div>
      </div>
      <h3 className="text-[20px] font-semibold tracking-tight leading-[1.2]">{title}</h3>
      <p className="text-[13.5px] text-muted-foreground leading-[1.55]" style={{ textWrap: "pretty" }}>{body}</p>

      {embed}

      <div className="flex items-center gap-2">
        <Button size="lg" className="px-4 gap-2">
          {primary.label}
          {primary.icon ?? <ArrowRight className="h-3.5 w-3.5" />}
        </Button>
        <Button variant="outline" size="lg" className="px-3">
          {secondary}
        </Button>
        <div className="flex-1" />
        {reasoning && (
          <Button variant="ghost" size="lg" onClick={() => setExpanded((e) => !e)}
            className="px-2 text-[11.5px] text-muted-foreground gap-1">
            {expanded ? t("merchiva.insight.hide") : t("merchiva.insight.why")}
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
        )}
      </div>
      {expanded && reasoning && (
        <div className="border-t border-border pt-3 -mx-4 -mb-4 px-4 pb-4 bg-muted/40">
          <Eyebrow as="span" size="xs">{t("merchiva.insight.basedOn")}</Eyebrow>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {reasoning.map((r) => (
              <span key={r} className="inline-flex items-center gap-1.5 px-2 py-1 border border-border rounded-lg bg-background font-mono text-[10.5px] text-muted-foreground">
                <span className="w-1 h-1 rounded-full" style={{ background: M_ACC }} />
                {r}
              </span>
            ))}
          </div>
        </div>
      )}
    </Bubble>
  );
}

// ── Mr. Merchiva Chat Console ───────────────────────────────────────────────

const INSIGHT_ICONS: Record<string, React.ReactNode> = {
  inventory: <Package className="h-[11px] w-[11px]" />,
  staffing: <Users className="h-[11px] w-[11px]" />,
  sales: <ChevronRight className="h-[11px] w-[11px]" />,
  watchlist: <Eye className="h-[11px] w-[11px]" />,
};

function InsightEmbed({ insight }: { insight: MerchivaInsight }) {
  const t = useT();
  if (insight.type === "inventory" && insight.data) {
    const d = insight.data as { itemName: string; currentStock: number; minStock: number; maxStock: number; unit: string; daysOfCover: number };
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <div className="flex items-baseline gap-2 mb-2">
          <div className="text-[12.5px] font-semibold">{d.itemName}</div>
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{d.currentStock} / {d.maxStock} {d.unit} · {t("merchiva.embed.daysCover").replace("{days}", String(d.daysOfCover))}</span>
        </div>
        <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, (d.currentStock / (d.maxStock || 1)) * 100)}%`,
              background: d.currentStock <= d.minStock ? "#dc2626" : d.currentStock <= d.minStock * 1.5 ? "#d97706" : "#059669",
            }}
          />
        </div>
        <div className="grid grid-cols-3 gap-0 mt-3 divide-x divide-border border-t border-border pt-3 -mx-3 -mb-3 px-3 pb-2">
          {([
            [t("merchiva.embed.current"), `${d.currentStock} ${d.unit}`],
            [t("merchiva.embed.minMax"), `${d.minStock} / ${d.maxStock}`],
            [t("merchiva.embed.cover"), t("merchiva.embed.daysApprox").replace("{days}", String(d.daysOfCover))],
          ] as const).map(([k, v], i) => (
            <div key={k} className={cn(i > 0 && "pl-3")}>
              <Eyebrow as="span" size="xs">{k}</Eyebrow>
              <div className="text-[14px] font-mono tabular-nums mt-1">{v}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (insight.type === "watchlist" && insight.data) {
    return <WatchlistMini />;
  }

  return null;
}

// Category and risk labels are now resolved via i18n at the use site
// (see `merchiva.categories.*` and `merchiva.risk.*`).

const ACTION_CATEGORY_ICONS: Record<string, React.ReactNode> = {
  scheduling: <Calendar className="h-[10px] w-[10px]" />,
  roles: <ListChecks className="h-[10px] w-[10px]" />,
  inventory: <Package className="h-[10px] w-[10px]" />,
  products: <ShoppingCart className="h-[10px] w-[10px]" />,
  pricing: <Tag className="h-[10px] w-[10px]" />,
  suppliers: <Truck className="h-[10px] w-[10px]" />,
  staffing: <Users className="h-[10px] w-[10px]" />,
  notifications: <Bell className="h-[10px] w-[10px]" />,
};


const ACTION_RISK_CLASS: Record<string, string> = {
  low: STATUS_TONE_CLASSES.success,
  medium: STATUS_TONE_CLASSES.neutral,
  high: STATUS_TONE_CLASSES.warning,
};

function ActionsListCard() {
  const t = useT();
  const catalog = getActionCatalog();
  const categoryOrder = ["scheduling", "staffing", "roles", "products", "inventory", "pricing", "suppliers", "notifications"];
  const grouped = categoryOrder
    .map((category) => ({ category, actions: catalog.filter((action) => action.category === category) }))
    .filter((group) => group.actions.length > 0);

  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden mt-2">
      <div className="px-3 py-2 border-b border-border flex items-center gap-2">
        <span className="h-5 px-1.5 rounded inline-flex items-center gap-1 bg-muted border border-border text-muted-foreground">
          <Sparkles className="h-[10px] w-[10px]" />
          <span className="font-mono text-[9px] tracking-[0.08em] uppercase font-semibold">{t("merchiva.actionsList.tag")}</span>
        </span>
        <span className="text-[11px] text-muted-foreground font-mono">{catalog.length}</span>
      </div>
      <div className="max-h-[460px] overflow-y-auto">
        {grouped.map(({ category, actions }) => (
          <div key={category} className="border-b border-border last:border-b-0">
            <div className="px-3 py-2 bg-muted/50 flex items-center gap-2">
              <span className="h-5 w-5 rounded border border-border bg-background text-muted-foreground inline-flex items-center justify-center">
                {ACTION_CATEGORY_ICONS[category] ?? <ArrowRight className="h-[10px] w-[10px]" />}
              </span>
              <span className="text-[12px] font-semibold">{(() => {
                const cl = t(`merchiva.categories.${category}`);
                return cl.startsWith("merchiva.categories.") ? category : cl;
              })()}</span>
              <span className="text-[10px] text-muted-foreground font-mono ml-auto">{actions.length}</span>
            </div>
            <div className="divide-y divide-border">
              {actions.map((action) => {
                const required = action.parameters.filter((param) => param.required);
                const optional = action.parameters.length - required.length;
                const permission = action.requiredPermission
                  ? `${action.requiredPermission.section}:${action.requiredPermission.action}`
                  : "none";
                return (
                  <div key={action.name} className="px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <code className="text-[12px] font-mono font-semibold text-foreground truncate">{action.name}</code>
                      <span className={cn(
                        "h-5 px-1.5 rounded border text-[9px] font-mono uppercase shrink-0",
                        ACTION_RISK_CLASS[action.riskLevel]
                      )}>
                        {t(`merchiva.risk.${action.riskLevel}`)}
                      </span>
                    </div>
                    <div className="text-[11.5px] text-muted-foreground leading-snug mt-1">
                      {action.description}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {required.map((param) => (
                        <span key={param.name} className="h-5 px-1.5 rounded border border-border bg-background text-[10px] font-mono inline-flex items-center">
                          {param.name}: {param.type}
                        </span>
                      ))}
                      {optional > 0 && (
                        <span className="h-5 px-1.5 rounded border border-border bg-muted/40 text-[10px] font-mono text-muted-foreground inline-flex items-center">
                          {t("merchiva.actionsList.optionalCount").replace("{count}", String(optional))}
                        </span>
                      )}
                      {permission !== "none" && (
                        <span className="h-5 px-1.5 rounded border border-border bg-muted/40 text-[10px] font-mono text-muted-foreground inline-flex items-center">
                          {permission}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Q&A form UI ──────────────────────────────────────────────────────────

function QAForm({ items, onSubmit }: { items: QAItem[]; onSubmit: (summary: string) => void }) {
  const t = useT();
  const [selections, setSelections] = useState<Record<number, string[]>>({});
  const [otherOpen, setOtherOpen] = useState<Record<number, boolean>>({});
  const [otherText, setOtherText] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const allAnswered = items.every((_, i) => (selections[i]?.length ?? 0) > 0);

  const handleToggle = (qIndex: number, answer: string) => {
    if (submitted) return;
    setSelections((prev) => {
      const current = prev[qIndex] ?? [];
      const has = current.includes(answer);
      return { ...prev, [qIndex]: has ? current.filter((a) => a !== answer) : [...current, answer] };
    });
  };

  const handleOtherToggle = (qIndex: number) => {
    if (submitted) return;
    setOtherOpen((prev) => ({ ...prev, [qIndex]: !prev[qIndex] }));
  };

  const handleOtherConfirm = (qIndex: number) => {
    const text = (otherText[qIndex] ?? "").trim();
    if (!text) return;
    setSelections((prev) => {
      const current = prev[qIndex] ?? [];
      return { ...prev, [qIndex]: current.includes(text) ? current : [...current, text] };
    });
    setOtherText((prev) => ({ ...prev, [qIndex]: "" }));
    setOtherOpen((prev) => ({ ...prev, [qIndex]: false }));
  };

  const handleSubmit = () => {
    if (!allAnswered || submitted) return;
    setSubmitted(true);
    const summary = items.map((item, i) => `${item.q} → ${(selections[i] ?? []).join(", ")}`).join("\n");
    onSubmit(summary);
  };

  const totalSelected = Object.values(selections).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3 mt-2 space-y-3">
      <div className="flex items-center gap-2">
        <span className="h-5 px-1.5 rounded inline-flex items-center gap-1"
          style={{ background: M_ACC_SOFT, border: `1px solid ${M_ACC_BD}`, color: M_ACC }}>
          <span className="font-mono text-[9px] tracking-[0.08em] uppercase font-semibold">Q&A</span>
        </span>
        {!submitted && (
          <span className="text-[10.5px] text-muted-foreground font-mono">
            {t("merchiva.qa.multiSelect").replace("{count}", String(totalSelected))}
          </span>
        )}
      </div>
      {items.map((item, qi) => (
        <div key={qi}>
          <p className="text-[13px] font-medium text-foreground mb-1.5">{item.q}</p>
          <div className="flex flex-wrap gap-1.5">
            {item.a.map((answer) => {
              const selected = (selections[qi] ?? []).includes(answer);
              return (
                <Button
                  key={answer}
                  variant="outline"
                  disabled={submitted}
                  onClick={() => handleToggle(qi, answer)}
                  className={cn(
                    "px-3 text-[12px]",
                    selected && "border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background",
                    submitted && selected && "opacity-70",
                    submitted && !selected && "text-muted-foreground",
                  )}
                >
                  {selected && <Check className="h-3 w-3" />}
                  {answer}
                </Button>
              );
            })}
            {!submitted && (
              <Button
                variant="outline"
                onClick={() => handleOtherToggle(qi)}
                className={cn(
                  "px-3 text-[12px]",
                  otherOpen[qi]
                    ? "border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background"
                    : "border-dashed text-muted-foreground"
                )}
              >
                {t("merchiva.qa.other")}
              </Button>
            )}
          </div>
          {otherOpen[qi] && !submitted && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <Input
                type="text"
                value={otherText[qi] ?? ""}
                onChange={(e) => setOtherText((prev) => ({ ...prev, [qi]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") handleOtherConfirm(qi); }}
                placeholder={t("merchiva.qa.customReplyPlaceholder")}
                className="flex-1 md:text-[12px]"
              />
              <Button
                onClick={() => handleOtherConfirm(qi)}
                disabled={!(otherText[qi] ?? "").trim()}
                className="px-3"
              >
                <Check className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      ))}
      {!submitted && (
        <Button
          size="lg"
          variant={allAnswered ? "default" : "secondary"}
          disabled={!allAnswered}
          onClick={handleSubmit}
          className="w-full gap-2 text-[13px]"
        >
          <Check className="h-3.5 w-3.5" />
          {allAnswered ? t("merchiva.qa.submit") : t("merchiva.qa.pickAtLeastOne")}
        </Button>
      )}
      {submitted && (
        <div className="text-[11px] font-mono text-emerald-600 inline-flex items-center gap-1">
          <Check className="h-3 w-3" /> {t("merchiva.qa.submitted")}
        </div>
      )}
    </div>
  );
}

// ── Roles & Tasks UI (components/merchiva-dock/task-cards.tsx, command-group.tsx, task-delete-group.tsx) ──

import type { QAItem } from "@/lib/merchiva/skills/types";
import { Spinner } from "@/components/ui/loaders/geometric";
import { todayKey } from "@/lib/date-key";

// ── Markdown renderer ──────────────────────────────────────────────────────

// Extended icon map for the `:iconname:` inline syntax the AI can use in
// chat replies (the prompt tells it to use these instead of emoji). Built
// on top of ROLE_ICON_MAP and adds the icons most useful for chat prose.
const INLINE_ICON_MAP: Record<string, LucideIcon> = {
  ...ROLE_ICON_MAP,
  check: Check, x: X, calendar: Calendar, "alert-triangle": AlertTriangle,
  plus: Plus, "arrow-right": ArrowRight, "arrow-up": ArrowUp,
  "arrow-left-right": ArrowLeftRight, sparkles: Sparkles, pencil: Pencil,
  trash: Trash2, "trash-2": Trash2, "user-plus": UserPlus, "user-minus": UserMinus,
  "check-circle": CheckCircle2, "check-circle-2": CheckCircle2,
  "rotate-ccw": RotateCcw, copy: Copy, "list-checks": ListChecks,
  tag: Tag, ticket: Ticket, "chevron-right": ChevronRight,
  "chevron-down": ChevronDown, "chevron-up": ChevronUp, eye: Eye,
  bell: Bell, mic: Mic, paperclip: Paperclip, "calendar-x": CalendarX,
  package: Package, users: Users,
};

function InlineLucide({ name }: { name: string }) {
  const Comp = INLINE_ICON_MAP[name];
  // Unknown icon name → render the literal `:name:` so the user can see
  // what the model tried to insert. Less surprising than silently dropping.
  if (!Comp) return <span>:{name}:</span>;
  return <Comp className="inline-block h-[1em] w-[1em] align-text-bottom mx-0.5" aria-hidden="true" />;
}

// Walk ReactMarkdown's rendered children and replace `:iconname:` substrings
// inside text nodes with <InlineLucide />. Recurses into nested elements
// (e.g. text inside <strong>), but skips code/pre blocks so the syntax can
// still be referenced literally in docs.
const ICON_RE = /:([a-z][a-z0-9-]*):/g;
function replaceInlineIcons(children: ReactNode): ReactNode {
  if (typeof children === "string") {
    if (!children.includes(":")) return children;
    const parts: ReactNode[] = [];
    let lastIdx = 0;
    let match: RegExpExecArray | null;
    ICON_RE.lastIndex = 0;
    while ((match = ICON_RE.exec(children)) !== null) {
      if (match.index > lastIdx) parts.push(children.slice(lastIdx, match.index));
      parts.push(<InlineLucide key={`${match.index}-${match[1]}`} name={match[1]} />);
      lastIdx = match.index + match[0].length;
    }
    if (parts.length === 0) return children;
    if (lastIdx < children.length) parts.push(children.slice(lastIdx));
    return parts;
  }
  if (Array.isArray(children)) return Children.map(children, replaceInlineIcons);
  if (isValidElement(children)) {
    const el = children as ReactElement<{ children?: ReactNode }>;
    if (el.type === "code" || el.type === "pre") return el;
    if (el.props.children == null) return el;
    return cloneElement(el, undefined, replaceInlineIcons(el.props.children));
  }
  return children;
}

const mdComponents: Record<string, React.ComponentType<React.HTMLAttributes<HTMLElement> & { href?: string; children?: React.ReactNode }>> = {
  p: ({ children, ...props }) => <p className="mb-1.5 last:mb-0" {...props}>{replaceInlineIcons(children)}</p>,
  strong: ({ children, ...props }) => <strong className="font-semibold" {...props}>{replaceInlineIcons(children)}</strong>,
  em: ({ children, ...props }) => <em {...props}>{replaceInlineIcons(children)}</em>,
  ul: ({ children, ...props }) => <ul className="list-disc pl-4 mb-1.5 last:mb-0 space-y-0.5" {...props}>{children}</ul>,
  ol: ({ children, ...props }) => <ol className="list-decimal pl-4 mb-1.5 last:mb-0 space-y-0.5" {...props}>{children}</ol>,
  li: ({ children, ...props }) => <li className="text-[13.5px]" {...props}>{replaceInlineIcons(children)}</li>,
  code: ({ children, className, ...props }) => {
    if (className?.includes("language-")) {
      return <code className="block bg-muted rounded-lg p-2 text-[11px] font-mono text-foreground overflow-x-auto my-1.5" {...props}>{children}</code>;
    }
    return <code className="bg-muted rounded px-1 py-0.5 text-[12px] font-mono text-foreground" {...props}>{children}</code>;
  },
  pre: ({ children, ...props }) => <pre className="mb-1.5 last:mb-0" {...props}>{children}</pre>,
  h1: ({ children, ...props }) => <h1 className="text-[16px] font-semibold mb-1" {...props}>{children}</h1>,
  h2: ({ children, ...props }) => <h2 className="text-[15px] font-semibold mb-1" {...props}>{children}</h2>,
  h3: ({ children, ...props }) => <h3 className="text-[14px] font-semibold mb-1" {...props}>{children}</h3>,
  blockquote: ({ children, ...props }) => <blockquote className="border-l-2 border-border pl-3 text-muted-foreground my-1.5" {...props}>{children}</blockquote>,
  table: ({ children, ...props }) => <div className="overflow-x-auto my-1.5"><table className="text-[12px] w-full border-collapse" {...props}>{children}</table></div>,
  th: ({ children, ...props }) => <th className="h-8 px-3 text-left border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap" {...props}>{replaceInlineIcons(children)}</th>,
  td: ({ children, ...props }) => <td className="px-3 py-2 border-b border-border align-middle" {...props}>{replaceInlineIcons(children)}</td>,
  hr: (props) => <hr className="border-border my-2" {...props} />,
  a: ({ children, href, ...props }) => <a href={href} target="_blank" rel="noopener noreferrer" className="underline text-foreground hover:text-foreground" {...props}>{children}</a>,
};

function MerchivaMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
      {content}
    </ReactMarkdown>
  );
}

// ── Chat message types (imported from lib/merchiva/skills/types) ────────────

function parseSessionMessages(raw: string | undefined | null): ChatMessage[] {
  if (!raw || raw === "[]") return [];
  try {
    const msgs: ChatMessage[] = JSON.parse(raw);
    // Older sessions were saved with `${prefix}-${Date.now()}` ids that could
    // collide when messages were created in the same millisecond. Such dupes
    // are baked into stored data, so reassign a fresh unique id to any id we've
    // already seen — otherwise React throws "duplicate key" on render.
    const seen = new Set<string>();
    return msgs.map((m) => {
      let id = m.id;
      if (!id || seen.has(id)) id = msgId("e");
      seen.add(id);
      return { ...m, id, executed: true, steps: restoreSteps(m.steps) };
    });
  } catch { return []; }
}

type SupplierContextRow = {
  id: string;
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  language?: string | null;
};

function normalizeLookupText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ").replace(/\s+/g, " ").trim();
}

function isSupplierRestockRequest(text: string): boolean {
  return /联系.*供应商|聯絡.*供應商|联络.*供应商|联系.*供應商|补货|補貨|订货|訂貨|下单|下單|采购|採購|restock|order\s+more|reorder|contact\s+(the\s+)?supplier/i.test(text);
}

function findRequestedInventoryItem(text: string, items: InventoryItem[]): InventoryItem | null {
  const haystack = normalizeLookupText(text);
  const ranked = items
    .map((item) => {
      const name = normalizeLookupText(item.name);
      if (!name) return { item, score: 0 };
      if (haystack.includes(name)) return { item, score: name.length + 100 };
      const words = name.split(" ").filter((w) => w.length > 1);
      const matched = words.filter((w) => haystack.includes(w)).length;
      return { item, score: matched > 0 && matched === words.length ? matched * 10 : 0 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.item ?? null;
}

function findSupplierForItem(item: InventoryItem, suppliers: SupplierContextRow[]): SupplierContextRow | null {
  const itemSupplier = normalizeLookupText(item.supplier || "");
  if (!itemSupplier) return null;
  return suppliers.find((s) => normalizeLookupText(s.name) === itemSupplier)
    ?? suppliers.find((s) => {
      const name = normalizeLookupText(s.name);
      return !!name && (name.includes(itemSupplier) || itemSupplier.includes(name));
    })
    ?? null;
}

type RestockPlan = {
  quantity: number;
  rawNeed: number;
  unitsPerCase: number;
  caseCount: number | null;
};

function computeRestockPlan(item: InventoryItem): RestockPlan {
  const target = Number.isFinite(item.maxStock) && item.maxStock > 0 ? item.maxStock : item.minStock;
  const rawNeed = Math.max(0, target - item.currentStock);
  let quantity = rawNeed > 0 ? rawNeed : Math.max(item.minOrderQty ?? 0, item.unitsPerCase ?? 0, 1);
  const unitsPerCase = Number(item.unitsPerCase ?? 0);
  if (unitsPerCase > 0) quantity = Math.ceil(quantity / unitsPerCase) * unitsPerCase;
  const minOrderQty = Number(item.minOrderQty ?? 0);
  if (minOrderQty > 0) quantity = Math.max(quantity, minOrderQty);
  const finalQuantity = Math.max(1, Math.ceil(quantity));
  return {
    quantity: finalQuantity,
    rawNeed,
    unitsPerCase,
    caseCount: unitsPerCase > 0 ? Math.ceil(finalQuantity / unitsPerCase) : null,
  };
}

function supplierLanguageBase(value: unknown): "en" | "zh" | "es" | "fr" | "ar" | "hi" {
  const key = String(value ?? "en").trim().toLowerCase().split(/[-_]/)[0];
  return key === "zh" || key === "es" || key === "fr" || key === "ar" || key === "hi" ? key : "en";
}

function buildRestockNotes(item: InventoryItem, plan: RestockPlan, language: unknown): string {
  const lang = supplierLanguageBase(language);
  const need = Math.max(0, Math.ceil(plan.rawNeed));
  const unit = item.unit || (lang === "zh" ? "个" : "units");
  const looseQuantity = lang === "zh" ? `${plan.quantity}${unit}` : `${plan.quantity} ${unit}`;
  const casePart = plan.caseCount && plan.unitsPerCase > 0
    ? {
        en: `${plan.caseCount} cases - ${plan.quantity} units`,
        zh: `${plan.caseCount}*箱 - ${plan.quantity}个`,
        es: `${plan.caseCount} cajas - ${plan.quantity} unidades`,
        fr: `${plan.caseCount} cartons - ${plan.quantity} unités`,
        ar: `${plan.caseCount} صناديق - ${plan.quantity} وحدة`,
        hi: `${plan.caseCount} केस - ${plan.quantity} यूनिट`,
      }[lang]
    : looseQuantity;
  if (lang === "zh") {
    return `${item.name} 补货，需求${need}${unit}，下单 ${casePart}。请确认库存、价格和最早送达时间。`;
  }
  if (lang === "es") {
    return `Reabastecer ${item.name}: se necesitan ${need} ${unit}; pedir ${casePart}. Confirme disponibilidad, precio actual y fecha de entrega más cercana.`;
  }
  if (lang === "fr") {
    return `Réapprovisionnement ${item.name} : besoin de ${need} ${unit}; commander ${casePart}. Merci de confirmer la disponibilité, le prix actuel et la première date de livraison.`;
  }
  if (lang === "ar") {
    return `إعادة طلب ${item.name}: نحتاج ${need} ${unit}؛ اطلب ${casePart}. يرجى تأكيد التوفر والسعر الحالي وأقرب موعد تسليم.`;
  }
  if (lang === "hi") {
    return `${item.name} रीस्टॉक: ${need} ${unit} चाहिए; ${casePart} ऑर्डर करें। कृपया उपलब्धता, मौजूदा कीमत और सबसे जल्दी डिलीवरी समय की पुष्टि करें।`;
  }
  return `Restock ${item.name}: need ${need} ${unit}; order ${casePart}. Please confirm availability, current pricing, and earliest delivery.`;
}

function buildSupplierRestockFallbackAction(
  userText: string,
  items: InventoryItem[],
  suppliers: SupplierContextRow[],
): Record<string, unknown> | null {
  if (!isSupplierRestockRequest(userText)) return null;
  const item = findRequestedInventoryItem(userText, items);
  if (!item) return null;
  const supplier = findSupplierForItem(item, suppliers);
  if (!supplier) return null;

  const plan = computeRestockPlan(item);
  const quantity = plan.quantity;
  const unitCost = Number(item.costPerUnit ?? 0);
  const subtotal = unitCost > 0 ? quantity * unitCost : 0;
  const supplierLanguage = supplier.language ?? "en";
  const notes = buildRestockNotes(item, plan, supplierLanguage);

  const action: Record<string, unknown> = {
    action: "orderFromSupplier",
    supplierId: supplier.id,
    supplierLanguage,
    items: [{
      name: item.name,
      itemName: item.name,
      quantity,
      unit: plan.unitsPerCase > 0 ? "个" : item.unit || undefined,
      unitCost: unitCost > 0 ? unitCost : undefined,
      unitsPerCase: plan.unitsPerCase > 0 ? plan.unitsPerCase : undefined,
      caseCount: plan.caseCount ?? undefined,
      caseUnit: plan.unitsPerCase > 0 ? "箱" : undefined,
      eachUnit: plan.unitsPerCase > 0 ? "个" : item.unit || undefined,
    }],
    notes,
  };
  if (subtotal > 0) {
    action.subtotal = subtotal;
    action.tax = 0;
    action.total = subtotal;
  }
  return action;
}

// ── Data mention categories ─────────────────────────────────────────────────

const DATA_CATEGORIES = [
  { id: "inventory", label: "Inventory", icon: "package", desc: "Stock levels, low items, suppliers" },
  { id: "sales", label: "Sales", icon: "trending-up", desc: "Revenue, orders, trends" },
  { id: "staffing", label: "Staffing", icon: "users", desc: "Shifts, schedule, team" },
  { id: "products", label: "Products", icon: "shopping-bag", desc: "Catalog, pricing, performance" },
  { id: "all", label: "Everything", icon: "database", desc: "All store data" },
] as const;

const DATA_ICONS: Record<string, React.ReactNode> = {
  inventory: <Package className="h-3.5 w-3.5" />,
  sales: <ArrowRight className="h-3.5 w-3.5" />,
  staffing: <Users className="h-3.5 w-3.5" />,
  products: <Eye className="h-3.5 w-3.5" />,
  all: <Sparkles className="h-3.5 w-3.5" />,
};

const THINKING_PATTERNS: [RegExp, string][] = [
  [/排班|班次|shift|schedule|调班/i, "schedule"],
  [/库存|inventory|stock|进货|补货/i, "inventory"],
  [/销售|revenue|sales|营收|营业额/i, "sales"],
  [/产品|product|menu|菜单|价格|price/i, "product"],
  [/员工|staff|team|团队|成员/i, "staff"],
  [/供应商|supplier|采购|purchase/i, "supplier"],
  [/报告|report|分析|analyz|trend|趋势/i, "report"],
  [/预测|forecast|predict/i, "forecast"],
  [/任务|task|todo/i, "task"],
  [/角色|role|岗位|职位/i, "role"],
  [/通知|notif|提醒|alert/i, "notification"],
];

// Truncate a CSS selector for chip display — keep the tail, since that's where
// the disambiguating tag/nth-of-type lives (the root prefix is shared).
function getThinkingLabel(
  text: string,
  phase: "analyze" | "fetch" | "process",
  t: (path: string) => string,
): string {
  const phaseKey = phase.charAt(0).toUpperCase() + phase.slice(1);
  for (const [re, category] of THINKING_PATTERNS) {
    if (re.test(text)) {
      return t(`merchiva.thinking.${category}${phaseKey}`);
    }
  }
  return t(`merchiva.thinking.default${phaseKey}`);
}

interface MerchivaChatProps {
  compact?: boolean;
  header?: boolean;
  /** Browser tab this Merchiva belongs to — every tab keeps its own conversation. */
  sessionScope?: string;
  /** False while the chat is mounted but not on screen (another tab's, or a collapsed dock). */
  active?: boolean;
}

/** Permission gate: admins can disable Mr. Merchiva per member via the
 *  `merchiva.view` permission. Owners always pass. */
export function MerchivaChat(props: MerchivaChatProps = {}) {
  const { isOwner, can } = usePermissions();
  const t = useT();
  const allowed = isOwner || can("merchiva", "view");
  if (!allowed) {
    const msg = t("merchiva.noAccess");
    return (
      <div className="flex-1 h-full flex items-center justify-center p-6 text-center bg-background">
        <p className="text-[12.5px] text-muted-foreground max-w-[280px] leading-relaxed">
          {msg.startsWith("merchiva.")
            ? "Mr. Merchiva is disabled for your account. Ask a manager to enable it."
            : msg}
        </p>
      </div>
    );
  }
  return <MerchivaChatInner {...props} />;
}

function MerchivaChatInner({
  compact = false,
  header = true,
  sessionScope,
  active = true,
}: MerchivaChatProps = {}) {
  const { currentOrg, organizationId, isOwner, role: orgRole, permissions: userPermissions, can } = usePermissions();
  const { getToken } = useAuth();
  const { locale } = useI18n();
  const t = useT();
  // Mr. Merchiva autonomy config for the active org (defaults to low-risk auto /
  // sensitive proposed). Drives the per-action gate below.
  const { config: autonomyConfig } = useAssistantConfig();
  // Undo snapshots for executed actions, keyed by PendingAction id. Lives in a
  // ref (not message state) because messages get JSON-serialized to SpacetimeDB
  // and snapshots aren't serializable. Captured before execute; consumed on Undo.
  const undoSnapshots = useRef<Map<string, UndoSnapshot>>(new Map());

  // Graceful i18n fallback: a missing merchiva.* key resolves to the path itself.
  const tx = useCallback((key: string, fallback: string) => {
    const v = t(key);
    return v.startsWith("merchiva.") ? fallback : v;
  }, [t]);
  const canForGate = useCallback(
    (section: string, action: "view" | "edit" | "invite") => can(section as keyof Permissions, action),
    [can],
  );

  // The store's rows every card, toast and gate check names an id by (ref-labels.ts).
  const refs = useRefIndex(organizationId);
  const refsRef = useRef(refs);
  useEffect(() => { refsRef.current = refs; }, [refs]);

  // Stamp each parsed action with its autonomy gate decision (auto/propose/deny)
  // using the org's config + the current actor's permissions. The card uses this
  // instead of the old hardcoded "auto unless high-risk" rule.
  const decorateActions = useCallback(
    (actions: PendingAction[]): PendingAction[] =>
      actions.map((a) => {
        const params = a.action as Record<string, unknown>;
        const name = String(params.action ?? "");
        // The price cap needs the product's current price; the model sends only the new one.
        const oldPrice = name === "updatePrice" || name === "updateProduct"
          ? refsRef.current.retailPrice(params.productId)
          : null;
        const g = gateAction(name, params, autonomyConfig, canForGate, { oldPrice });
        // What its ids name now: a delete removes the row, the card keeps the name.
        const refLabels = captureRefLabels(params, refsRef.current, { day: (n) => t("merchiva.refs.day").replace("{n}", String(n)) });
        return {
          ...a, decision: g.decision, reason: g.reason, why: g.why,
          ...(Object.keys(refLabels).length > 0 ? { refLabels } : {}),
        };
      }),
    [autonomyConfig, canForGate, t],
  );
  // Each delete of a reply is pinned to the task it names now, before anything
  // in the reply runs (a same-titled task it adds is never the one deleted).
  const pinDeletes = useCallback(
    (deletes: TaskDeleteCmd[]): TaskDeleteCmd[] | undefined =>
      deletes.length > 0 ? pinTaskDeletes(deletes, refsRef.current.rows.tasks ?? [], refsRef.current.rows.roles ?? []) : undefined,
    [],
  );
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [thinkingPhase, setThinkingPhase] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [callOpen, setCallOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Session management
  // useAiChatSessions() returns [rows[], boolean] from useTable
  const sessionsTuple = useAiChatSessions() as unknown;
  const sessionRows = useMemo(() => tupleRows<AiChatSessionRow>(sessionsTuple), [sessionsTuple]);
  const sessionsReady = Array.isArray(sessionsTuple) && sessionsTuple[1] === true;
  // Sessions are strictly per-user: every member keeps their own Mr. Merchiva
  // history, so filter by the connection identity, not just the org.
  const stdb = useSpacetimeDB();
  const myIdentityHex = stdb?.identity?.toHexString?.() ?? null;
  const mySessions = useMemo(() => {
    if (!organizationId || !sessionRows || !myIdentityHex) return [];
    return sessionRows
      .filter((s) => s && s.organizationId === organizationId && rowIdString(s.userId) === myIdentityHex)
      .sort((a, b) => timestampMicros(b.updatedAt) - timestampMicros(a.updatedAt));
  }, [sessionRows, organizationId, myIdentityHex]);
  // Each browser tab has its own Mr. Merchiva: `sessionScope` (the tab id) picks — and when the
  // tab has none yet, creates — the session this chat shows (components/merchiva-dock/tab-sessions.ts).
  const sessionRefs = useMemo(
    () => mySessions.map((s) => ({ id: rowIdString(s.id), archived: s.archived === true, createdAt: timestampMicros(s.createdAt) })),
    [mySessions],
  );
  const createSession = useCallback(() => execCreateSession(t("merchiva.newConversation")), [t]);
  const activeSessionId = useTabChatSession({
    tabId: sessionScope ?? null,
    sessions: sessionRefs,
    ready: !!organizationId && sessionsReady && !!myIdentityHex && !!getConnection(),
    needed: messages.length > 0,
    create: createSession,
  });
  // Session-level circuit breaker for the background-enqueue path. If the
  // server returns 501 "reducer_missing" once, we know the SpacetimeDB module
  // isn't republished yet and skip the enqueue call entirely until the page
  // is reloaded — sendMessage falls straight through to the streaming route.
  const enqueueDisabledRef = useRef(false);
  // Where this chat's Mr. Merchiva cursor lives (lib/merchiva/ai-focus.ts), and the tool calls it already followed.
  const focusScope = aiFocusScope(sessionScope);
  const focusedToolIds = useRef<Set<string>>(new Set());
  // A chat closed mid-reply (its tab closed, the phone overlay dismissed) will never see the reply end.
  useEffect(() => () => finishAiFocus(focusScope), [focusScope]);

  // Show the session's saved messages once it resolves. Only the first one this chat gets can be the
  // session it just asked for, still empty: that one never wipes what the user sent before it arrived.
  const loadedSessionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeSessionId || loadedSessionRef.current === activeSessionId) return;
    const first = loadedSessionRef.current === null;
    loadedSessionRef.current = activeSessionId;
    const row = mySessions.find((s) => rowIdString(s.id) === activeSessionId);
    const saved = parseSessionMessages(row?.messages ?? "");
    setMessages((prev) => (saved.length > 0 || prev.length === 0 || !first ? saved : prev));
  }, [activeSessionId, mySessions]);

  // Save messages on change to the SpacetimeDB session
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (messages.length === 0) return;
    if (!activeSessionId || !organizationId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const json = JSON.stringify(messages.slice(-50));
      execSaveSession(activeSessionId, json).catch(() => {});
    }, 1000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [messages, activeSessionId, organizationId]);

  // Each tab keeps one persistent conversation. "Clear history" empties the
  // current session in place (no new session is created).
  const handleClearHistory = useCallback(async () => {
    if (!confirm(t("merchiva.clearHistoryConfirm"))) return;
    setMessages([]);
    if (activeSessionId) {
      execSaveSession(activeSessionId, JSON.stringify([])).catch(() => {});
    }
  }, [activeSessionId, t]);

  // @data mention
  const [dataMentionOpen, setDataMentionOpen] = useState(false);
  const [attachedData, setAttachedData] = useState<string[]>([]);

  // Voice recording
  const [recording, setRecording] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  // File upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<{ name: string; url: string; type: string }[]>([]);

  const orgName = currentOrg?.name ?? t("merchiva.yourStore");

  const { items: invItems } = useInventory(organizationId);
  const { history: salesHistory, hourly: salesHourly } = useSales();
  const { shifts, team, presets: shiftPresets, allAvailability, myTimeOffRequests: timeOffRequests, orgShiftTrades: shiftTrades, chatOptions } = useStaffing(organizationId, null, false);
  const groupChats = useMemo(
    () => chatOptions.filter((c) => c.type === "group").map((c) => ({ id: c.id, name: c.name ?? t("merchiva.untitledGroup") })),
    [chatOptions, t]
  );
  const { products } = useProducts(organizationId);
  // Supplier records (id + email) so Mr. Merchiva can resolve a low-stock
  // item's supplier NAME to a real supplier id when calling orderFromSupplier.
  // Without this the AI never sees existing suppliers and wrongly asks to
  // re-add them before every order.
  const [rawSupplierRows] = useSuppliers() as [unknown[], boolean];
  const suppliers = useMemo(
    () =>
      (rawSupplierRows ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((r: any) => r && r.organizationId === organizationId)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) => ({
          id: r.id?.toString?.() ?? String(r.id),
          name: r.name ?? "",
          contactName: r.contactName ?? "",
          email: r.email ?? "",
          phone: r.phone ?? "",
          language: r.language ?? "en",
        })),
    [rawSupplierRows, organizationId],
  );
  const [rawNotifs] = useNotifications();
  // Settings row for this org — opening hours + country code for holiday lookup.
  const settingsRowsTuple = useSettingsRows() as unknown;
  const settingsRows = useMemo(() => tupleRows<SettingsCacheRow>(settingsRowsTuple), [settingsRowsTuple]);
   
  const orgSettings = useMemo(
    () => settingsRows.find((s) => s?.organizationId === organizationId),
    [settingsRows, organizationId],
  );
  // useStaffRoles() returns the [rows, ready] tuple from useTable — destructure
  // first, then filter. Treating the tuple as the row array (the prior code)
  // silently made `staffRoles` always [], which (a) blanked the role list the
  // AI sees in store context — making it guess "manager"/"morning" — and
  // (b) broke any client-side role validation built on top of it.
  const [rawStaffRoleRows] = useStaffRoles() as [unknown[], boolean];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const staffRoles = (rawStaffRoleRows ?? []).filter((r: any) => r && typeof r === "object" && r.name) as Array<{ id: any; name: string; color: string; icon: string; description: string; permissions: string }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawRoleTasksResult = useRoleTasks() as any;
  const roleTasks = useMemo(() => {
    const rows = Array.isArray(rawRoleTasksResult) ? rawRoleTasksResult[0] : rawRoleTasksResult;
    if (!organizationId || !Array.isArray(rows)) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows.filter((t: any) => t && t.organizationId === organizationId);
  }, [rawRoleTasksResult, organizationId]);

  // Training curriculum — surfaced into storeContext so Mr. Merchiva can
  // reference existing days by number ("Day 3") and edit / add objectives.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rawTrainingDays] = useTrainingDays() as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rawTrainingObjectives] = useTrainingObjectives() as any;
  const trainingDays = useMemo(() => {
    if (!organizationId || !Array.isArray(rawTrainingDays)) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (rawTrainingDays as any[])
      .filter((d) => d && d.organizationId === organizationId)
      .map((d) => ({
        id: d.id?.toString?.() ?? String(d.id),
        dayNumber: Number(d.dayNumber ?? 0),
        title: String(d.title ?? ""),
        sortOrder: Number(d.sortOrder ?? 0),
        // Plain-text excerpt of the day's content so the model can scan it
        // without paying for full HTML token cost.
        excerpt: typeof d.description === "string"
          ? d.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240)
          : "",
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.dayNumber - b.dayNumber);
  }, [rawTrainingDays, organizationId]);
  const trainingObjectives = useMemo(() => {
    if (!organizationId || !Array.isArray(rawTrainingObjectives)) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (rawTrainingObjectives as any[])
      .filter((o) => o && o.organizationId === organizationId)
      .map((o) => ({
        id: o.id?.toString?.() ?? String(o.id),
        dayId: String(o.dayId ?? ""),
        text: typeof o.text === "string"
          ? o.text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160)
          : "",
        mediaType: o.mediaType ?? null,
      }));
  }, [rawTrainingObjectives, organizationId]);

  const insights = useMemo(
    () => generateInsights(invItems, shifts, salesHistory, salesHourly),
    [invItems, shifts, salesHistory, salesHourly],
  );

  const headline = useMemo(
    () => generateGreeting(insights.length),
    [insights.length],
  );

  // Build store context for AI
  const today = todayKey();
  const storeContext = useMemo(() => {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    // Opening hours + upcoming holidays — surfaced so the auto-scheduler can
    // align shifts with open/close and flag dates that may need special hours.
    const openingHours = parseOpeningHours(orgSettings?.openingHours ?? null);
    const hoursStatus: "set" | "unset" = openingHours ? "set" : "unset";
    const countryCode = (orgSettings?.countryCode as string | undefined) ?? inferCountryFromLocale(locale);
    const upcomingHolidays = getUpcomingHolidays(countryCode, 14);
    return {
      storeName: orgName,
      today,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      openingHours,
      hoursStatus,
      countryCode,
      upcomingHolidays,
      inventory: invItems.slice(0, 50).map((i) => ({
        id: i.id, name: i.name, category: i.category, stock: i.currentStock,
        min: i.minStock, max: i.maxStock, unit: i.unit, supplier: i.supplier,
        status: i.status,
        // Ordering specs so restock orders round to whole cases / respect a minimum.
        minOrderQty: i.minOrderQty, unitsPerCase: i.unitsPerCase,
      })),
      // Supplier records — orderFromSupplier needs the `id`. Match an inventory
      // item's `supplier` NAME to a supplier here to get the id before ordering.
      suppliers: suppliers.map((s) => ({
        id: s.id, name: s.name, contactName: s.contactName, email: s.email, phone: s.phone, language: s.language ?? "en",
      })),
      todayShifts: shifts.filter((s) => s.date === today).map((s) => ({
        id: s.id, name: s.staffName, role: s.staffRoles.join(", "), start: s.startTime, end: s.endTime, type: s.shiftType,
      })),
      upcomingShifts: shifts.filter((s) => s.date > today).slice(0, 30).map((s) => ({
        id: s.id, name: s.staffName, date: s.date, start: s.startTime, end: s.endTime, type: s.shiftType,
      })),
      team: team.map((m) => ({
        id: m.id,
        name: m.displayName,
        // `hasPunchInCode` lets Mr. Merchiva know whether to prompt the user
        // for a code before scheduling shifts for this member.
        hasPunchInCode: !!m.punchInCode,
        // NB: we intentionally do NOT expose the org permission level
        // (owner/manager/staff) here. Repeatedly the AI was grabbing that
        // string and stuffing it into addShift.staffRoles, even after we
        // renamed the field and added explicit prompt instructions against
        // it — OSS models keep latching onto any "role-shaped" value within
        // reach. The permission level isn't useful for scheduling anyway
        // (auth is enforced server-side), so the simplest fix is to remove
        // the temptation entirely. Job roles live in the top-level roles[]
        // array, which is what addShift.staffRoles must come from.
      })),
      recentSales: salesHistory.slice(-7).map((s) => ({ date: s.date, revenue: s.actual })),
      todaySales: salesHourly.map((s) => ({ hour: s.hour, revenue: s.actual })),
      products: products.slice(0, 30).map((p) => ({ id: p.id, name: p.name, price: p.price, category: p.category })),
      unreadNotifications: rawNotifs.filter((n) => !n.read).length,
      insights: insights.map((i) => ({ type: i.type, title: i.title, severity: i.severity })),
      // Roles with IDs and tasks
      roles: staffRoles.map((r) => ({
        id: String(r.id), name: r.name, color: r.color, icon: r.icon, description: r.description,
        // A task's roleId may be stored hyphenated or as 32 hex digits: compare canonically.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tasks: tasksOfRole(roleTasks as any[], r.id).map((t: any) => ({
          id: String(t.id), title: t.title, description: t.description,
          startTime: t.startTime ?? null, endTime: t.endTime ?? null,
          requiresEvidence: t.requiresEvidence ?? false,
        })),
      })),
      // Shift presets (templates)
      shiftPresets: shiftPresets.map((p) => ({
        id: p.id, name: p.name, startTime: p.startTime, endTime: p.endTime,
      })),
      // Staff availability (per person, per day of week)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      availability: allAvailability.slice(0, 20).map((a: any) => {
        const memberName = team.find((m) => m.userId === a.userId)?.displayName ?? a.userId;
        const availDays = Array.isArray(a.days)
          ? a.days.map((available: boolean, i: number) => available ? dayNames[i] : null).filter(Boolean)
          : [];
        return { staffName: memberName, type: a.type, availableDays: availDays, startDate: a.startDate, endDate: a.endDate };
      }),
      // Pending time-off requests
      timeOffRequests: timeOffRequests.filter((r) => r.status === "pending").map((r) => ({
        id: r.id, staffName: team.find((m) => m.userId === r.userId)?.displayName ?? r.userId,
        startDate: r.startDate, endDate: r.endDate, fullDays: r.fullDays, status: r.status,
      })),
      // Pending shift trades
      shiftTrades: shiftTrades.filter((t) => t.status === "pending").map((t) => ({
        id: t.id, type: t.type, status: t.status,
        requester: team.find((m) => m.id === t.requesterId)?.displayName ?? t.requesterId,
        managerApproved: t.managerApproved,
      })),
      // Training curriculum (so Merchiva can edit it by dayNumber / dayId)
      training: trainingDays.length === 0 ? undefined : {
        days: trainingDays.map((d) => ({
          id: d.id,
          dayNumber: d.dayNumber,
          title: d.title,
          excerpt: d.excerpt,
          objectives: trainingObjectives
            .filter((o) => sameId(o.dayId, d.id))
            .map((o) => ({ id: o.id, text: o.text, mediaType: o.mediaType })),
        })),
      },
    };
  }, [orgName, today, invItems, suppliers, shifts, team, salesHistory, salesHourly, products, rawNotifs, insights, staffRoles, roleTasks, shiftPresets, allAvailability, timeOffRequests, shiftTrades, trainingDays, trainingObjectives, orgSettings, locale]);

  // Scroll to bottom only when a new message (or a new tool step) is added
  const prevMsgCount = useRef(messages.length);
  const prevStepCount = useRef(0);
  useEffect(() => {
    const stepCount = messages.reduce((n, m) => n + (m.steps?.length ?? 0), 0);
    if ((messages.length > prevMsgCount.current || stepCount > prevStepCount.current) && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevMsgCount.current = messages.length;
    prevStepCount.current = stepCount;
  }, [messages]);

  const flushSummaryBuffer = useCallback(async (force?: boolean) => {
    if (!organizationId) return;
    const bufKey = `merchiva_memory_${organizationId}_buf`;
    const raw = localStorage.getItem(bufKey);
    const buf: Array<{ role: string; content: string }> = raw ? JSON.parse(raw) : [];
    if (buf.length === 0) return;
    if (!force && buf.length < 4) return;
    const mem = loadMemory(organizationId);
    localStorage.removeItem(bufKey);
    try {
      const token = (await getToken().catch(() => null)) || getStoredToken();
      const summarizePayload = { summarize: { prevSummary: mem.summary, newMessages: buf }, organizationId, token };
      logMerchivaSend("summarize", summarizePayload);
      const res = await fetch("/api/store-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(summarizePayload),
      });
      const data = await res.json();
      if (data.summary) {
        saveMemoryField(organizationId, "summary", data.summary);
        // Save summary to current session without archiving or clearing
        if (activeSessionId) {
          execSaveSession(activeSessionId, JSON.stringify(messages.slice(-50)), undefined, data.summary).catch(() => {});
        }
      }
    } catch {
      localStorage.setItem(bufKey, JSON.stringify(buf));
    }
  }, [organizationId, activeSessionId, messages, getToken]);

  const summaryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bufferAndMaybeSummarize = useCallback((userText: string, aiText: string) => {
    if (!organizationId) return;
    const bufKey = `merchiva_memory_${organizationId}_buf`;
    const raw = localStorage.getItem(bufKey);
    const buf: Array<{ role: string; content: string }> = raw ? JSON.parse(raw) : [];
    buf.push({ role: "user", content: userText }, { role: "assistant", content: aiText });
    localStorage.setItem(bufKey, JSON.stringify(buf));
    if (buf.length >= 4) {
      flushSummaryBuffer();
    } else {
      if (summaryTimerRef.current) clearTimeout(summaryTimerRef.current);
      summaryTimerRef.current = setTimeout(() => flushSummaryBuffer(true), 2 * 60 * 1000);
    }
  }, [organizationId, flushSummaryBuffer]);

  useEffect(() => {
    return () => { if (summaryTimerRef.current) clearTimeout(summaryTimerRef.current); };
  }, []);

  // ── Voice recording ──────────────────────────────────────────────────────
  const startVoice = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) {
      alert(t("merchiva.voiceUnsupported"));
      return;
    }
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = locale === "zh-tw" ? "zh-TW"
      : locale === "zh-hk" ? "zh-HK"
      : locale.startsWith("zh") ? "zh-CN"
      : locale === "es" ? "es-ES"
      : locale === "fr" ? "fr-FR"
      : locale === "ar" ? "ar-SA"
      : locale === "hi" ? "hi-IN"
      : "en-US";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) => r[0].transcript)
        .join("");
      setDraft(transcript);
    };
    recognition.onend = () => setRecording(false);
    recognition.onerror = () => setRecording(false);
    recognitionRef.current = recognition;
    recognition.start();
    setRecording(true);
  }, [locale, t]);

  const stopVoice = useCallback(() => {
    recognitionRef.current?.stop();
    setRecording(false);
  }, []);

  // ── File upload ─────────────────────────────────────────────────────────
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setAttachedFiles((prev) => [...prev, {
          name: file.name,
          url: base64,
          type: file.type.startsWith("image/") ? "image" : "file",
        }]);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  }, []);

  const removeFile = useCallback((idx: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  // ── @data mention ───────────────────────────────────────────────────────
  const toggleDataMention = useCallback((id: string) => {
    setAttachedData((prev) =>
      id === "all"
        ? prev.includes("all") ? [] : ["all"]
        : prev.includes(id)
          ? prev.filter((d) => d !== id)
          : [...prev.filter((d) => d !== "all"), id]
    );
  }, []);

  // ── Background job subscription ───────────────────────────────────────────
  // The /api/store-ai/enqueue endpoint creates ai_job rows that the server
  // streams chunks into. Subscribe here so partial text shows live and final
  // results get parsed + executed even if the user closed and reopened the tab.
  const aiJobsTuple = useAiJobs() as unknown;
  const aiJobRows = useMemo(() => tupleRows<AiJobRow>(aiJobsTuple), [aiJobsTuple]);
  const renderedJobIdsRef = useRef<Set<string>>(new Set());
  const finalizedJobIdsRef = useRef<Set<string>>(new Set());
  // Jobs whose tool calls move this chat's cursor (lib/merchiva/tool-focus.ts), and a tick that
  // re-checks them once one could have gone stale without its row changing.
  const followedJobIdsRef = useRef<Set<string>>(new Set());
  const [jobClock, setJobClock] = useState(0);
  const serverClockOffset = useServerClockOffset();
  // Bumped when the tab becomes visible again, so the notification-suppression
  // effect re-runs on return (notification rows may not change at that moment).
  const [visTick, setVisTick] = useState(0);
  useEffect(() => {
    function onVis() {
      if (document.visibilityState === "visible") setVisTick((v) => v + 1);
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (!organizationId || !activeSessionId) return;
    const myJobs = aiJobRows.filter((j) => j && j.organizationId === organizationId && j.sessionId === activeSessionId);
    // A followed job that left the table (or this session) will never report back here.
    const present = new Set(myJobs.map((j) => rowIdString(j.id)));
    const gone = releaseJobs(focusScope, followedJobIdsRef.current, [...followedJobIdsRef.current].filter((id) => !present.has(id)));
    if (gone.length > 0) setMessages((prev) => gone.reduce((acc, id) => withSettledSteps(acc, `job-${id}`), prev));
    if (myJobs.length === 0) return;

    const serverNow = Date.now() + serverClockOffset;
    let recheckInMs = Number.POSITIVE_INFINITY;
    for (const job of myJobs) {
      const jobId = rowIdString(job.id);
      // Already finalized by some earlier session — the durable marker. If this chat was following
      // it, another window finished it: stop following it here too.
      if (job.consumed === true) {
        if (releaseJobs(focusScope, followedJobIdsRef.current, [jobId]).length > 0) {
          setMessages((prev) => withSettledSteps(prev, `job-${jobId}`));
        }
        continue;
      }
      const msgId = `job-${jobId}`;
      const isDone = job.status === "done" || job.status === "failed";

      // 1) New job → seed a placeholder merchiva message and clear the
      //    sending spinner. The upstream userMsg was already inserted in
      //    sendMessage(); the placeholder belongs immediately after it.
      if (!renderedJobIdsRef.current.has(jobId)) {
        renderedJobIdsRef.current.add(jobId);
        setSending(false);
        setThinkingPhase("");
        setMessages((prev) => {
          if (prev.some((m) => m.id === msgId)) return prev;
          const now = new Date().toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
          const additions: ChatMessage[] = [];
          // If the user closed the tab before the message-save debounce fired,
          // the session reloads without their question — but the job row still
          // carries the original prompt. Re-seed it so the thread isn't an
          // orphaned answer. Skip when the thread already ends with a user turn
          // (the normal same-session flow, where sendMessage just appended it).
          const last = prev[prev.length - 1];
          const promptText = typeof job.prompt === "string" ? job.prompt.trim() : "";
          if (promptText && (!last || last.from !== "user")) {
            additions.push({ id: `jobq-${jobId}`, from: "user", text: promptText, time: now });
          }
          additions.push({ id: msgId, from: "merchiva", text: "", time: now });
          return [...prev, ...additions];
        });
      }

      // 2) Live partial text — peel the ack into its own bubble, strip action
      //    JSON from the remainder for display.
      if (!isDone) {
        const { ack, rest: afterAck } = splitAck(String(job.partialText ?? ""));
        const { events, text: rest } = splitToolEvents(afterAck);
        // A job that stopped writing is dead: its calls will never report back, so its steps settle
        // and its frames no longer move the cursor. Until then, check again once it could be.
        const staleInMs = jobStaleInMs(timestampMicros(job.updatedAt) / 1000, serverNow);
        const stale = staleInMs <= 0;
        if (stale) {
          releaseJobs(focusScope, followedJobIdsRef.current, [jobId]);
        } else {
          followJobFrames(focusScope, followedJobIdsRef.current, focusedToolIds.current, jobId, events);
          recheckInMs = Math.min(recheckInMs, staleInMs);
        }
        const ackMsgId = `ack-${msgId}`;
        const visible = extractActionBlocks(rest).cleanText;
        const restLen = rest.length;
        const display = visible || (restLen > 0 ? "..." : "");
        setMessages((prev) => {
          let next = prev;
          // Insert the ack bubble right before the job bubble, once.
          if (ack && !next.some((m) => m.id === ackMsgId)) {
            const idx = next.findIndex((m) => m.id === msgId);
            const ackMsg = {
              id: ackMsgId,
              from: "merchiva" as const,
              text: ack,
              time: new Date().toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }),
            };
            next = idx === -1
              ? [...next, ackMsg]
              : [...next.slice(0, idx), ackMsg, ...next.slice(idx)];
          } else if (ack) {
            next = next.map((m) => (m.id === ackMsgId ? { ...m, text: ack } : m));
          }
          next = withToolEvents(next.map((m) => (m.id === msgId ? { ...m, text: display } : m)), msgId, events);
          return stale ? withSettledSteps(next, msgId) : next;
        });
        continue;
      }

      // 3) Done / failed — finalize once.
      if (finalizedJobIdsRef.current.has(jobId)) continue;
      finalizedJobIdsRef.current.add(jobId);
      // Every branch below ends the cursor itself.
      followedJobIdsRef.current.delete(jobId);

      if (job.status === "failed") {
        setMessages((prev) => prev.map((m) => (
          m.id === msgId
            ? { ...m, text: t("merchiva.errorNoResponse") + (job.error ? ` (${String(job.error).slice(0, 200)})` : ""), steps: settleSteps(m.steps) }
            : m
        )));
        finishAiFocus(focusScope);
        consumeAiJob(jobId).catch(() => {});
        continue;
      }

      const rawFinal = String(job.finalText ?? job.partialText ?? "");
      const { ack: finalAck, rest: finalRest } = splitAck(rawFinal);
      const { events: finalEvents, text: finalText } = splitToolEvents(finalRest);
      focusToolStarts(focusScope, focusedToolIds.current, finalEvents);
      // Pin the ack into its own bubble (insert if it wasn't already created
      // during streaming).
      if (finalAck) {
        const ackMsgId = `ack-${msgId}`;
        setMessages((prev) => {
          if (prev.some((m) => m.id === ackMsgId)) {
            return prev.map((m) => (m.id === ackMsgId ? { ...m, text: finalAck } : m));
          }
          const idx = prev.findIndex((m) => m.id === msgId);
          const ackMsg = {
            id: ackMsgId,
            from: "merchiva" as const,
            text: finalAck,
            time: new Date().toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }),
          };
          return idx === -1 ? [...prev, ackMsg] : [...prev.slice(0, idx), ackMsg, ...prev.slice(idx)];
        });
      }
      if (!finalText.trim() && finalEvents.length === 0) {
        // No substantive body beyond the ack — drop the empty job bubble.
        setMessages((prev) => prev.filter((m) => m.id !== msgId));
        finishAiFocus(focusScope);
        consumeAiJob(jobId).catch(() => {});
        continue;
      }

      const parsed = parseAllSkills(finalText);
      finishReplyFocus(focusScope, parsed);
      const fallbackAction = parsed.actions.length === 0
        ? buildSupplierRestockFallbackAction(String(job.prompt ?? ""), invItems, suppliers)
        : null;
      const parsedActions: PendingAction[] = fallbackAction
        ? [{ id: `fallback-${Date.now()}`, action: fallbackAction, status: "pending" as const }]
        : parsed.actions;
      if (organizationId && parsed.memoryUpdates.length > 0) {
        for (const update of parsed.memoryUpdates) saveMemoryField(organizationId, update.field, update.value);
      }
      const hasStructured = parsedActions.length > 0 || parsed.rolesAdd.length > 0 ||
        parsed.tasksAdd.length > 0 || parsed.tasksDelete.length > 0 || parsed.questions.length > 0 || parsed.actionsList;
      const displayText = parsed.cleanText || (
        parsed.actionsList && parsed.actions.length === 0
          ? t("merchiva.actionsAvailable")
          : fallbackAction ? tx("merchiva.supplierOrderPrepared", "Prepared a supplier order for approval.")
          : hasStructured ? "" : finalText.trim()
      );
      setMessages((prev) => prev.map((m) => (
        m.id === msgId
          ? finishJobMessage(m, {
              from: parsed.actionsList && parsed.actions.length === 0 ? "system" : m.from,
              text: displayText,
              actions: parsedActions.length > 0 ? decorateActions(parsedActions) : undefined,
              actionsList: parsed.actionsList || undefined,
              questions: parsed.questions.length > 0 ? parsed.questions : undefined,
              rolesAdd: parsed.rolesAdd.length > 0 ? parsed.rolesAdd : undefined,
              rolesList: parsed.rolesList || undefined,
              tasksAdd: parsed.tasksAdd.length > 0 ? parsed.tasksAdd : undefined,
              tasksDelete: pinDeletes(parsed.tasksDelete),
              tasksList: parsed.tasksList || undefined,
              steps: settleSteps(applyToolEvents(m.steps, finalEvents)),
            })
          : m
      )));
      // Fire-and-forget: mark consumed so we don't re-process on next render
      // (and so other tabs don't double-execute the same actions).
      consumeAiJob(jobId).catch(() => {});
      // House-keeping: drop fully-consumed rows after a delay so the table
      // doesn't grow unbounded. Failures here are non-fatal.
      setTimeout(() => { deleteAiJob(jobId).catch(() => {}); }, 60_000);
    }
    if (recheckInMs === Number.POSITIVE_INFINITY) return;
    const recheck = setTimeout(() => setJobClock((tick) => tick + 1), recheckInMs + 1000);
    return () => clearTimeout(recheck);
  }, [aiJobRows, organizationId, activeSessionId, locale, t, tx, invItems, suppliers, decorateActions, pinDeletes, focusScope, serverClockOffset, jobClock]);

  // Suppress the "Mr. Merchiva replied" bell entry while the user is actively
  // looking at this chat. Those notifications are fired server-side on every
  // backgrounded reply so users who LEFT get pinged; if they're here watching
  // the reply stream in, clear the matching unread one (keyed by session id in
  // the link) so the bell doesn't show a redundant badge.
  useEffect(() => {
    if (!active || !organizationId || !activeSessionId) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const marker = `mvsession=${encodeURIComponent(activeSessionId)}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = Array.isArray(rawNotifs) ? rawNotifs : [];
    for (const n of rows) {
      if (n && !n.read && typeof n.link === "string" && n.link.includes(marker)) {
        markNotificationRead(n.id.toString()).catch(() => {});
      }
    }
  }, [active, rawNotifs, organizationId, activeSessionId, visTick]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || sending) return;

    // Client-side: intercept local list/delete commands
    const parsed = parseAllSkills(text);
    if (parsed.actionsList && !parsed.actions.length && !parsed.tasksAdd.length && !parsed.rolesAdd.length && !parsed.tasksDelete.length) {
      const userMsg: ChatMessage = {
        id: msgId("u"),
        from: "user",
        text: text.trim(),
        time: new Date().toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }),
      };
      const aiMsg: ChatMessage = {
        id: msgId("a"),
        from: "system",
        text: parsed.cleanText || t("merchiva.actionsAvailable"),
        time: new Date().toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }),
        actionsList: true,
      };
      setMessages((prev) => [...prev, userMsg, aiMsg]);
      setDraft("");
      return;
    }
    if (parsed.tasksDelete.length > 0 && !parsed.tasksAdd.length && !parsed.rolesAdd.length && !parsed.actions.length) {
      const userMsg: ChatMessage = {
        id: msgId("u"),
        from: "user",
        text: text.trim(),
        time: new Date().toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }),
      };
      const aiMsg: ChatMessage = {
        id: msgId("a"),
        from: "merchiva",
        text: parsed.cleanText || "",
        time: new Date().toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }),
        tasksDelete: pinDeletes(parsed.tasksDelete),
        fromCommand: true,
      };
      setMessages((prev) => [...prev, userMsg, aiMsg]);
      setDraft("");
      return;
    }

    // Build prefix for attached data context
    const dataPrefix = attachedData.length > 0
      ? `[Context: user attached @${attachedData.join(", @")} data]\n`
      : "";
    const filePrefix = attachedFiles.length > 0
      ? `[User attached ${attachedFiles.length} file(s): ${attachedFiles.map((f) => f.name).join(", ")}]\n`
      : "";
    const fullText = `${dataPrefix}${filePrefix}${text.trim()}`;

    const displayParts: string[] = [];
    if (attachedData.length > 0) displayParts.push(`@${attachedData.join(" @")}`);
    if (attachedFiles.length > 0) displayParts.push(`📎 ${attachedFiles.map((f) => f.name).join(", ")}`);
    const displayText = displayParts.length > 0
      ? `${text.trim()}\n${displayParts.join(" · ")}`
      : text.trim();

    const userMsg: ChatMessage = {
      id: msgId("u"),
      from: "user",
      text: displayText,
      time: new Date().toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }),
    };
    setMessages((prev) => [...prev, userMsg]);
    setDraft("");
    setAttachedData([]);
    setAttachedFiles([]);
    setDataMentionOpen(false);
    setSending(true);
    setThinkingPhase(getThinkingLabel(text, "analyze", t));

    try {
      const last10 = expandHistoryFromMessages(messages, refsRef.current.rows.roles ?? []).slice(-10);

      const mem = organizationId ? loadMemory(organizationId) : { summary: "", storeOverview: "", userPreferences: "" };
      const mcpServers = organizationId
        ? loadStoredMcpServers(organizationId).filter((server) => server.enabled)
        : [];
      const mcpPayload = mcpServers.length > 0 ? { mcpServers } : {};
      // The page this chat's own tab shows, so "this week" / "him" need no question.
      const page = currentPagePayload(focusScope, t);

      setThinkingPhase(getThinkingLabel(text, "fetch", t));

      // ── Background path: enqueue server-side so the AI keeps generating
      // even if the user closes the tab. The reducer creates an ai_job row;
      // the subscription effect below picks it up, renders partialText as it
      // streams, and runs parsed actions when the row flips to status='done'.
      // If the SpacetimeDB module hasn't been republished with the AI-job
      // reducers yet, the route returns 501 once and we stay on streaming for
      // the rest of the session — no need to keep hammering the endpoint.
      // Prefer the WorkOS access token (auto-refreshed via getToken) over the
      // SpacetimeDB-issued stdb_token, which expires and can't be refreshed
      // from the background HTTP RPC path — that caused "ExpiredSignature" 401s
      // on createAiJob. Fall back to the stored token if WorkOS has none.
      const token = (await getToken().catch(() => null)) || getStoredToken();
      if (token && organizationId && activeSessionId && !enqueueDisabledRef.current) {
        try {
          const enqueuePayload = {
            token,
            organizationId,
            sessionId: activeSessionId,
            message: fullText,
            history: last10,
            context: storeContext,
            page,
            lang: locale,
            memory: {
              summary: mem.summary || undefined,
              storeOverview: mem.storeOverview || undefined,
              userPreferences: mem.userPreferences || undefined,
            },
            ...mcpPayload,
            permissions: {
              isOwner,
              role: orgRole,
              sections: Object.fromEntries(
                Object.entries(userPermissions).map(([k, v]) => [k, { view: v?.view, edit: v?.edit }])
              ),
            },
          };
          logMerchivaSend("enqueue (background job)", enqueuePayload);
          const enq = await fetch("/api/store-ai/enqueue", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(enqueuePayload),
          });
          if (enq.ok) {
            // Sending state is cleared by the subscription effect when the new
            // job appears. No streaming reader needed — the row is the source
            // of truth from here.
            setThinkingPhase("");
            return;
          }
          // 501 with code: "reducer_missing" — server-side ai_job reducer isn't
          // deployed. Disable enqueue for this session and silently fall back.
          if (enq.status === 501) {
            enqueueDisabledRef.current = true;
            console.info("[Mr. Merchiva] background enqueue unavailable (module not yet republished); using streaming path.");
          } else {
            const e = await enq.text().catch(() => "");
            console.warn("[Mr. Merchiva] enqueue returned", enq.status, "— falling back to streaming:", e);
          }
        } catch (err) {
          console.warn("[Mr. Merchiva] enqueue request failed — falling back to streaming:", err);
        }
      }

      // ── Legacy streaming fallback (when no token / not in a session) ──
      const streamPayload = {
        token,
        message: fullText,
        history: last10,
        context: storeContext,
        page,
        organizationId,
        lang: locale,
        stream: true,
        events: true,
        memory: {
          summary: mem.summary || undefined,
          storeOverview: mem.storeOverview || undefined,
          userPreferences: mem.userPreferences || undefined,
        },
        permissions: {
          isOwner,
          role: orgRole,
          sections: Object.fromEntries(
            Object.entries(userPermissions).map(([k, v]) => [k, { view: v?.view, edit: v?.edit }])
          ),
        },
        ...mcpPayload,
      };
      logMerchivaSend("stream", streamPayload);
      const res = await fetch("/api/store-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(streamPayload),
      });

      // Decode a base64-UTF8 response header (kaomoji + ack live there because
      // the body stream gets buffered by the Node.js HTTP layer in dev, which
      // hides any leading body sentinel until the whole reply finishes).
      const decodeB64Header = (name: string): string => {
        const b64 = res.headers.get(name);
        if (!b64) return "";
        try {
          const bin = atob(b64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          return new TextDecoder("utf-8").decode(bytes);
        } catch (err) {
          console.warn(`[Mr. Merchiva] ${name} header decode failed:`, err);
          return "";
        }
      };

      const kaomojiHeader = decodeB64Header("X-Merchiva-Kaomoji");
      if (kaomojiHeader) {
        window.dispatchEvent(
          new CustomEvent("merchiva:set-kaomoji", { detail: kaomojiHeader }),
        );
      }

      const streamMsgId = msgId("a");
      const streamTime = new Date().toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
      const ackMsgIdEarly = `ack-${streamMsgId}`;

      // Ack-from-header path: as soon as the response status line arrives we
      // already know the triage message — render the bubble immediately so the
      // user sees "好的，我先看一下…" without waiting on the body.
      const ackFromHeader = decodeB64Header("X-Merchiva-Ack");
      if (ackFromHeader) {
        setMessages((prev) => [...prev, {
          id: ackMsgIdEarly,
          from: "merchiva" as const,
          text: ackFromHeader,
          time: streamTime,
        }]);
      }

      if (!res.ok || !res.body) {
        const errBody = !res.body ? "no body" : await res.text();
        console.error("[Mr. Merchiva] Stream failed:", res.status, errBody);
        throw new Error("Stream unavailable");
      }

      // Body-sentinel fallback: if the X-Merchiva-Ack header didn't arrive
      // (proxies that strip custom headers, future transport changes), the
      // [[MERCHIVA_ACK]] sentinel at the front of the body still works.
      // Reuses the same ack message id so we never end up with two bubbles.
      const ackMsgId = ackMsgIdEarly;
      let ackInserted = Boolean(ackFromHeader);

      // Add the streaming placeholder. The ack bubble is inserted lazily once
      // the sentinel is detected in the stream.
      setMessages((prev) => [...prev, {
        id: streamMsgId,
        from: "merchiva" as const,
        text: "",
        time: streamTime,
      }]);
      setThinkingPhase("");

      // Read text stream from AI SDK (plain text chunks)
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullReply = "";

      // We intentionally do NOT update the main streaming bubble per chunk —
      // the user asked to drop the token-by-token flicker. The ack bubble
      // (triage's "ok, I'll check…" preamble) is inserted from the header
      // above (or peeled from the body sentinel here as a fallback), so they
      // see Mr. Merchiva acknowledged them. The main reply stays hidden behind
      // the bottom "thinking" spinner until the stream finishes, then drops
      // in as one complete bubble below.
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (chunk) {
            fullReply += chunk;
            const { ack, rest: afterAck } = splitAck(fullReply);
            const { events } = splitToolEvents(afterAck);
            focusToolStarts(focusScope, focusedToolIds.current, events);
            if (events.length > 0) setMessages((prev) => withToolEvents(prev, streamMsgId, events));
            if (ack) {
              setMessages((prev) => {
                if (ackInserted) {
                  return prev.map((m) => (m.id === ackMsgId ? { ...m, text: ack } : m));
                }
                // Insert the ack bubble right before the (still-empty) main
                // placeholder so chronological order is preserved.
                const idx = prev.findIndex((m) => m.id === streamMsgId);
                const ackMsg = {
                  id: ackMsgId,
                  from: "merchiva" as const,
                  text: ack,
                  time: streamTime,
                };
                return idx === -1
                  ? [...prev, ackMsg]
                  : [...prev.slice(0, idx), ackMsg, ...prev.slice(idx)];
              });
              ackInserted = true;
            }
          }
        }
      } catch (streamErr) {
        console.warn("[Mr. Merchiva] Stream read error:", streamErr);
      }
      // The stream is over: a tool call that never reported back is not going to now.
      setMessages((prev) => withSettledSteps(prev, streamMsgId));
      finishAiFocus(focusScope);

      // Strip the ack sentinel and the tool-call frames from the body used for action parsing + finalize.
      let reply = splitToolEvents(splitAck(fullReply).rest).text;

      // Fallback: if stream returned nothing, retry non-streaming
      if (!reply.trim()) {
        console.log("[Mr. Merchiva] Stream empty, retrying non-streaming...");
        setMessages((prev) => prev.map((m) =>
          m.id === streamMsgId ? { ...m, text: "..." } : m
        ));
        try {
          const fallbackPayload = {
            token,
            message: fullText,
            history: last10,
            context: storeContext,
            page,
            organizationId,
            lang: locale,
            memory: {
              summary: mem.summary || undefined,
              storeOverview: mem.storeOverview || undefined,
              userPreferences: mem.userPreferences || undefined,
            },
            permissions: {
              isOwner,
              role: orgRole,
              sections: Object.fromEntries(
                Object.entries(userPermissions).map(([k, v]) => [k, { view: v?.view, edit: v?.edit }])
              ),
            },
            ...mcpPayload,
          };
          logMerchivaSend("non-stream fallback", fallbackPayload);
          const fallbackRes = await fetch("/api/store-ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(fallbackPayload),
          });
          const fallbackData = await fallbackRes.json();
          if (!fallbackRes.ok) {
            console.error("[Mr. Merchiva] API error:", fallbackRes.status, fallbackData);
          }
          reply = fallbackData.reply ?? "";
        } catch (fallbackErr) {
          console.error("[Mr. Merchiva] Fallback failed:", fallbackErr);
        }
      }

      if (!reply.trim()) {
        setMessages((prev) => prev.map((m) =>
          m.id === streamMsgId ? { ...m, text: t("merchiva.errorNoResponse") } : m
        ));
        setSending(false);
        setThinkingPhase("");
        return;
      }

      setThinkingPhase(getThinkingLabel(text, "process", t));
      const parsed = parseAllSkills(reply);
      finishReplyFocus(focusScope, parsed);
      const fallbackAction = parsed.actions.length === 0
        ? buildSupplierRestockFallbackAction(fullText, invItems, suppliers)
        : null;
      const parsedActions: PendingAction[] = fallbackAction
        ? [{ id: `fallback-${Date.now()}`, action: fallbackAction, status: "pending" as const }]
        : parsed.actions;
      console.log("[Mr. Merchiva] Parsed:", { actions: parsed.actions.length, actionsList: parsed.actionsList, tasks: parsed.tasksAdd.length, deletes: parsed.tasksDelete.length, roles: parsed.rolesAdd.length, questions: parsed.questions.length });

      // Handle memory update commands from AI
      if (organizationId && parsed.memoryUpdates.length > 0) {
        for (const update of parsed.memoryUpdates) {
          saveMemoryField(organizationId, update.field, update.value);
        }
      }

      // If AI response was only commands/actions with no visible text,
      // show the raw reply so user can see what AI said
      const hasStructured = parsedActions.length > 0 || parsed.rolesAdd.length > 0 ||
        parsed.tasksAdd.length > 0 || parsed.tasksDelete.length > 0 || parsed.questions.length > 0 ||
        parsed.actionsList;
      const displayText = parsed.cleanText || (
        parsed.actionsList && parsed.actions.length === 0
          ? t("merchiva.actionsAvailable")
          : fallbackAction ? tx("merchiva.supplierOrderPrepared", "Prepared a supplier order for approval.")
          : hasStructured ? "" : reply.trim()
      );

      // Finalize message with parsed commands
      setMessages((prev) => prev.map((m) =>
        m.id === streamMsgId ? {
          ...m,
          from: parsed.actionsList && parsed.actions.length === 0 ? "system" : m.from,
          text: displayText,
          actions: parsedActions.length > 0 ? decorateActions(parsedActions) : undefined,
          actionsList: parsed.actionsList || undefined,
          questions: parsed.questions.length > 0 ? parsed.questions : undefined,
          rolesAdd: parsed.rolesAdd.length > 0 ? parsed.rolesAdd : undefined,
          rolesList: parsed.rolesList || undefined,
          tasksAdd: parsed.tasksAdd.length > 0 ? parsed.tasksAdd : undefined,
          tasksDelete: pinDeletes(parsed.tasksDelete),
          tasksList: parsed.tasksList || undefined,
        } : m
      ));

      // Auto-title session from first user message
      if (activeSessionId && messages.length <= 2) {
        const title = text.trim().slice(0, 30) || t("merchiva.chatTitle");
        execSaveSession(activeSessionId, JSON.stringify(messages.slice(-50)), title).catch(() => {});
      }

      // Background: summarize conversational turns, not system catalog output.
      if (!parsed.actionsList) bufferAndMaybeSummarize(text.trim(), parsed.cleanText);
    } catch {
      setMessages((prev) => [...prev, {
        id: msgId("e"),
        from: "merchiva",
        text: t("merchiva.errorNoResponse"),
        time: new Date().toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }),
      }]);
    } finally {
      setSending(false);
      setThinkingPhase("");
    }
  }, [sending, messages, storeContext, organizationId, bufferAndMaybeSummarize, attachedData, attachedFiles, isOwner, orgRole, userPermissions, locale, t, tx, activeSessionId, invItems, suppliers, decorateActions, pinDeletes, getToken, focusScope]);

  const handleApprove = useCallback(async (msgId: string, actionId: string) => {
    // Read action data from current messages state BEFORE updating
    const msg = messages.find((m) => m.id === msgId);
    const actionData = msg?.actions?.find((a) => a.id === actionId)?.action;

    if (!actionData) {
      console.error("[Approve] Action not found:", msgId, actionId);
      return;
    }

    console.log("[Approve] Executing:", actionData);

    const refNow = refsRef.current;
    if (actionData.action === "addShift") {
      // The person: the model's memberId first (team, then placeholder staff,
      // which the reducer also takes), else the display name, case-insensitively.
      const activeTeam = (refNow.rows.members ?? []).filter((m) => m.status === "active");
      const staff = resolveShiftStaff(actionData, activeTeam, refNow.rows.placeholders ?? []);
      if (!staff) {
        const validNames = activeTeam.map((m) => String(m.displayName ?? ""));
        toast.error(
          t("merchiva.approve.notTeamMember")
            .replace("{name}", String(actionData.staffName ?? "") || t("merchiva.refs.unknown"))
            .replace("{names}", validNames.join(", ") || t("merchiva.approve.noTeamMembers")),
        );
        return;
      }
      actionData.memberId = staff.memberId;
      actionData.staffName = staff.name;

      // Validate staffRoles against the live staff_role table. The AI often
      // emits the shift TYPE ("morning") or the permission role ("manager") in
      // staffRoles, which the addShift reducer rejects — surfacing to the user
      // as the opaque "InternalError: instance encountered a fatal error" from
      // SpacetimeDB. Catch it here with a real message so the user knows what
      // to fix. Each entry may be a role name or a role id; the shift stores names.
      const storeRoles = refNow.rows.roles ?? [];
      const { entries, names } = resolveShiftRoles(actionData.staffRoles, storeRoles);
      if (names.length === 0) {
        const validList = storeRoles.map((r) => String(r.name ?? "")).filter(Boolean).join(", ") || t("merchiva.approve.noRolesDefined");
        toast.error(
          t("merchiva.approve.noValidRole")
            .replace("{got}", JSON.stringify(entries.map((e) => e.shown ?? t("merchiva.refs.unknownRole"))))
            .replace("{roles}", validList),
        );
        return;
      }
      actionData.staffRoles = names;
    }

    // Mark as approved optimistically
    setMessages((prev) => prev.map((m) => {
      if (m.id !== msgId) return m;
      return {
        ...m,
        actions: m.actions?.map((a) =>
          a.id === actionId ? { ...a, status: "approved" as const } : a
        ),
      };
    }));

    // Snapshot the state needed to undo this, taken BEFORE the write lands.
    // Stored in a ref (not message state) so the later Undo can reverse it.
    const actionName = String(actionData.action ?? "");
    const snapshot = captureUndoSnapshot(actionName, actionData as Record<string, unknown>);
    // Named before it runs: a delete removes the row its id names.
    const target = actionTarget(actionData, refNow, { day: (n) => t("merchiva.refs.day").replace("{n}", String(n)) });

    try {
      focusAction(focusScope, actionName);
      await executeAction(actionData, {
        success: (params) => actionSuccessText(t, params, target),
        failure: (err) => actionFailureText(t, err),
      });
      console.log("[Approve] Success:", actionData.action);
      if (snapshot) undoSnapshots.current.set(actionId, snapshot);
    } catch (err) {
      console.error("[Approve] Failed:", err);
      undoSnapshots.current.delete(actionId);
      // Revert to pending on failure
      setMessages((prev) => prev.map((m) => {
        if (m.id !== msgId) return m;
        return {
          ...m,
          actions: m.actions?.map((a) =>
            a.id === actionId ? { ...a, status: "pending" as const } : a
          ),
        };
      }));
    }
    finishAiFocus(focusScope);
  }, [messages, t, focusScope]);

  // Reject serves two roles:
  //   • declining a still-pending proposal → just mark it rejected (no write ran)
  //   • undoing an already-executed action → run the real inverse, then mark it
  const handleReject = useCallback(async (msgId: string, actionId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    const pa = msg?.actions?.find((a) => a.id === actionId);
    const wasExecuted = pa?.status === "approved";

    if (wasExecuted) {
      const snapshot = undoSnapshots.current.get(actionId);
      const inverse = snapshot
        ? buildInverse((pa?.action ?? {}) as Record<string, unknown>, snapshot)
        : null;
      if (!inverse) {
        toast.error(tx("merchiva.ui.cannotUndo", "This action can't be undone."));
        return;
      }
      try {
        await inverse.run();
        undoSnapshots.current.delete(actionId);
        toast.success(tx("merchiva.ui.undoneToast", "Undone."));
      } catch (err) {
        console.error("[Undo] Failed:", err);
        toast.error(tx("merchiva.ui.undoFailed", "Couldn't undo — please review manually."));
        return; // keep it marked executed; the write is still live
      }
    }

    setMessages((prev) => prev.map((m) => {
      if (m.id !== msgId) return m;
      return {
        ...m,
        actions: m.actions?.map((a) =>
          a.id === actionId ? { ...a, status: "rejected" as const } : a
        ),
      };
    }));
  }, [messages, tx]);

  // Context-menu actions on chat bubbles. We don't persist on copy because no
  // state changes; delete/re-ask both mutate the message list and rely on the
  // existing autosave effect (lines ~2190) to push the updated history to
  // SpacetimeDB. Re-ask resends the original user prompt, which produces a
  // fresh AI reply rather than mutating the old one in place.
  const handleCopyMessage = useCallback((text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(
      () => toast.success(t("merchiva.menuCopied")),
      () => toast.error(t("merchiva.errorNoResponse")),
    );
  }, [t]);

  const handleDeleteMessage = useCallback((msgId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
  }, []);

  const handleReAsk = useCallback((msgId: string) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === msgId);
      if (idx === -1) return prev;
      const target = prev[idx];
      // For an AI message, walk back to the most recent user message — that's
      // the prompt we want to re-run. For a user message, re-send it directly.
      let userText = "";
      if (target.from === "user") {
        userText = target.text;
      } else {
        for (let i = idx - 1; i >= 0; i--) {
          if (prev[i].from === "user") { userText = prev[i].text; break; }
        }
      }
      if (!userText.trim()) return prev;
      // Fire the resend after this state update so sendMessage sees a fresh
      // ref to setMessages. queueMicrotask keeps us in the same paint frame.
      queueMicrotask(() => { sendMessage(userText); });
      return prev;
    });
  }, [sendMessage]);

  const quickChips = useMemo(() => {
    const chips: string[] = [];

    // Context-aware chips based on pending requests
    const pendingTimeOff = timeOffRequests.filter((r) => r.status === "pending").length;
    const pendingTrades = shiftTrades.filter((t) => t.status === "pending").length;

    if (pendingTimeOff > 0) {
      chips.push(t("merchiva.quickChips.pendingTimeOff").replace("{n}", String(pendingTimeOff)));
    }
    if (pendingTrades > 0) {
      chips.push(t("merchiva.quickChips.pendingTrades").replace("{n}", String(pendingTrades)));
    }

    chips.push(t("merchiva.quickChips.scheduleNextWeek"));
    chips.push(t("merchiva.quickChips.coverSaturday"));

    if (staffRoles.length === 0) {
      chips.push(t("merchiva.quickChips.createFirstRole"));
    } else {
      chips.push(t("merchiva.quickChips.manageRoles"));
    }

    chips.push(t("merchiva.quickChips.salesSummary"));
    chips.push(t("merchiva.quickChips.inventoryAlerts"));

    return chips.slice(0, 5);
  }, [timeOffRequests, shiftTrades, staffRoles, t]);

  const todayStr = new Date().toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" }).toLowerCase();

  return (
    <section className={cn(
      "@container bg-background overflow-hidden flex flex-col min-h-0 h-full flex-1",
      compact ? "h-full" : "rounded-lg border border-border"
    )}>
      {/* Header */}
      {header &&(
        <header className={cn(
          "border-b border-border flex items-center gap-3 shrink-0",
          compact ? "px-4 py-2.5" : "px-5 py-3"
        )} style={{ background: M_ACC_SOFT }}>
          <NotchM size={compact ? 28 : 36} fg={M_ACC_SOFT} bg="#1c1917" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn(compact ? "text-[13px]" : "text-[15px]", "font-semibold tracking-tight")}>{t("merchiva.name")}</span>
              <span className="inline-flex items-center gap-1 ml-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <Eyebrow as="span" size="xs" className="text-emerald-600 dark:text-emerald-400">{t("merchiva.online")}</Eyebrow>
              </span>
            </div>
            {!compact && (
              <div className="text-[11.5px] text-muted-foreground mt-0.5">
                {t("merchiva.opsAgent").replace("{orgName}", orgName)}
              </div>
            )}
          </div>
          {!compact && (
            <Button variant="outline" size="icon" onClick={handleClearHistory} title={t("merchiva.clearHistory")}
              style={{ borderColor: M_ACC_BD }}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </header>
      )

      }

      {/* Thread — wrapper provides positioning context for the watermark
          backdrop that sits behind the scroll area. */}
      <div className="relative flex-1 flex flex-col min-h-0">
        <MerchivaWatermark />
        <div ref={scrollRef} className={cn(
          "relative z-10 flex-1 overflow-auto scroll-smooth flex flex-col gap-5 min-h-0",
          compact ? "px-4 py-3 gap-3" : "px-6 py-5"
        )}>
        <ChatRow from="system">{t("merchiva.today")} · {todayStr}</ChatRow>

        {/* Auto-generated insights (skip in compact mode) */}
        {!compact && (
          <ChatRow time="06:14">
            <div className="text-[14px] text-foreground leading-[1.55] max-w-[680px]">
              {headline}
            </div>
          </ChatRow>
        )}

        {!compact && insights.map((insight, idx) => (
          <ChatRow key={insight.id} time={`06:${14 + idx}`}>
            {insight.type === "watchlist" ? (
              <Bubble>
                <div className="flex items-center gap-2">
                  <span className="h-6 px-2 rounded inline-flex items-center gap-1.5 bg-muted border border-border text-muted-foreground">
                    {INSIGHT_ICONS[insight.type]}
                    <span className="font-mono text-[10px] tracking-[0.08em] uppercase font-semibold">{insight.type}</span>
                  </span>
                  <span className="text-[13.5px] font-medium ml-1">{insight.title}</span>
                </div>
                <InsightEmbed insight={insight} />
              </Bubble>
            ) : (
              <InsightCard
                pill={insight.type.toUpperCase()}
                icon={INSIGHT_ICONS[insight.type] ?? <Package className="h-[11px] w-[11px]" />}
                title={insight.title}
                body={insight.body}
                confidence={insight.confidence}
                primary={insight.primaryAction ?? { label: t("merchiva.insight.view") }}
                secondary={insight.secondaryAction ?? t("merchiva.insight.dismiss")}
                reasoning={insight.reasoning}
                embed={<InsightEmbed insight={insight} />}
              />
            )}
          </ChatRow>
        ))}

        {/* User/AI conversation messages */}
        {messages.map((msg) => {
          // Wrap any rendered bubble in a context menu so right-click on
          // desktop and long-press on touch surface Copy / Re-ask / Delete.
          // The menu items adapt to the role: user messages get "Re-ask",
          // AI replies get "Regenerate", system rows skip both.
          const renderMenu = (child: React.ReactNode) => (
            <ContextMenu key={msg.id}>
              <ContextMenuTrigger>{child}</ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onClick={() => handleCopyMessage(msg.text)}>
                  <Copy /> {t("merchiva.menuCopy")}
                </ContextMenuItem>
                {msg.from === "user" && (
                  <ContextMenuItem onClick={() => handleReAsk(msg.id)}>
                    <RotateCcw /> {t("merchiva.menuReAsk")}
                  </ContextMenuItem>
                )}
                {msg.from === "merchiva" && (
                  <ContextMenuItem onClick={() => handleReAsk(msg.id)}>
                    <RotateCcw /> {t("merchiva.menuRegenerate")}
                  </ContextMenuItem>
                )}
                <ContextMenuSeparator />
                <ContextMenuItem
                  variant="destructive"
                  onClick={() => handleDeleteMessage(msg.id)}
                >
                  <Trash2 /> {t("merchiva.menuDelete")}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );

          if (msg.from === "voice-call") {
            return renderMenu(<VoiceCallRow message={msg} />);
          }
          if (msg.from === "system") {
            return renderMenu(msg.actionsList ? (
              <div className="mx-auto w-full max-w-[680px]">
                <ChatRow from="system">{msg.text}</ChatRow>
                <ActionsListCard />
              </div>
            ) : (
              <ChatRow from="system">{msg.text}</ChatRow>
            ));
          }
          if (msg.from === "user") {
            return renderMenu(
              <div className="flex justify-end">
                <div className="max-w-[480px] rounded-lg bg-foreground text-background px-4 py-3">
                  <div className="text-[14px] leading-[1.5] whitespace-pre-wrap">{msg.text}</div>
                  <div className="text-[10px] text-background/50 mt-1 text-right font-mono">{msg.time}</div>
                </div>
              </div>
            );
          }
          // While the main reply is still streaming, the placeholder bubble
          // has empty text and no actions/lists. Skip rendering it so the user
          // only sees the ack bubble + the bottom "thinking" spinner — the
          // full bubble appears once on finalize. Tool steps show as they happen, text or not.
          const isEmptyMerchivaPlaceholder =
            !msg.text &&
            !msg.actions?.length &&
            !msg.actionsList &&
            !msg.questions?.length &&
            !msg.rolesAdd?.length &&
            !msg.rolesList &&
            !msg.tasksAdd?.length &&
            !msg.tasksDelete?.length &&
            !msg.tasksList &&
            !msg.steps?.length;
          if (isEmptyMerchivaPlaceholder) return null;
          return renderMenu(
            <ChatRow time={msg.time}>
              <Bubble>
                <ToolSteps steps={msg.steps} />
                <div className={cn("text-[13.5px] text-foreground leading-[1.55]", !msg.text && !!msg.steps?.length && "hidden")}>
                  <MerchivaMarkdown content={msg.text} />
                </div>
                {msg.actions && msg.actions.length > 0 && (
                  <>
                    {msg.actions.map((act) => (
                      <ActionApprovalCard
                        key={act.id}
                        action={act.action}
                        status={act.status}
                        decision={act.decision}
                        reason={act.reason}
                        why={act.why}
                        alreadyExecuted={msg.executed}
                        onApprove={() => handleApprove(msg.id, act.id)}
                        onReject={() => handleReject(msg.id, act.id)}
                        refs={refs}
                        savedLabels={act.refLabels}
                      />
                    ))}
                  </>
                )}
                {msg.actionsList && (
                  <ActionsListCard />
                )}
                {msg.questions && msg.questions.length > 0 && (
                  <QAForm items={msg.questions} onSubmit={(summary) => sendMessage(summary)} />
                )}
                {msg.rolesList && (
                  <RolesListCard roles={staffRoles.map((r) => ({
                    id: r.id.toHexString(),
                    name: r.name,
                    color: r.color,
                    icon: r.icon,
                    description: r.description,
                  }))} />
                )}
                {msg.tasksList && (() => {
                  // `/tasks list <role>` names the role by name or id; tasks store its hyphenated id.
                  const storeRoles = refs.rows.roles ?? [];
                  const matchedRole = resolveRoleRef(storeRoles, msg.tasksList);
                  return matchedRole ? (
                    <TasksListInline roleId={storedId(matchedRole.id)} roleName={String(matchedRole.name ?? "")} autonomy={autonomyConfig} can={canForGate} />
                  ) : (
                    <div className="rounded-lg border border-border bg-muted/40 p-3 mt-2 text-[12px] text-muted-foreground">
                      {t("merchiva.command.roleNotFound").replace("{role}", roleRefLabel(storeRoles, { role: msg.tasksList }) ?? t("merchiva.refs.unknownRole"))}
                    </div>
                  );
                })()}
                {(msg.rolesAdd || msg.tasksAdd) && (
                  <CommandGroup
                    roles={msg.rolesAdd}
                    tasks={msg.tasksAdd}
                    deletes={msg.tasksDelete}
                    storeRoles={refs.rows.roles ?? []}
                    storeTasks={refs.rows.tasks ?? []}
                    groupChats={groupChats}
                    autonomy={autonomyConfig} can={canForGate} fromCommand={msg.fromCommand}
                    alreadyExecuted={msg.executed}
                    rejectedRoles={msg.rejectedRoles}
                    rejectedTasks={msg.rejectedTasks}
                    onRejectRole={(idx) => {
                      setMessages((prev) => prev.map((m) =>
                        m.id === msg.id ? { ...m, rejectedRoles: [...(m.rejectedRoles ?? []), idx] } : m
                      ));
                    }}
                    onRejectTask={(idx) => {
                      setMessages((prev) => prev.map((m) =>
                        m.id === msg.id ? { ...m, rejectedTasks: [...(m.rejectedTasks ?? []), idx] } : m
                      ));
                    }}
                  />
                )}
                {msg.tasksDelete && msg.tasksDelete.length > 0 && (
                  <TaskDeleteGroup
                    deletes={msg.tasksDelete}
                    storeRoles={refs.rows.roles ?? []}
                    storeTasks={refs.rows.tasks ?? []}
                    autonomy={autonomyConfig} can={canForGate} fromCommand={msg.fromCommand}
                    alreadyExecuted={msg.executed}
                    cancelled={msg.cancelledDeletes}
                    onCancel={(idx) => {
                      setMessages((prev) => prev.map((m) =>
                        m.id === msg.id ? { ...m, cancelledDeletes: [...(m.cancelledDeletes ?? []), idx] } : m
                      ));
                    }}
                  />
                )}
              </Bubble>
            </ChatRow>
          );
        })}

        <ToolStepsAnnouncer message={messages[messages.length - 1]} />

        {sending && (
          <ChatRow time="">
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Spinner size={14} />
              <span className="animate-pulse">{thinkingPhase || t("merchiva.thinking.defaultFetch")}</span>
            </div>
          </ChatRow>
        )}

        </div>
      </div>

      {/* Quick chips */}
      <div className={cn("pt-3 pb-2 flex items-center gap-1.5 flex-wrap shrink-0", compact ? "px-4" : "px-6")}>
        {quickChips.map((s) => (
          <button key={s} onClick={() => sendMessage(s)}
            className="h-7 px-2.5 rounded-full border border-border bg-background text-[11.5px] text-muted-foreground hover:bg-muted inline-flex items-center gap-1.5">
            <Sparkles className="h-[11px] w-[11px]" style={{ color: M_ACC }} />
            {s}
          </button>
        ))}
      </div>

      {/* Attached data/files preview */}
      {(attachedData.length > 0 || attachedFiles.length > 0) && (
        <div className={cn("pt-2 flex items-center gap-1.5 flex-wrap shrink-0", compact ? "px-4" : "px-6")}>
          {attachedData.map((d) => (
            <span key={d} className="h-6 px-2 rounded inline-flex items-center gap-1.5 text-[11px] font-mono font-medium"
              style={{ background: M_ACC_SOFT, border: `1px solid ${M_ACC_BD}`, color: M_ACC }}>
              {DATA_ICONS[d]}
              @{d}
              <button onClick={() => toggleDataMention(d)} className="ml-0.5 hover:text-foreground">×</button>
            </span>
          ))}
          {attachedFiles.map((f, i) => (
            <span key={i} className="h-6 px-2 rounded inline-flex items-center gap-1.5 bg-muted border border-border text-muted-foreground text-[11px] font-mono">
              <Paperclip className="h-3 w-3" />
              {f.name.length > 20 ? f.name.slice(0, 17) + "..." : f.name}
              <button onClick={() => removeFile(i)} className="ml-0.5 hover:text-foreground">×</button>
            </span>
          ))}
        </div>
      )}

      {/* @data mention dropdown */}
      {dataMentionOpen && (
        <div className={cn("pt-2 shrink-0", compact ? "px-4" : "px-6")}>
          <div className="rounded-lg border border-border bg-background p-2 space-y-0.5">
            <div className="px-2 pb-1">
              <Eyebrow as="span" size="xs">{t("merchiva.mentionData")}</Eyebrow>
            </div>
            {DATA_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => toggleDataMention(cat.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left transition-colors",
                  attachedData.includes(cat.id) ? "bg-foreground text-background" : "hover:bg-muted"
                )}
              >
                {DATA_ICONS[cat.id]}
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-medium">{t(`merchiva.dataCategory.${cat.id}.label`)}</div>
                  <div className={cn("text-[10.5px]", attachedData.includes(cat.id) ? "text-background/60" : "text-muted-foreground")}>{t(`merchiva.dataCategory.${cat.id}.desc`)}</div>
                </div>
                {attachedData.includes(cat.id) && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Composer */}
      <div className={cn("pt-2 shrink-0", compact ? "px-4 pb-3" : "px-6 pb-5")}>
        <input ref={fileInputRef} type="file" accept="image/*,.pdf,.csv,.xlsx,.txt" multiple className="hidden" onChange={handleFileSelect} />
        <div className="rounded-lg border border-border bg-background focus-within:border-ring transition-colors">
          <textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(draft);
              }
            }}
            placeholder={t("merchiva.composerPlaceholder")}
            className="w-full resize-none bg-transparent border-0 outline-none px-4 pt-3 pb-2 text-[14px] leading-[1.5] placeholder:text-muted-foreground/60"
          />
          <div className="flex items-center gap-2 px-3 pb-2.5 pt-1">
            <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()}
              className="text-muted-foreground" title={t("merchiva.attachFile")}>
              <Paperclip className="h-[15px] w-[15px]" />
            </Button>
            <Button variant="ghost" size="icon" onClick={recording ? stopVoice : startVoice}
              className={cn(
                "text-muted-foreground",
                recording && "bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive"
              )} title={recording ? t("merchiva.stopRecording") : t("merchiva.voiceInput")}>
              <Mic className="h-[15px] w-[15px]" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setCallOpen(true)}
              className="hidden @[300px]:inline-flex text-muted-foreground"
              title={t("merchiva.startCall")}>
              <Phone className="h-[15px] w-[15px]" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setDataMentionOpen((v) => !v)}
              className={cn(
                "gap-1.5 @[340px]:w-auto @[340px]:px-2 @[340px]:justify-start",
                dataMentionOpen || attachedData.length > 0
                  ? "text-foreground bg-muted"
                  : "text-muted-foreground"
              )} title={t("merchiva.mentionData")}>
              <AtSign className="h-[14px] w-[14px]" />
              <span className="hidden @[340px]:inline text-[11.5px]">{t("merchiva.dataLabel")}{attachedData.length > 0 ? ` · ${attachedData.length}` : ""}</span>
            </Button>
            <div className="flex-1" />
            <kbd className="hidden @[420px]:inline-block font-mono text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">⏎ {t("merchiva.sendShortcut")}</kbd>
            <Button
              size="lg"
              disabled={(!draft.trim() && attachedFiles.length === 0) || sending}
              onClick={() => sendMessage(draft)}
              className="w-9 px-0 @[300px]:w-auto @[300px]:px-4 gap-2 disabled:opacity-30"
            >
              {sending ? <Spinner size={14} /> : <span className="hidden @[300px]:inline">{t("merchiva.send")}</span>}
              {!sending && <ArrowUp className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </div>

      <MerchivaCallModal
        open={callOpen}
        onClose={() => setCallOpen(false)}
        getContext={() => ({
          history: expandHistoryFromMessages(messages, refs.rows.roles ?? []).slice(-10),
          storeContext,
          page: currentPagePayload(focusScope, t),
          memory: organizationId
            ? loadMemory(organizationId)
            : { summary: "", storeOverview: "", userPreferences: "" },
          permissions: {
            isOwner,
            role: orgRole,
            sections: Object.fromEntries(
              Object.entries(userPermissions).map(([k, v]) => [
                k,
                { view: v?.view, edit: v?.edit },
              ]),
            ),
          },
        })}
        onTurnComplete={(userText, aiText) => {
          setMessages((prev) => {
            // An "open" voice-call message at the tail has durationSec === 0
            // (set by onCallEnd to a non-zero value when the call finishes).
            const last = prev[prev.length - 1];
            const isOpenCall =
              last?.from === "voice-call" && (last.voiceCall?.durationSec ?? 0) === 0;
            if (isOpenCall && last) {
              return [
                ...prev.slice(0, -1),
                {
                  ...last,
                  voiceCall: {
                    durationSec: 0,
                    turns: [
                      ...(last.voiceCall?.turns ?? []),
                      { user: userText, ai: aiText },
                    ],
                  },
                },
              ];
            }
            const now = new Date();
            const time = now.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
            return [
              ...prev,
              {
                id: `vc-${now.getTime()}`,
                from: "voice-call",
                text: "",
                time,
                voiceCall: { durationSec: 0, turns: [{ user: userText, ai: aiText }] },
              },
            ];
          });
        }}
        onCallEnd={(durationSec) => {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (
              !last ||
              last.from !== "voice-call" ||
              (last.voiceCall?.durationSec ?? 0) !== 0
            ) {
              return prev;
            }
            return [
              ...prev.slice(0, -1),
              {
                ...last,
                voiceCall: {
                  // Force >= 1 so the "open" sentinel (durationSec === 0) flips.
                  durationSec: Math.max(1, durationSec),
                  turns: last.voiceCall?.turns ?? [],
                },
              },
            ];
          });
        }}
      />
    </section>
  );
}

// ── Today's Schedule Card ───────────────────────────────────────────────────

function TodayScheduleCard() {
  const t = useT();
  const { organizationId } = usePermissions();
  const { shifts: allShifts } = useStaffing(organizationId, null, false);

  const today = todayKey();
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  const shifts = useMemo(() => {
    return allShifts
      .filter((s) => s.date === today)
      .map((s) => {
        const [sh, sm] = s.startTime.split(":").map(Number);
        const [eh, em] = s.endTime.split(":").map(Number);
        return {
          id: s.id,
          name: s.staffName,
          role: Array.isArray(s.staffRoles) ? s.staffRoles.join(" · ") : (s.staffRole ?? ""),
          startMin: sh * 60 + sm,
          endMin: eh * 60 + em,
          startTime: s.startTime,
          endTime: s.endTime,
          shiftType: s.shiftType ?? "morning",
        };
      })
      .sort((a, b) => a.startMin - b.startMin);
  }, [allShifts, today]);

  const onShift = shifts.filter((s) => nowMin >= s.startMin && nowMin < s.endMin);
  const upNext = shifts.filter((s) => s.startMin > nowMin).slice(0, 2);

  const startHr = 6, endHr = 22;
  const totalMin = (endHr - startHr) * 60;
  const pct = (m: number) => ((m - startHr * 60) / totalMin) * 100;

  const lanes: typeof shifts[] = [];
  const shiftLanes = new Map<string, number>();
  shifts.forEach((s) => {
    let placed = false;
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i][lanes[i].length - 1].endMin <= s.startMin) {
        lanes[i].push(s);
        shiftLanes.set(s.id, i);
        placed = true;
        break;
      }
    }
    if (!placed) {
      lanes.push([s]);
      shiftLanes.set(s.id, lanes.length - 1);
    }
  });

  const SHIFT_COLORS: Record<string, string> = {
    morning: "#57534e",
    afternoon: "#0891b2",
    evening: "#7c3aed",
    closing: "#dc2626",
  };

  const ticks = [6, 10, 14, 18, 22];

  function formatTimeShort(time: string) {
    const [h, m] = time.split(":").map(Number);
    const p = h >= 12 ? "p" : "a";
    const hr = h % 12 || 12;
    return m === 0 ? `${hr}${p}` : `${hr}:${String(m).padStart(2, "0")}${p}`;
  }

  const hasShifts = shifts.length > 0;
  const totalHrs = shifts.reduce((sum, s) => sum + (s.endMin - s.startMin) / 60, 0);

  return (
    <section className="rounded-lg border border-border bg-background overflow-hidden">
      <header className="px-5 py-3 border-b border-border flex items-center gap-2">
        <div className="flex-1">
          <div className="text-[13.5px] font-semibold">{t("merchiva.schedule.title")}</div>
          <div className="text-[11px] text-muted-foreground">
            <span className="font-mono">{shifts.length}</span> {t("merchiva.schedule.shifts")} · <span className="font-mono">{totalHrs.toFixed(1)}</span> {t("merchiva.schedule.hrs")}
          </div>
        </div>
        <button className="text-[11.5px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5">
          {t("merchiva.schedule.open")} <ChevronRight className="h-3 w-3" />
        </button>
      </header>

      {hasShifts ? (
        <>
          <div className="px-5 pt-3 pb-4">
            <div className="relative h-3 mb-1">
              {ticks.map((h) => (
                <div key={h} className="absolute font-mono text-[9px] text-muted-foreground tabular-nums -translate-x-1/2" style={{ left: `${pct(h * 60)}%` }}>
                  {h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`}
                </div>
              ))}
            </div>
            <div className="relative rounded-lg border border-border bg-muted/40 overflow-hidden"
              style={{ height: lanes.length * 22 + (lanes.length - 1) * 3 + 8 }}>
              {ticks.map((h) => (
                <div key={h} className="absolute top-0 bottom-0 w-px bg-border" style={{ left: `${pct(h * 60)}%` }} />
              ))}
              {shifts.map((s) => {
                const left = pct(s.startMin);
                const width = pct(s.endMin) - pct(s.startMin);
                const isActive = nowMin >= s.startMin && nowMin < s.endMin;
                const lane = shiftLanes.get(s.id) ?? 0;
                return (
                  <div key={s.id}
                    className={cn(
                      "absolute flex items-center gap-1.5 px-1.5 rounded border text-[10px] font-medium whitespace-nowrap overflow-hidden",
                      isActive
                        ? "bg-foreground border-foreground text-background"
                        : "bg-background border-border text-foreground",
                    )}
                    style={{
                      left: `${left}%`, width: `${width}%`,
                      top: lane * 25 + 4, height: 21,
                    }}>
                    <span className="w-1 h-1 rounded-full shrink-0" style={{ background: isActive ? "var(--background)" : (SHIFT_COLORS[s.shiftType] || "#78716c") }} />
                    <span className="overflow-hidden text-ellipsis">{s.name.split(" ")[0]}</span>
                  </div>
                );
              })}
              <div className="absolute -top-1 -bottom-1 w-px bg-destructive" style={{ left: `${pct(nowMin)}%` }}>
                <div className="absolute -top-1 -left-[3px] w-[7px] h-[7px] rounded-full bg-destructive" />
              </div>
            </div>
          </div>

          <div className="border-t border-border divide-y divide-border">
            {onShift.length > 0 && (
              <>
                <div className="px-5 py-2 flex items-center gap-2">
                  <Eyebrow as="span" size="xs">{t("merchiva.schedule.onShift").replace("{count}", String(onShift.length))}</Eyebrow>
                  <span className="ml-auto text-[10.5px] font-mono text-emerald-600 inline-flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> {t("merchiva.schedule.live")}
                  </span>
                </div>
                {onShift.map((s) => (
                  <div key={s.id} className="px-5 py-2 flex items-center gap-3">
                    <Avatar name={s.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-medium leading-tight">{s.name}</div>
                      <div className="text-[10.5px] text-muted-foreground leading-tight mt-0.5">{s.role}</div>
                    </div>
                    <div className="font-mono text-[11px] tabular-nums text-right">
                      {formatTimeShort(s.startTime)}–{formatTimeShort(s.endTime)}
                    </div>
                  </div>
                ))}
              </>
            )}
            {upNext.length > 0 && (
              <>
                <div className="px-5 py-2 flex items-center gap-2">
                  <Eyebrow as="span" size="xs">{t("merchiva.schedule.upNext")}</Eyebrow>
                </div>
                {upNext.map((s) => {
                  const inMin = s.startMin - nowMin;
                  const inStr = inMin < 60
                    ? t("merchiva.schedule.inMinutes").replace("{n}", String(inMin))
                    : t("merchiva.schedule.inHours").replace("{n}", String(Math.floor(inMin / 60)));
                  return (
                    <div key={s.id} className="px-5 py-2 flex items-center gap-3">
                      <Avatar name={s.name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] font-medium leading-tight">{s.name}</div>
                        <div className="text-[10.5px] text-muted-foreground leading-tight mt-0.5">{s.role} · {inStr}</div>
                      </div>
                      <div className="font-mono text-[11px] tabular-nums">{formatTimeShort(s.startTime)}–{formatTimeShort(s.endTime)}</div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </>
      ) : (
        <div className="px-5 py-8 text-center text-xs text-muted-foreground">{t("merchiva.schedule.noShifts")}</div>
      )}
    </section>
  );
}

// ── Notifications Card ──────────────────────────────────────────────────────

function NotificationsCard() {
  const t = useT();
  const [rawNotifs] = useNotifications();

  const recent = useMemo(() => {
    return [...rawNotifs]
      .filter((n) => !n.read)
      .sort((a, b) => new Date(b.createdAt.toDate()).getTime() - new Date(a.createdAt.toDate()).getTime())
      .slice(0, 4);
  }, [rawNotifs]);

  const ICONS: Record<string, React.ReactNode> = {
    shift_trade: <ArrowLeftRight className="h-3 w-3" />,
    time_off: <CalendarX className="h-3 w-3" />,
    inventory_low: <Package className="h-3 w-3" />,
    order: <Truck className="h-3 w-3" />,
    general: <Bell className="h-3 w-3" />,
    team: <Users className="h-3 w-3" />,
  };

  const tones: Record<string, { bg: string; bd: string; fg: string }> = {
    shift_trade: { bg: "#fffbeb", bd: "#fde68a", fg: "#d97706" },
    time_off: { bg: "#fffbeb", bd: "#fde68a", fg: "#d97706" },
    inventory_low: { bg: M_ACC_SOFT, bd: M_ACC_BD, fg: M_ACC },
    order: { bg: "#f5f5f4", bd: "#e7e5e4", fg: "#57534e" },
    general: { bg: "#f5f5f4", bd: "#e7e5e4", fg: "#57534e" },
    team: { bg: "#f5f5f4", bd: "#e7e5e4", fg: "#57534e" },
  };

  const needsDecision = recent.filter((n) => n.type === "shift_trade" || n.type === "time_off").length;

  return (
    <section className="rounded-lg border border-border bg-background overflow-hidden flex flex-col">
      <header className="px-5 py-3 border-b border-border flex items-center gap-2">
        <div className="flex-1">
          <div className="text-[13.5px] font-semibold">{t("merchiva.notifications.title")}</div>
          <div className="text-[11px] text-muted-foreground">
            <span className="font-mono">{recent.length}</span> {t("merchiva.notifications.new")}
            {needsDecision > 0 && <> · <span className="font-mono">{needsDecision}</span> {t("merchiva.notifications.needDecision")}</>}
          </div>
        </div>
        <button className="text-[11.5px] text-muted-foreground hover:text-foreground">{t("merchiva.notifications.markAllRead")}</button>
      </header>

      {recent.length > 0 ? (
        <div className="divide-y divide-border">
          {recent.map((n) => {
            const tone = tones[n.type] ?? tones.general;
            const icon = ICONS[n.type] ?? ICONS.general;
            const ago = timeAgo(n.createdAt.toDate().toISOString());
            return (
              <div key={n.id.toString()} className="px-5 py-3 flex items-start gap-3">
                <span className="h-6 w-6 rounded-lg border inline-flex items-center justify-center shrink-0"
                  style={{ background: tone.bg, borderColor: tone.bd, color: tone.fg }}>
                  {icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <div className="text-[12.5px] font-medium leading-tight truncate">{n.title}</div>
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground tabular-nums shrink-0">{ago}</span>
                  </div>
                  <div className="text-[11.5px] text-muted-foreground leading-snug mt-1">{n.body}</div>
                  {(n.type === "shift_trade" || n.type === "time_off") && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <Button size="xs">
                        {t("merchiva.notifications.review")}
                      </Button>
                      <Button variant="outline" size="xs" className="text-muted-foreground">
                        {t("merchiva.notifications.dismiss")}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-5 py-8 text-center text-xs text-muted-foreground">{t("merchiva.notifications.empty")}</div>
      )}
    </section>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

// ── Root Desktop Dashboard ──────────────────────────────────────────────────

export function DesktopMerchivaDashboard() {
  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">
      <style>{`@keyframes ddBlink { 0%,50% { opacity: 1; } 50.01%,100% { opacity: 0; } }`}</style>
      <KpiStrip />
      <div className="flex-1 min-h-0 grid gap-4 p-4 grid-cols-2">
        {/* <div className="flex flex-col gap-4 min-h-0 overflow-auto"> */}
          <TodayScheduleCard />
          <NotificationsCard />
        {/* </div> */}
      </div>
    </div>
  );
}

// ── Mobile Dashboard ────────────────────────────────────────────────────────

function MobileKpiRow() {
  const t = useT();
  const { format } = useCurrency();
  const { organizationId } = usePermissions();
  const { history: salesHistory, hourly: salesHourly, isReady: salesReady } = useSales();
  const { items: invItems, isReady: invReady } = useInventory(organizationId);

  const today = todayKey();

  const todayRevenue = useMemo(() => {
    if (!salesReady) return null;
    const daily = salesHistory.find((s) => s.date === today);
    if (daily) return daily.actual;
    return salesHourly.reduce((sum, s) => sum + s.actual, 0);
  }, [salesHistory, salesHourly, salesReady, today]);

  const atRisk = useMemo(() => {
    if (!invReady) return null;
    return invItems.filter((i) => i.currentStock <= i.minStock).length;
  }, [invItems, invReady]);

  return (
    <StatGrid className="grid-cols-2 px-4 lg:grid-cols-2">
      <StatTile
        size="md"
        label={t("merchiva.kpi.revenueToday")}
        value={todayRevenue != null ? format(todayRevenue, { decimals: 0 }) : "—"}
      />
      <StatTile
        size="md"
        label={t("merchiva.kpi.skusAtRisk")}
        value={atRisk != null ? String(atRisk) : "—"}
        tone={atRisk && atRisk > 0 ? "warning" : undefined}
      />
    </StatGrid>
  );
}

export function MobileMerchivaDashboard() {
  return (
    <div className="pb-8 space-y-4">
      <style>{`@keyframes ddBlink { 0%,50% { opacity: 1; } 50.01%,100% { opacity: 0; } }`}</style>
      <MobileKpiRow />
      <div className="px-4 space-y-4">
        <TodayScheduleCard />
        <NotificationsCard />
      </div>
    </div>
  );
}
