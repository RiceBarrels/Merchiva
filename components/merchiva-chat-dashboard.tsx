"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Package, Users, Eye, ChevronRight, ChevronDown, ChevronUp,
  Bell, Paperclip, Mic, AtSign, ArrowUp, ArrowRight, Check, Loader2,
  Calendar, History, Sparkles,
  ArrowLeftRight, CalendarX, Truck, Trash2, Plus, MessageSquare,
  User, Coffee, Utensils, ChefHat, Clipboard, Wrench, Headphones,
  Store, Banknote, Box, ShoppingCart, Receipt, HeartPulse, Baby, Dog,
  Leaf, Music, Camera, Palette, Hammer, Zap, Star, Award, Briefcase,
  Phone, Mail, Clock, Wine, Shield, MoonStar, Sun, ReceiptText, HandPlatter,
  Pencil, UserPlus, UserMinus, ListChecks, Tag, Ticket, X,
  CheckCircle2, AlertTriangle, MousePointer2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/context/permissions";
import { useNotifications } from "@/lib/spacetimedb/hooks";
import { useInventory } from "@/lib/spacetimedb/hooks/useInventory";
import { useSales } from "@/lib/spacetimedb/hooks/useSales";
import { useStaffing } from "@/lib/spacetimedb/hooks/useStaffing";
import { useProducts } from "@/lib/spacetimedb/hooks/useProducts";
import { generateInsights, generateGreeting, type MerchivaInsight } from "@/lib/merchiva-insights";
import {
  addStaffRole as execAddStaffRole,
  addRoleTask as execAddRoleTask,
  deleteStaffRole as execDeleteStaffRole,
  deleteRoleTask as execDeleteRoleTask,
  getRoleTasks,
  createAiChatSession as execCreateSession,
  saveAiChatSession as execSaveSession,
} from "@/lib/spacetimedb/actions";
import { getConnection } from "@/lib/spacetimedb/client";
import { useStaffRoles, useRoleTasks, useAiChatSessions, useTrainingDays, useTrainingObjectives, useSettingsRows } from "@/lib/spacetimedb/hooks";
import { getUpcomingHolidays, inferCountryFromLocale, parseOpeningHours } from "@/lib/holidays";
import { toast } from "sonner";
import { parseAllSkills, executeAction, getActionCatalog } from "@/lib/merchiva/skills/registry";
import { extractActionBlocks } from "@/lib/merchiva/skills/actions";
import { useAiJobs } from "@/lib/spacetimedb/hooks";
import { consumeAiJob, deleteAiJob } from "@/lib/spacetimedb/actions";
import { getStoredToken } from "@/lib/spacetimedb/client";
import type { ChatMessage, TaskDeleteCmd } from "@/lib/merchiva/skills/types";
import { loadMemory, saveMemoryField } from "@/lib/merchiva/memory";
import { useI18n, useT } from "@/lib/i18n/context";
import { MerchivaLogo } from "@/components/logo";
import { MerchivaCallModal } from "@/components/merchiva-call-modal";

// ── Brand colors ────────────────────────────────────────────────────────────

const M_ACC = "var(--m-acc)";
const M_ACC_SOFT = "var(--m-acc-soft)";
const M_ACC_BD = "var(--m-acc-bd)";

// ── Role icon map (mirrors staffing page) ──────────────────────────────────

const ROLE_ICON_MAP: Record<string, LucideIcon> = {
  "user": User, "coffee": Coffee, "utensils": Utensils, "chef-hat": ChefHat,
  "truck": Truck, "package": Package, "clipboard": Clipboard, "wrench": Wrench,
  "headphones": Headphones, "store": Store, "banknote": Banknote,
  "sparkles": Sparkles, "box": Box, "shopping-cart": ShoppingCart,
  "receipt": Receipt, "heart-pulse": HeartPulse, "baby": Baby, "dog": Dog,
  "leaf": Leaf, "music": Music, "camera": Camera, "palette": Palette,
  "hammer": Hammer, "zap": Zap, "star": Star, "award": Award,
  "briefcase": Briefcase, "phone": Phone, "mail": Mail, "clock": Clock,
  "shield": Shield, "wine": Wine, "moon-star": MoonStar, "sun": Sun,
  "receipt-text": ReceiptText, "hand-platter": HandPlatter,
};

function RoleIcon({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  const Comp = ROLE_ICON_MAP[name] ?? User;
  return <Comp className={className} style={style} />;
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

function MonoCap({ children, color = "#78716c", className }: { children: React.ReactNode; color?: string; className?: string }) {
  return (
    <span
      className={cn("font-mono uppercase", className)}
      style={{ fontSize: 10, color, letterSpacing: 0.6 }}
    >
      {children}
    </span>
  );
}

function Initials({ name, size = 28 }: { name: string; size?: number }) {
  const init = name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div
      className="rounded-full bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300 flex items-center justify-center font-semibold shrink-0"
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38) }}
    >
      {init}
    </div>
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
  const { organizationId } = usePermissions();
  const { history: salesHistory, hourly: salesHourly, isReady: salesReady } = useSales();
  const { items: invItems, isReady: invReady } = useInventory(organizationId);
  const { shifts: allShifts, loading: staffLoading } = useStaffing(organizationId, null, false);

  const today = new Date().toISOString().slice(0, 10);
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
      label: "Revenue · today",
      v: todayRevenue != null ? `$${todayRevenue.toLocaleString()}` : "—",
      sub: "vs avg",
      delta: todayRevenue != null && todayRevenue > 0 ? "live" : "—",
      good: todayRevenue != null && todayRevenue > 0,
    },
    {
      label: "Orders",
      v: todayOrders != null ? String(todayOrders) : "—",
      sub: "today",
      delta: todayOrders != null && todayOrders > 0 ? "live" : "—",
      good: todayOrders != null && todayOrders > 0,
    },
    {
      label: "On shift",
      v: onShiftCount != null ? `${onShiftCount} / ${totalTodayShifts}` : "—",
      sub: "live",
      delta: "live",
      mono: true,
    },
    {
      label: "SKUs at risk",
      v: atRisk != null ? String(atRisk) : "—",
      sub: `of ${invItems.length} tracked`,
      delta: atRisk != null && atRisk > 0 ? `${Math.min(atRisk, 3)} high` : "0",
      warn: atRisk != null && atRisk > 0,
    },
  ];

  return (
    <div className="grid grid-cols-4 border-b border-border bg-background">
      {kpis.map((k, i) => (
        <div key={i} className={cn("px-6 py-4", i > 0 && "border-l border-border")}>
          <MonoCap>{k.label}</MonoCap>
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
    <div className="rounded-[0.3rem] border border-border bg-background overflow-hidden">
      {riskItems.map((r, i) => {
        const tone = r.risk === "high" ? "#dc2626" : r.risk === "med" ? "#d97706" : "#059669";
        return (
          <div key={r.sku} className={cn("flex items-center gap-3 px-3 py-2", i > 0 && "border-t border-border")}>
            <span className="font-mono text-[10.5px] text-muted-foreground w-[100px] shrink-0">{r.sku}</span>
            <span className="text-[12.5px] flex-1 truncate">{r.name}</span>
            <span className="font-mono text-[11px] tabular-nums">
              <span style={{ color: tone, fontWeight: 600 }}>{r.stock}</span>
              <span className="text-stone-400 dark:text-stone-500">/{r.par}</span>
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
        <div className="flex-1 h-px bg-stone-200 dark:bg-stone-700" />
        <MonoCap>{children}</MonoCap>
        <div className="flex-1 h-px bg-stone-200 dark:bg-stone-700" />
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3">
      <NotchM size={32} fg="#fff" bg="#1c1917" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[12.5px] font-semibold tracking-tight">{t("merchiva.name")}</span>
          <MonoCap color="#a8a29e">{time}</MonoCap>
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
          "inline-flex items-center gap-2 rounded-full border border-border bg-stone-50 dark:bg-stone-950 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground",
          canExpand && "hover:bg-stone-100 dark:hover:bg-stone-900 cursor-pointer",
        )}
      >
        <Phone className="h-3 w-3" />
        <span>{t("merchiva.call.title")}</span>
        <span className="text-stone-400">·</span>
        <span className="tabular-nums">{dur}</span>
        {canExpand && (
          <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
        )}
      </button>
      {expanded && canExpand && (
        <div className="w-full max-w-[680px] rounded-[0.3rem] border border-border bg-stone-50/40 dark:bg-stone-950/40 p-3 text-[12.5px] space-y-3 leading-[1.55]">
          {turns.map((turn, i) => (
            <div key={i} className="space-y-1.5">
              <div>
                <span className="font-mono text-[10px] uppercase tracking-wide text-stone-500 mr-2">
                  {t("merchiva.call.youSaid")}
                </span>
                <span className="whitespace-pre-wrap">{turn.user}</span>
              </div>
              <div>
                <span className="font-mono text-[10px] uppercase tracking-wide text-stone-500 mr-2">
                  {t("merchiva.call.merchivaSaid")}
                </span>
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
  const [expanded, setExpanded] = useState(false);
  return (
    <Bubble>
      <div className="flex items-center gap-2">
        <span className="h-6 px-2 rounded-[0.3rem] inline-flex items-center gap-1.5"
          style={{ background: M_ACC_SOFT, border: `1px solid ${M_ACC_BD}`, color: M_ACC }}>
          {IconComp}
          <span className="font-mono text-[10px] tracking-[0.08em] uppercase font-semibold">{pill}</span>
        </span>
        <div className="flex-1" />
        <div className="inline-flex items-center gap-1.5 text-[10.5px] font-mono text-muted-foreground">
          confidence
          <span className="tabular-nums text-foreground font-semibold">{(confidence * 100).toFixed(0)}%</span>
          <span className="inline-block w-12 h-1 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
            <span className="block h-full" style={{ width: `${confidence * 100}%`, background: M_ACC }} />
          </span>
        </div>
      </div>
      <h3 className="text-[20px] font-semibold tracking-tight leading-[1.2]">{title}</h3>
      <p className="text-[13.5px] text-stone-600 dark:text-stone-300 leading-[1.55]" style={{ textWrap: "pretty" }}>{body}</p>

      {embed}

      <div className="flex items-center gap-2">
        <button className="h-9 px-4 bg-foreground text-background rounded-[0.3rem] text-[13px] font-medium hover:bg-foreground/90 inline-flex items-center gap-2">
          {primary.label}
          {primary.icon ?? <ArrowRight className="h-3.5 w-3.5" />}
        </button>
        <button className="h-9 px-3 rounded-[0.3rem] border border-border bg-background text-foreground text-[13px] font-medium hover:bg-muted">
          {secondary}
        </button>
        <div className="flex-1" />
        {reasoning && (
          <button onClick={() => setExpanded((e) => !e)}
            className="h-9 px-2 text-[11.5px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            {expanded ? "Hide" : "Why"}
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        )}
      </div>
      {expanded && reasoning && (
        <div className="border-t border-border pt-3 -mx-4 -mb-4 px-4 pb-4 bg-stone-50/60 dark:bg-stone-950/60">
          <MonoCap>based on</MonoCap>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {reasoning.map((r) => (
              <span key={r} className="inline-flex items-center gap-1.5 px-2 py-1 border border-border rounded-[0.3rem] bg-background font-mono text-[10.5px] text-stone-600 dark:text-stone-300">
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
  if (insight.type === "inventory" && insight.data) {
    const d = insight.data as { itemName: string; currentStock: number; minStock: number; maxStock: number; unit: string; daysOfCover: number };
    return (
      <div className="rounded-[0.3rem] border border-border bg-stone-50/40 dark:bg-stone-950/40 p-3">
        <div className="flex items-baseline gap-2 mb-2">
          <div className="text-[12.5px] font-semibold">{d.itemName}</div>
          <MonoCap>{d.currentStock} / {d.maxStock} {d.unit} · ~{d.daysOfCover}d cover</MonoCap>
        </div>
        <div className="w-full h-2 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
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
            ["Current", `${d.currentStock} ${d.unit}`],
            ["Min / Max", `${d.minStock} / ${d.maxStock}`],
            ["Cover", `~${d.daysOfCover} days`],
          ] as const).map(([k, v], i) => (
            <div key={k} className={cn(i > 0 && "pl-3")}>
              <MonoCap>{k}</MonoCap>
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

// ── Action approval UI ─────────────────────────────────────────────────────

const ACTION_META: Record<string, { label: string; icon: React.ReactNode; fields: string[]; risk?: "low" | "medium" | "high" }> = {
  // Scheduling
  addShift:            { label: "排班", icon: <Calendar className="h-3 w-3" />, fields: ["staffName", "date", "startTime", "endTime", "shiftType", "staffRoles"] },
  updateShift:         { label: "修改班次", icon: <Pencil className="h-3 w-3" />, fields: ["shiftId", "date", "startTime", "endTime", "shiftType"] },
  deleteShift:         { label: "删除班次", icon: <CalendarX className="h-3 w-3" />, fields: ["shiftId"], risk: "high" },
  approveTimeOff:      { label: "审批请假", icon: <CheckCircle2 className="h-3 w-3" />, fields: ["requestId", "approved", "reason"] },
  approveShiftTrade:   { label: "审批换班", icon: <ArrowLeftRight className="h-3 w-3" />, fields: ["tradeId", "approved"] },
  // Staff
  addStaffMember:      { label: "添加员工", icon: <UserPlus className="h-3 w-3" />, fields: ["name", "role", "hourlyRate"] },
  inviteTeamMember:    { label: "邀请加入团队", icon: <Mail className="h-3 w-3" />, fields: ["email", "role", "orgName"] },
  updateStaffMember:   { label: "修改员工", icon: <Pencil className="h-3 w-3" />, fields: ["staffMemberId", "name", "role", "hourlyRate"] },
  deleteStaffMember:   { label: "删除员工", icon: <UserMinus className="h-3 w-3" />, fields: ["staffMemberId"], risk: "high" },
  // Roles
  addRole:             { label: "新建岗位", icon: <Plus className="h-3 w-3" />, fields: ["name", "description", "icon", "color"] },
  updateRole:          { label: "修改岗位", icon: <Pencil className="h-3 w-3" />, fields: ["roleId", "name", "description", "icon", "color"] },
  deleteRole:          { label: "删除岗位", icon: <Trash2 className="h-3 w-3" />, fields: ["roleId"], risk: "high" },
  // Role Tasks
  addRoleTask:         { label: "添加任务", icon: <ListChecks className="h-3 w-3" />, fields: ["roleId", "title", "description", "startTime", "endTime", "requiresEvidence"] },
  updateRoleTask:      { label: "修改任务", icon: <Pencil className="h-3 w-3" />, fields: ["taskId", "title", "description"] },
  deleteRoleTask:      { label: "删除任务", icon: <Trash2 className="h-3 w-3" />, fields: ["taskId"], risk: "high" },
  // Products
  addProduct:          { label: "添加商品", icon: <Plus className="h-3 w-3" />, fields: ["name", "category", "price", "cost", "description"] },
  createProduct:       { label: "添加商品", icon: <Plus className="h-3 w-3" />, fields: ["name", "category", "price", "cost", "description"] },
  updateProduct:       { label: "修改商品", icon: <Pencil className="h-3 w-3" />, fields: ["productId", "name", "category", "price"] },
  deleteProduct:       { label: "删除商品", icon: <Trash2 className="h-3 w-3" />, fields: ["productId"], risk: "high" },
  // Inventory
  addInventoryItem:    { label: "添加库存", icon: <Package className="h-3 w-3" />, fields: ["name", "category", "currentStock", "unit", "supplier"] },
  createInventoryItem: { label: "添加库存", icon: <Package className="h-3 w-3" />, fields: ["name", "category", "currentStock", "unit", "supplier"] },
  updateInventory:     { label: "更新库存", icon: <Package className="h-3 w-3" />, fields: ["itemName", "quantity", "type"] },
  updateInventoryItem: { label: "修改库存", icon: <Pencil className="h-3 w-3" />, fields: ["itemId", "name", "minStock", "maxStock"] },
  deleteInventoryItem: { label: "删除库存", icon: <Trash2 className="h-3 w-3" />, fields: ["itemId"], risk: "high" },
  // Pricing
  updatePrice:         { label: "修改价格", icon: <Tag className="h-3 w-3" />, fields: ["productName", "newPrice"] },
  addCoupon:           { label: "创建优惠券", icon: <Ticket className="h-3 w-3" />, fields: ["code", "discountType", "discountValue", "expiresAt"] },
  updateCoupon:        { label: "修改优惠券", icon: <Pencil className="h-3 w-3" />, fields: ["couponId", "code", "discountValue"] },
  deleteCoupon:        { label: "删除优惠券", icon: <Trash2 className="h-3 w-3" />, fields: ["couponId"], risk: "high" },
  // Suppliers
  addSupplier:         { label: "添加供应商", icon: <Truck className="h-3 w-3" />, fields: ["name", "contactName", "email", "phone"] },
  createSupplier:      { label: "添加供应商", icon: <Truck className="h-3 w-3" />, fields: ["name", "contactName", "email", "phone"] },
  updateSupplier:      { label: "修改供应商", icon: <Pencil className="h-3 w-3" />, fields: ["supplierId", "name", "contactName"] },
  deleteSupplier:      { label: "删除供应商", icon: <Trash2 className="h-3 w-3" />, fields: ["supplierId"], risk: "high" },
  createPurchaseOrder: { label: "创建采购单", icon: <Truck className="h-3 w-3" />, fields: ["supplierId", "items", "total"] },
  // Notifications
  createNotification:  { label: "发送通知", icon: <Bell className="h-3 w-3" />, fields: ["title", "body", "type"] },
  sendNotification:    { label: "发送通知", icon: <Bell className="h-3 w-3" />, fields: ["title", "body", "type"] },
  // Builder
  addBuilderElement:    { label: "添加组件", icon: <Plus className="h-3 w-3" />, fields: ["elements"] },
  deleteBuilderElement: { label: "删除组件", icon: <Trash2 className="h-3 w-3" />, fields: ["targets"], risk: "medium" },
  addBuilderFunction:   { label: "添加函数", icon: <Sparkles className="h-3 w-3" />, fields: ["name"] },
  editBuilderHtml:      { label: "编辑HTML", icon: <Pencil className="h-3 w-3" />, fields: ["old_string", "new_string", "replace_all"], risk: "medium" },
  setBuilderHtml:       { label: "替换页面HTML", icon: <Pencil className="h-3 w-3" />, fields: ["html"], risk: "medium" },
  appendBuilderHtml:    { label: "追加HTML", icon: <Plus className="h-3 w-3" />, fields: ["html"] },
  replaceBuilderHtml:   { label: "替换元素", icon: <Pencil className="h-3 w-3" />, fields: ["selector", "html"], risk: "medium" },
  deleteBuilderHtml:    { label: "删除元素", icon: <Trash2 className="h-3 w-3" />, fields: ["selector"], risk: "medium" },
  updateBuilderPage:    { label: "更新页面属性", icon: <Pencil className="h-3 w-3" />, fields: ["pageId", "name", "slug", "title", "description", "keywords", "ogImage", "ogTitle", "ogDescription", "canonicalUrl", "robots"] },
  updateBuilderSite:    { label: "更新站点属性", icon: <Pencil className="h-3 w-3" />, fields: ["name", "slug", "customDomain", "published", "plugins"], risk: "medium" },
};

const FIELD_LABELS: Record<string, string> = {
  staffName: "员工", date: "日期", startTime: "开始", endTime: "结束",
  shiftType: "班次", staffRoles: "岗位", itemName: "商品", quantity: "数量",
  type: "类型", supplier: "供应商", supplierId: "供应商", items: "商品",
  title: "标题", body: "内容", name: "名称", role: "角色", hourlyRate: "时薪",
  productName: "商品", productId: "商品ID", newPrice: "新价格", price: "价格", cost: "成本",
  category: "分类", description: "描述", icon: "图标", color: "颜色",
  roleId: "岗位", taskId: "任务", shiftId: "班次", staffMemberId: "员工",
  currentStock: "当前库存", minStock: "最低库存", maxStock: "最高库存", unit: "单位",
  costPerUnit: "单价", contactName: "联系人", email: "邮箱", phone: "电话",
  code: "优惠码", discountType: "折扣类型", discountValue: "折扣值", expiresAt: "过期日",
  maxUses: "最大使用次数", minPurchase: "最低消费", total: "总计",
  requestId: "请求", tradeId: "换班", approved: "批准", reason: "原因",
  requiresEvidence: "需要证据", itemId: "物品", couponId: "优惠券", active: "启用",
  variants: "规格", notes: "备注", address: "地址", paymentTerms: "付款条件",
  old_string: "查找", new_string: "替换为", replace_all: "全部替换",
  html: "HTML", selector: "选择器", targets: "目标", elements: "元素",
  pageId: "页面", slug: "Slug", keywords: "关键词", ogImage: "OG 图",
  ogTitle: "OG 标题", ogDescription: "OG 描述", canonicalUrl: "Canonical",
  robots: "Robots", customDomain: "自定义域名", published: "已发布", plugins: "插件",
};

function formatActionValue(val: unknown, depth = 0): string {
  if (val == null) return "";
  if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") return String(val);
  if (depth > 3) return "…";
  if (Array.isArray(val)) {
    return val.map((v) => formatActionValue(v, depth + 1)).join(" · ");
  }
  if (typeof val === "object") {
    return Object.entries(val as Record<string, unknown>)
      .map(([k, fv]) => `${k}: ${formatActionValue(fv, depth + 1)}`)
      .join(", ");
  }
  return String(val);
}

function ShiftPreviewStrip({ action }: { action: Record<string, unknown> }) {
  const name = String(action.staffName ?? "");
  const date = String(action.date ?? "");
  const start = String(action.startTime ?? "");
  const end = String(action.endTime ?? "");
  const type = String(action.shiftType ?? "");
  const typeColors: Record<string, string> = {
    morning: "bg-amber-100 text-amber-700 border-amber-200",
    afternoon: "bg-sky-100 text-sky-700 border-sky-200",
    evening: "bg-indigo-100 text-indigo-700 border-indigo-200",
    closing: "bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300 border-stone-300 dark:border-stone-700",
  };
  const d = date ? new Date(date + "T00:00:00") : null;
  const dayLabel = d ? d.toLocaleDateString("zh-CN", { weekday: "short", month: "numeric", day: "numeric" }) : date;
  return (
    <div className="flex items-center gap-2 mt-1 mb-1">
      <Calendar className="h-3.5 w-3.5 text-stone-400 dark:text-stone-500 shrink-0" />
      <span className="text-[12.5px] font-medium">{name}</span>
      <span className="text-[11px] text-muted-foreground font-mono">{dayLabel}</span>
      <span className="text-[11px] font-mono text-stone-600 dark:text-stone-300">{start}–{end}</span>
      {type && (
        <span className={cn("text-[9.5px] font-mono uppercase px-1.5 py-0.5 rounded border", typeColors[type] ?? "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700")}>
          {type}
        </span>
      )}
    </div>
  );
}

function RolePreviewStrip({ action }: { action: Record<string, unknown> }) {
  const name = String(action.name ?? action.title ?? "");
  const icon = String(action.icon ?? "user");
  const color = String(action.color ?? "#44403c");
  const desc = String(action.description ?? action.des ?? "");
  return (
    <div className="flex items-center gap-2.5 mt-1 mb-1">
      <span className="w-7 h-7 rounded-[0.2rem] flex items-center justify-center shrink-0" style={{ background: color }}>
        <RoleIcon name={icon} className="h-3.5 w-3.5 text-white" />
      </span>
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold">{name}</div>
        {desc && <div className="text-[10.5px] text-muted-foreground truncate">{desc}</div>}
      </div>
    </div>
  );
}

function BuilderAddPreview({ action }: { action: Record<string, unknown> }) {
  const elements = Array.isArray(action.elements) ? action.elements as Array<Record<string, unknown>> : [];
  if (elements.length === 0) return null;
  return (
    <div className="mt-1 mb-1">
      <div className="text-[10.5px] text-muted-foreground font-mono mb-1">
        {elements.length} {elements.length === 1 ? "element" : "elements"}
      </div>
      <div className="flex flex-wrap gap-1">
        {elements.slice(0, 12).map((el, i) => {
          const type = String(el.type ?? "?");
          const props = (el.props ?? {}) as Record<string, unknown>;
          const tag = props.tag ? String(props.tag) : null;
          const label = tag ? `${type}/${tag}` : type;
          const content = el.content ? String(el.content).slice(0, 24) : null;
          return (
            <span key={i} className="inline-flex items-center gap-1.5 h-5 px-1.5 rounded-[0.2rem] bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-[10.5px]">
              <span className="font-mono text-stone-600 dark:text-stone-400">{label}</span>
              {content && <span className="text-stone-700 dark:text-stone-300 truncate max-w-[140px]">{content}</span>}
            </span>
          );
        })}
        {elements.length > 12 && (
          <span className="text-[10.5px] text-muted-foreground">+{elements.length - 12} more</span>
        )}
      </div>
    </div>
  );
}

function BuilderDeletePreview({ action }: { action: Record<string, unknown> }) {
  const targets = Array.isArray(action.targets) ? action.targets as unknown[] : [];
  if (targets.length === 0) return null;
  return (
    <div className="mt-1 mb-1 flex flex-wrap gap-1">
      {targets.map((t, i) => (
        <span key={i} className="inline-flex items-center h-5 px-1.5 rounded-[0.2rem] bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-[10.5px] font-mono">
          {String(t)}
        </span>
      ))}
    </div>
  );
}

// Renders a Claude-Code-style old/new diff for the editBuilderHtml action.
function BuilderEditPreview({ action }: { action: Record<string, unknown> }) {
  const oldStr = action.old_string == null ? "" : String(action.old_string);
  const newStr = action.new_string == null ? "" : String(action.new_string);
  const replaceAll = Boolean(action.replace_all);
  if (!oldStr && !newStr) return null;
  const MAX = 360;
  const clip = (s: string) => (s.length > MAX ? s.slice(0, MAX) + "…" : s);
  return (
    <div className="mt-1 mb-1 space-y-1">
      {replaceAll && (
        <div className="inline-flex items-center h-4 px-1.5 rounded-[0.2rem] bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300 text-[9.5px] font-mono uppercase tracking-wider">
          replace_all
        </div>
      )}
      <div className="rounded-[0.2rem] border border-red-200 dark:border-red-900 bg-red-50/60 dark:bg-red-950/30 px-2 py-1 font-mono text-[10.5px] text-red-800 dark:text-red-200 whitespace-pre-wrap break-all">
        <span className="select-none text-red-400 dark:text-red-500 mr-1">-</span>{clip(oldStr)}
      </div>
      <div className="rounded-[0.2rem] border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/30 px-2 py-1 font-mono text-[10.5px] text-emerald-800 dark:text-emerald-200 whitespace-pre-wrap break-all">
        <span className="select-none text-emerald-400 dark:text-emerald-500 mr-1">+</span>{clip(newStr)}
      </div>
    </div>
  );
}

function ActionApprovalCard({ action, onApprove, onReject, status, alreadyExecuted }: {
  action: Record<string, unknown>;
  onApprove: () => void;
  onReject: () => void;
  status: "pending" | "approved" | "rejected";
  alreadyExecuted?: boolean;
}) {
  const actionName = String(action.action ?? "unknown");
  const meta = ACTION_META[actionName];
  const [executing, setExecuting] = useState(false);
  const autoRan = useRef(!!alreadyExecuted);
  const isHighRisk = meta?.risk === "high";
  const isShiftAction = actionName === "addShift" || actionName === "updateShift";
  const isRoleAction = actionName === "addRole" || actionName === "updateRole";
  const isBuilderAdd = actionName === "addBuilderElement";
  const isBuilderDelete = actionName === "deleteBuilderElement";
  const isBuilderEdit = actionName === "editBuilderHtml";

  useEffect(() => {
    if (status !== "pending" || autoRan.current || isHighRisk) return;
    autoRan.current = true;
    setExecuting(true);
    Promise.resolve(onApprove()).finally(() => setExecuting(false));
  }, [status, onApprove, isHighRisk]);

  const displayFields = (meta?.fields ?? Object.keys(action).filter((k) => k !== "action"))
    .filter((k) => action[k] != null);

  const borderColor = status === "approved"
    ? "border-emerald-200 bg-emerald-50/50"
    : status === "rejected"
    ? "border-red-200 bg-red-50/50"
    : isHighRisk
    ? "border-amber-200 bg-amber-50/30"
    : "border-border bg-stone-50/60 dark:bg-stone-950/60";

  return (
    <div className={cn("rounded-[0.3rem] border p-3 mt-2", borderColor)}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className={cn(
          "h-6 px-2 rounded-[0.2rem] inline-flex items-center gap-1.5",
          status === "approved" ? "bg-emerald-100 border border-emerald-200 text-emerald-700" :
          status === "rejected" ? "bg-red-100 border border-red-200 text-red-700" :
          isHighRisk ? "bg-amber-100 border border-amber-200 text-amber-700" :
          "bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300"
        )}>
          {meta?.icon ?? <ArrowRight className="h-3 w-3" />}
          <span className="font-mono text-[10px] tracking-[0.06em] uppercase font-semibold">
            {meta?.label ?? actionName}
          </span>
        </span>
        {isHighRisk && status === "pending" && (
          <span className="text-[10px] font-mono text-amber-600 inline-flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> 需要确认
          </span>
        )}
        {executing && (
          <span className="text-[10.5px] font-mono text-muted-foreground inline-flex items-center gap-1 ml-auto">
            <Loader2 className="h-3 w-3 animate-spin" /> 执行中...
          </span>
        )}
        {status === "approved" && !executing && (
          <span className="text-[10.5px] font-mono text-emerald-600 inline-flex items-center gap-1 ml-auto">
            <Check className="h-3 w-3" /> 已执行
          </span>
        )}
        {status === "rejected" && (
          <span className="text-[10.5px] font-mono text-red-500 inline-flex items-center gap-1 ml-auto">
            <X className="h-3 w-3" /> 已撤销
          </span>
        )}
      </div>

      {/* Rich preview for specific action types */}
      {isShiftAction && status !== "rejected" && <ShiftPreviewStrip action={action} />}
      {isRoleAction && status !== "rejected" && <RolePreviewStrip action={action} />}
      {isBuilderAdd && status !== "rejected" && <BuilderAddPreview action={action} />}
      {isBuilderDelete && status !== "rejected" && <BuilderDeletePreview action={action} />}
      {isBuilderEdit && status !== "rejected" && <BuilderEditPreview action={action} />}

      {/* Field grid (skip fields already shown in rich preview) */}
      {!isShiftAction && !isRoleAction && !isBuilderAdd && !isBuilderDelete && !isBuilderEdit && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-2">
          {displayFields.map((key) => {
            const val = action[key];
            const display = formatActionValue(val);
            return (
              <div key={key} className={cn("flex items-baseline gap-1.5", Array.isArray(val) && typeof val[0] === "object" && "col-span-2")}>
                <span className="text-[10.5px] text-muted-foreground font-mono shrink-0">
                  {FIELD_LABELS[key] ?? key}
                </span>
                <span className="text-[12.5px] font-medium truncate">{display}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Approve / Reject buttons */}
      {status === "pending" && !executing && isHighRisk && (
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => { setExecuting(true); Promise.resolve(onApprove()).finally(() => setExecuting(false)); }}
            className="h-7 px-3 rounded-[0.3rem] border border-emerald-200 bg-emerald-50 text-emerald-700 text-[11px] font-semibold hover:bg-emerald-100 inline-flex items-center gap-1.5"
          >
            <Check className="h-3 w-3" /> 确认执行
          </button>
          <button
            onClick={onReject}
            className="h-7 px-3 rounded-[0.3rem] border border-border bg-background text-muted-foreground text-[11px] font-medium hover:bg-red-50 hover:text-red-600 hover:border-red-200 inline-flex items-center gap-1.5"
          >
            <X className="h-3 w-3" /> 取消
          </button>
        </div>
      )}
      {status === "approved" && !executing && (
        <button onClick={onReject}
          className="h-7 px-3 rounded-[0.3rem] border border-border bg-background text-muted-foreground text-[11px] font-medium hover:bg-red-50 hover:text-red-600 hover:border-red-200 mt-1">
          撤销
        </button>
      )}
    </div>
  );
}

const ACTION_CATEGORY_LABELS: Record<string, string> = {
  scheduling: "排班",
  roles: "岗位与任务",
  inventory: "库存",
  products: "商品",
  pricing: "价格与优惠券",
  suppliers: "供应商与采购",
  staffing: "员工",
  notifications: "通知",
};

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

const ACTION_RISK_LABELS: Record<string, string> = {
  low: "低",
  medium: "中",
  high: "高",
};

const ACTION_RISK_CLASS: Record<string, string> = {
  low: "border-emerald-200 bg-emerald-50 text-emerald-700",
  medium: "border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-950 text-stone-600 dark:text-stone-300",
  high: "border-amber-200 bg-amber-50 text-amber-700",
};

function ActionsListCard() {
  const catalog = getActionCatalog();
  const categoryOrder = ["scheduling", "staffing", "roles", "products", "inventory", "pricing", "suppliers", "notifications"];
  const grouped = categoryOrder
    .map((category) => ({ category, actions: catalog.filter((action) => action.category === category) }))
    .filter((group) => group.actions.length > 0);

  return (
    <div className="rounded-[0.3rem] border border-border bg-background overflow-hidden mt-2">
      <div className="px-3 py-2 border-b border-border flex items-center gap-2">
        <span className="h-5 px-1.5 rounded-[0.2rem] inline-flex items-center gap-1 bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300">
          <Sparkles className="h-[10px] w-[10px]" />
          <span className="font-mono text-[9px] tracking-[0.08em] uppercase font-semibold">ACTIONS</span>
        </span>
        <span className="text-[11px] text-muted-foreground font-mono">{catalog.length} 个可用动作</span>
      </div>
      <div className="max-h-[460px] overflow-y-auto">
        {grouped.map(({ category, actions }) => (
          <div key={category} className="border-b border-border last:border-b-0">
            <div className="px-3 py-2 bg-stone-50/70 dark:bg-stone-950/70 flex items-center gap-2">
              <span className="h-5 w-5 rounded-[0.2rem] border border-stone-200 dark:border-stone-700 bg-background text-stone-600 dark:text-stone-300 inline-flex items-center justify-center">
                {ACTION_CATEGORY_ICONS[category] ?? <ArrowRight className="h-[10px] w-[10px]" />}
              </span>
              <span className="text-[12px] font-semibold">{ACTION_CATEGORY_LABELS[category] ?? category}</span>
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
                      <code className="text-[12px] font-mono font-semibold text-stone-800 dark:text-stone-200 truncate">{action.name}</code>
                      <span className={cn(
                        "h-5 px-1.5 rounded-[0.2rem] border text-[9px] font-mono uppercase shrink-0",
                        ACTION_RISK_CLASS[action.riskLevel]
                      )}>
                        {ACTION_RISK_LABELS[action.riskLevel]}风险
                      </span>
                    </div>
                    <div className="text-[11.5px] text-muted-foreground leading-snug mt-1">
                      {action.description}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {required.map((param) => (
                        <span key={param.name} className="h-5 px-1.5 rounded-[0.2rem] border border-border bg-background text-[10px] font-mono inline-flex items-center">
                          {param.name}: {param.type}
                        </span>
                      ))}
                      {optional > 0 && (
                        <span className="h-5 px-1.5 rounded-[0.2rem] border border-border bg-stone-50 dark:bg-stone-950 text-[10px] font-mono text-muted-foreground inline-flex items-center">
                          +{optional} optional
                        </span>
                      )}
                      {permission !== "none" && (
                        <span className="h-5 px-1.5 rounded-[0.2rem] border border-border bg-stone-50 dark:bg-stone-950 text-[10px] font-mono text-muted-foreground inline-flex items-center">
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
    <div className="rounded-[0.3rem] border border-border bg-stone-50/60 dark:bg-stone-950/60 p-3 mt-2 space-y-3">
      <div className="flex items-center gap-2">
        <span className="h-5 px-1.5 rounded-[0.2rem] inline-flex items-center gap-1"
          style={{ background: M_ACC_SOFT, border: `1px solid ${M_ACC_BD}`, color: M_ACC }}>
          <span className="font-mono text-[9px] tracking-[0.08em] uppercase font-semibold">Q&A</span>
        </span>
        {!submitted && (
          <span className="text-[10.5px] text-muted-foreground font-mono">
            可多选 · 已选 {totalSelected} 项
          </span>
        )}
      </div>
      {items.map((item, qi) => (
        <div key={qi}>
          <p className="text-[13px] font-medium text-stone-800 dark:text-stone-200 mb-1.5">{item.q}</p>
          <div className="flex flex-wrap gap-1.5">
            {item.a.map((answer) => {
              const selected = (selections[qi] ?? []).includes(answer);
              return (
                <button
                  key={answer}
                  disabled={submitted}
                  onClick={() => handleToggle(qi, answer)}
                  className={cn(
                    "h-8 px-3 rounded-[0.3rem] text-[12px] font-medium transition-colors inline-flex items-center gap-1.5",
                    selected && !submitted
                      ? "bg-foreground text-background"
                      : submitted && selected
                      ? "bg-foreground text-background opacity-70"
                      : submitted
                      ? "border border-border bg-background text-muted-foreground opacity-50 cursor-not-allowed"
                      : "border border-border bg-background text-foreground hover:bg-muted"
                  )}
                >
                  {selected && <Check className="h-3 w-3" />}
                  {answer}
                </button>
              );
            })}
            {!submitted && (
              <button
                onClick={() => handleOtherToggle(qi)}
                className={cn(
                  "h-8 px-3 rounded-[0.3rem] text-[12px] font-medium transition-colors",
                  otherOpen[qi]
                    ? "bg-foreground text-background"
                    : "border border-dashed border-border bg-background text-muted-foreground hover:bg-muted"
                )}
              >
                Other...
              </button>
            )}
          </div>
          {otherOpen[qi] && !submitted && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <input
                type="text"
                value={otherText[qi] ?? ""}
                onChange={(e) => setOtherText((prev) => ({ ...prev, [qi]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") handleOtherConfirm(qi); }}
                placeholder="输入自定义回复..."
                className="flex-1 h-8 px-2.5 rounded-[0.3rem] border border-border bg-background text-[12px] outline-none focus:border-stone-400"
              />
              <button
                onClick={() => handleOtherConfirm(qi)}
                disabled={!(otherText[qi] ?? "").trim()}
                className="h-8 px-3 rounded-[0.3rem] bg-foreground text-background text-[12px] font-medium hover:bg-foreground/90 disabled:opacity-40"
              >
                <Check className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      ))}
      {!submitted && (
        <button
          disabled={!allAnswered}
          onClick={handleSubmit}
          className={cn(
            "h-9 w-full rounded-[0.3rem] text-[13px] font-medium transition-colors inline-flex items-center justify-center gap-2",
            allAnswered
              ? "bg-foreground text-background hover:bg-foreground/90"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
        >
          <Check className="h-3.5 w-3.5" />
          {allAnswered ? "提交" : "每题至少选择一项"}
        </button>
      )}
      {submitted && (
        <div className="text-[11px] font-mono text-emerald-600 inline-flex items-center gap-1">
          <Check className="h-3 w-3" /> 已提交
        </div>
      )}
    </div>
  );
}

// ── Roles & Tasks UI ──────────────────────────────────────────────────────

import type { QAItem, RoleAddCmd, TaskAddCmd } from "@/lib/merchiva/skills/types";

function RolesListCard({ roles }: { roles: Array<{ id: string; name: string; color: string; icon: string; description: string }> }) {
  return (
    <div className="rounded-[0.3rem] border border-border bg-background overflow-hidden mt-2">
      <div className="px-3 py-2 border-b border-border flex items-center gap-2">
        <span className="h-5 px-1.5 rounded-[0.2rem] inline-flex items-center gap-1 bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300">
          <Users className="h-[10px] w-[10px]" />
          <span className="font-mono text-[9px] tracking-[0.08em] uppercase font-semibold">ROLES</span>
        </span>
        <span className="text-[11px] text-muted-foreground font-mono">{roles.length} 个岗位</span>
      </div>
      {roles.length === 0 ? (
        <div className="px-3 py-4 text-center text-[12px] text-muted-foreground">暂无岗位</div>
      ) : (
        <div className="divide-y divide-border">
          {roles.map((role) => (
            <div key={role.id} className="px-3 py-2.5 flex items-center gap-3">
              <div className="h-8 w-8 shrink-0 flex items-center justify-center border rounded-[0.3rem]"
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

function RoleAddCard({ role, status, onDelete }: {
  role: RoleAddCmd;
  status: "pending" | "adding" | "added" | "rejected" | "deleting";
  onDelete: () => void;
}) {

  return (
    <div className={cn(
      "rounded-[0.3rem] border p-3 mt-2",
      status === "added" ? "border-emerald-200 bg-emerald-50/50" :
      status === "rejected" ? "border-red-200 bg-red-50/50" :
      "border-border bg-stone-50/60 dark:bg-stone-950/60"
    )}>
      <div className="flex items-center gap-2 mb-2.5">
        <span className="h-5 px-1.5 rounded-[0.2rem] inline-flex items-center gap-1 bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300">
          <Users className="h-[10px] w-[10px]" />
          <span className="font-mono text-[9px] tracking-[0.08em] uppercase font-semibold">NEW ROLE</span>
        </span>
        {status === "adding" && (
          <span className="text-[10.5px] font-mono text-muted-foreground inline-flex items-center gap-1 ml-auto">
            <Loader2 className="h-3 w-3 animate-spin" /> 添加中...
          </span>
        )}
        {status === "deleting" && (
          <span className="text-[10.5px] font-mono text-red-500 inline-flex items-center gap-1 ml-auto">
            <Loader2 className="h-3 w-3 animate-spin" /> 删除中...
          </span>
        )}
        {status === "added" && (
          <span className="text-[10.5px] font-mono text-emerald-600 inline-flex items-center gap-1 ml-auto">
            <Check className="h-3 w-3" /> 已添加
          </span>
        )}
        {status === "rejected" && (
          <span className="text-[10.5px] font-mono text-red-500 ml-auto">已删除</span>
        )}
      </div>
      <div className="flex items-center gap-3 mb-2">
        <div className="h-10 w-10 shrink-0 flex items-center justify-center border rounded-[0.3rem]"
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
          <MonoCap>职责</MonoCap>
          <div className="flex flex-wrap gap-1 mt-1">
            {role.tasks.split(",").map((t) => t.trim()).filter(Boolean).map((task) => (
              <span key={task} className="inline-flex items-center px-2 py-0.5 rounded-[0.2rem] border border-border bg-background text-[11px]">
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
      {status === "added" && (
        <button onClick={onDelete}
          className="h-7 px-3 mt-2.5 rounded-[0.3rem] border border-border bg-background text-muted-foreground text-[11px] font-medium hover:bg-red-50 hover:text-red-600 hover:border-red-200 inline-flex items-center gap-1.5">
          <Trash2 className="h-3 w-3" /> 删除
        </button>
      )}
    </div>
  );
}

// ── Task command UI ────────────────────────────────────────────────────────

function TasksListInline({ roleId, roleName }: { roleId: string; roleName: string }) {
  const [tasks, setTasks] = useState<Array<{ id: string; title: string; description: string; startTime: string | null; endTime: string | null; requiresEvidence: boolean }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRoleTasks(roleId)
      .then((t) => setTasks(t.map((tk) => ({
        id: tk.id, title: tk.title, description: tk.description,
        startTime: tk.startTime, endTime: tk.endTime,
        requiresEvidence: tk.requiresEvidence,
      }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [roleId]);

  if (loading) {
    return (
      <div className="rounded-[0.3rem] border border-border bg-stone-50/60 dark:bg-stone-950/60 p-3 mt-2 flex items-center gap-2 text-[12px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> 加载任务...
      </div>
    );
  }

  return <TasksListCard roleName={roleName} tasks={tasks} />;
}

function TasksListCard({ roleName, tasks: initialTasks }: {
  roleName: string;
  tasks: Array<{ id: string; title: string; description: string; startTime: string | null; endTime: string | null; requiresEvidence: boolean }>;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());

  const handleDelete = async (id: string) => {
    setDeleting((prev) => new Set(prev).add(id));
    try {
      await execDeleteRoleTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      console.error(`[TasksListCard] Failed to delete task:`, err);
      toast.error("删除任务失败");
    } finally {
      setDeleting((prev) => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  return (
    <div className="rounded-[0.3rem] border border-border bg-background overflow-hidden mt-2">
      <div className="px-3 py-2 border-b border-border flex items-center gap-2">
        <span className="h-5 px-1.5 rounded-[0.2rem] inline-flex items-center gap-1 bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300">
          <Clipboard className="h-[10px] w-[10px]" />
          <span className="font-mono text-[9px] tracking-[0.08em] uppercase font-semibold">TASKS</span>
        </span>
        <span className="text-[12px] font-medium">{roleName}</span>
        <span className="text-[10.5px] text-muted-foreground font-mono ml-auto">{tasks.length} 项</span>
      </div>
      {tasks.length === 0 ? (
        <div className="px-3 py-4 text-center text-[12px] text-muted-foreground">该岗位暂无任务</div>
      ) : (
        <div className="divide-y divide-border">
          {tasks.map((task) => (
            <div key={task.id} className="px-3 py-2.5 flex items-center gap-3 group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-[12.5px] font-medium leading-tight">{task.title}</div>
                  {task.requiresEvidence && (
                    <span className="h-4 px-1 rounded-[0.2rem] bg-amber-50 border border-amber-200 text-amber-700 text-[8px] font-mono uppercase inline-flex items-center">
                      证明
                    </span>
                  )}
                </div>
                {task.description && (
                  <div className="text-[10.5px] text-muted-foreground leading-tight mt-0.5 truncate">{task.description}</div>
                )}
              </div>
              {task.startTime && (
                <span className="text-[10.5px] font-mono text-muted-foreground tabular-nums shrink-0">
                  {task.startTime}–{task.endTime ?? ""}
                </span>
              )}
              <button
                onClick={() => handleDelete(task.id)}
                disabled={deleting.has(task.id)}
                className="h-6 w-6 shrink-0 rounded-[0.2rem] flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              >
                {deleting.has(task.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TaskAddCard({ task, roleColor, status, onDelete }: {
  task: TaskAddCmd;
  roleColor: string;
  status: "pending" | "adding" | "added" | "rejected" | "deleting";
  onDelete: () => void;
}) {

  return (
    <div className={cn(
      "rounded-[0.3rem] border p-3 mt-2",
      status === "added" ? "border-emerald-200 bg-emerald-50/50" :
      status === "rejected" ? "border-red-200 bg-red-50/50" :
      "border-border bg-stone-50/60 dark:bg-stone-950/60"
    )}>
      <div className="flex items-center gap-2 mb-2.5">
        <span className="h-5 px-1.5 rounded-[0.2rem] inline-flex items-center gap-1 bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300">
          <Clipboard className="h-[10px] w-[10px]" />
          <span className="font-mono text-[9px] tracking-[0.08em] uppercase font-semibold">NEW TASK</span>
        </span>
        <span className="text-[11px] text-muted-foreground">→ {task.role}</span>
        {status === "adding" && (
          <span className="text-[10.5px] font-mono text-muted-foreground inline-flex items-center gap-1 ml-auto">
            <Loader2 className="h-3 w-3 animate-spin" /> 添加中...
          </span>
        )}
        {status === "deleting" && (
          <span className="text-[10.5px] font-mono text-red-500 inline-flex items-center gap-1 ml-auto">
            <Loader2 className="h-3 w-3 animate-spin" /> 删除中...
          </span>
        )}
        {status === "added" && (
          <span className="text-[10.5px] font-mono text-emerald-600 inline-flex items-center gap-1 ml-auto">
            <Check className="h-3 w-3" /> 已添加
          </span>
        )}
        {status === "rejected" && (
          <span className="text-[10.5px] font-mono text-red-500 ml-auto">已删除</span>
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
        {task.requiresEvidence && (
          <span className="h-5 px-1.5 rounded-[0.2rem] bg-amber-50 border border-amber-200 text-amber-700 text-[9px] font-mono uppercase inline-flex items-center gap-1">
            <Camera className="h-[10px] w-[10px]" /> 需要证明
          </span>
        )}
      </div>
      {status === "added" && (
        <button onClick={onDelete}
          className="h-7 px-3 rounded-[0.3rem] border border-border bg-background text-muted-foreground text-[11px] font-medium hover:bg-red-50 hover:text-red-600 hover:border-red-200 inline-flex items-center gap-1.5">
          <Trash2 className="h-3 w-3" /> 删除
        </button>
      )}
    </div>
  );
}

function CommandGroup({ roles, tasks, staffRolesRef, alreadyExecuted, rejectedRoles, rejectedTasks, onRejectRole, onRejectTask }: {
  roles?: RoleAddCmd[];
  tasks?: TaskAddCmd[];
  staffRolesRef: React.RefObject<Array<{ id: unknown; name: string; color: string; icon: string; description: string }>>;
  alreadyExecuted?: boolean;
  rejectedRoles?: number[];
  rejectedTasks?: number[];
  onRejectRole?: (index: number) => void;
  onRejectTask?: (index: number) => void;
}) {
  const rejRoles = new Set(rejectedRoles ?? []);
  const rejTasks = new Set(rejectedTasks ?? []);
  const safeRoles = roles ?? [];
  const safeTasks = tasks ?? [];

  type Status = "pending" | "adding" | "added" | "rejected" | "deleting";
  const [roleStatuses, setRoleStatuses] = useState<Record<number, Status>>(
    () => Object.fromEntries(safeRoles.map((_, i) => [i, rejRoles.has(i) ? "rejected" : alreadyExecuted ? "added" : "pending"]))
  );
  const [taskStatuses, setTaskStatuses] = useState<Record<number, Status>>(
    () => Object.fromEntries(safeTasks.map((_, i) => [i, rejTasks.has(i) ? "rejected" : alreadyExecuted ? "added" : "pending"]))
  );
  const autoRan = useRef(!!alreadyExecuted);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getDbRoles = useCallback((): any[] => {
    try {
      const c = getConnection();
      if (!c) return staffRolesRef.current;
      return Array.from((c as any).db.staffRole.iter());
    } catch { return staffRolesRef.current; }
  }, [staffRolesRef]);

  const findRoleByName = useCallback((name: string) => {
    const lower = name.toLowerCase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return getDbRoles().find((r: any) => r?.name?.toLowerCase() === lower);
  }, [getDbRoles]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getDbTasks = useCallback((): any[] => {
    try {
      const c = getConnection();
      if (!c) return [];
      return Array.from((c as any).db.roleTask.iter());
    } catch { return []; }
  }, []);

  const handleDeleteRole = useCallback(async (i: number) => {
    const role = safeRoles[i];
    if (!role) return;
    setRoleStatuses((prev) => ({ ...prev, [i]: "deleting" }));
    try {
      const found = findRoleByName(role.title);
      if (found) await execDeleteStaffRole(String(found.id));
      setRoleStatuses((prev) => ({ ...prev, [i]: "rejected" }));
      onRejectRole?.(i);
    } catch (err) {
      console.error(`[CommandGroup] Failed to delete role "${role.title}":`, err);
      toast.error(`删除岗位失败`);
      setRoleStatuses((prev) => ({ ...prev, [i]: "added" }));
    }
  }, [safeRoles, findRoleByName, onRejectRole]);

  const handleDeleteTask = useCallback(async (i: number) => {
    const task = safeTasks[i];
    if (!task) return;
    setTaskStatuses((prev) => ({ ...prev, [i]: "deleting" }));
    try {
      const role = findRoleByName(task.role);
      const roleId = role ? String(role.id) : null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dbTask = getDbTasks().find((t: any) =>
        t?.title === task.title && (roleId ? String(t?.roleId) === roleId : true)
      );
      if (dbTask) await execDeleteRoleTask(String(dbTask.id));
      setTaskStatuses((prev) => ({ ...prev, [i]: "rejected" }));
      onRejectTask?.(i);
    } catch (err) {
      console.error(`[CommandGroup] Failed to delete task "${task.title}":`, err);
      toast.error(`删除任务失败`);
      setTaskStatuses((prev) => ({ ...prev, [i]: "added" }));
    }
  }, [safeTasks, findRoleByName, getDbTasks, onRejectTask]);

  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;

    (async () => {
      // Step 1: create roles sequentially
      for (let i = 0; i < safeRoles.length; i++) {
        if (rejRoles.has(i)) continue;
        const role = safeRoles[i];
        setRoleStatuses((prev) => ({ ...prev, [i]: "adding" }));
        try {
          if (!findRoleByName(role.title)) {
            await execAddStaffRole({
              name: role.title,
              color: role.color,
              icon: role.icon,
              description: role.des,
              permissions: JSON.stringify([]),
            });
          }
          for (let attempt = 0; attempt < 15; attempt++) {
            if (findRoleByName(role.title)) break;
            await new Promise((r) => setTimeout(r, 400));
          }
          setRoleStatuses((prev) => ({ ...prev, [i]: "added" }));
        } catch (err) {
          console.error(`[CommandGroup] Failed to create role "${role.title}":`, err);
          setRoleStatuses((prev) => ({ ...prev, [i]: "pending" }));
        }
      }

      // Step 2: add tasks — resolve role by exact name, skip duplicates
      for (let i = 0; i < safeTasks.length; i++) {
        if (rejTasks.has(i)) continue;
        const task = safeTasks[i];
        setTaskStatuses((prev) => ({ ...prev, [i]: "adding" }));
        try {
          let found = findRoleByName(task.role);
          if (!found) {
            for (let attempt = 0; attempt < 15; attempt++) {
              await new Promise((r) => setTimeout(r, 400));
              found = findRoleByName(task.role);
              if (found) break;
            }
          }
          if (!found) {
            console.error(`[CommandGroup] Role not found for task "${task.title}": "${task.role}"`);
            toast.error(`找不到岗位「${task.role}」`);
            setTaskStatuses((prev) => ({ ...prev, [i]: "pending" }));
            continue;
          }
          const roleId = String(found.id);
          const titleLower = task.title.toLowerCase();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const duplicate = getDbTasks().find((t: any) =>
            t?.title?.toLowerCase() === titleLower && String(t?.roleId) === roleId
          );
          if (duplicate) {
            setTaskStatuses((prev) => ({ ...prev, [i]: "added" }));
            continue;
          }
          await execAddRoleTask({
            roleId,
            title: task.title,
            description: task.des,
            startTime: task.startTime,
            endTime: task.endTime,
            sortOrder: i,
            requiresEvidence: task.requiresEvidence,
            notifyChats: [],
          });
          setTaskStatuses((prev) => ({ ...prev, [i]: "added" }));
        } catch (err) {
          console.error(`[CommandGroup] Failed to add task "${task.title}":`, err);
          setTaskStatuses((prev) => ({ ...prev, [i]: "pending" }));
        }
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {safeRoles.map((role, i) => (
        <RoleAddCard
          key={`r-${i}`}
          role={role}
          status={roleStatuses[i] ?? "pending"}
          onDelete={() => handleDeleteRole(i)}
        />
      ))}
      {safeTasks.map((task, i) => {
        const matchedRole = findRoleByName(task.role);
        return (
          <TaskAddCard
            key={`t-${i}`}
            task={task}
            roleColor={matchedRole?.color ?? "#44403c"}
            status={taskStatuses[i] ?? "pending"}
            onDelete={() => handleDeleteTask(i)}
          />
        );
      })}
    </>
  );
}

// ── Task delete group ─────────────────────────────────────────────────────

function TaskDeleteGroup({ deletes, alreadyExecuted }: {
  deletes: TaskDeleteCmd[];
  alreadyExecuted?: boolean;
}) {
  type Status = "pending" | "deleting" | "deleted" | "failed";
  const [statuses, setStatuses] = useState<Record<number, Status>>(
    () => Object.fromEntries(deletes.map((_, i) => [i, alreadyExecuted ? "deleted" : "pending"]))
  );
  const autoRan = useRef(!!alreadyExecuted);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getDbRoles = (): any[] => {
    try {
      const c = getConnection();
      if (!c) return [];
      return Array.from((c as any).db.staffRole.iter());
    } catch { return []; }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getDbTasks = (): any[] => {
    try {
      const c = getConnection();
      if (!c) return [];
      return Array.from((c as any).db.roleTask.iter());
    } catch { return []; }
  };

  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;

    (async () => {
      for (let i = 0; i < deletes.length; i++) {
        const del = deletes[i];
        setStatuses((prev) => ({ ...prev, [i]: "deleting" }));
        try {
          const roleLower = del.role.toLowerCase();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const role = getDbRoles().find((r: any) => r?.name?.toLowerCase() === roleLower);
          const roleId = role ? String(role.id) : null;
          const titleLower = del.title.toLowerCase();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const dbTask = getDbTasks().find((t: any) =>
            t?.title?.toLowerCase() === titleLower && (roleId ? String(t?.roleId) === roleId : true)
          );
          if (dbTask) {
            await execDeleteRoleTask(String(dbTask.id));
            setStatuses((prev) => ({ ...prev, [i]: "deleted" }));
          } else {
            console.warn(`[TaskDeleteGroup] Task not found: "${del.title}" in role "${del.role}"`);
            setStatuses((prev) => ({ ...prev, [i]: "deleted" }));
          }
        } catch (err) {
          console.error(`[TaskDeleteGroup] Failed to delete "${del.title}":`, err);
          setStatuses((prev) => ({ ...prev, [i]: "failed" }));
        }
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {deletes.map((del, i) => (
        <div key={`del-${i}`} className={cn(
          "rounded-[0.3rem] border p-3 mt-2",
          statuses[i] === "deleted" ? "border-red-200 bg-red-50/50" :
          statuses[i] === "failed" ? "border-amber-200 bg-amber-50/50" :
          "border-border bg-stone-50/60 dark:bg-stone-950/60"
        )}>
          <div className="flex items-center gap-2">
            <span className="h-5 px-1.5 rounded-[0.2rem] inline-flex items-center gap-1 bg-red-100 border border-red-200 text-red-600">
              <Trash2 className="h-[10px] w-[10px]" />
              <span className="font-mono text-[9px] tracking-[0.08em] uppercase font-semibold">DELETE</span>
            </span>
            <span className="text-[12px] font-medium truncate">{del.title}</span>
            <span className="text-[11px] text-muted-foreground">← {del.role}</span>
            {statuses[i] === "deleting" && (
              <span className="text-[10.5px] font-mono text-muted-foreground inline-flex items-center gap-1 ml-auto">
                <Loader2 className="h-3 w-3 animate-spin" /> 删除中...
              </span>
            )}
            {statuses[i] === "deleted" && (
              <span className="text-[10.5px] font-mono text-red-500 inline-flex items-center gap-1 ml-auto">
                <Check className="h-3 w-3" /> 已删除
              </span>
            )}
            {statuses[i] === "failed" && (
              <span className="text-[10.5px] font-mono text-amber-600 ml-auto">删除失败</span>
            )}
          </div>
        </div>
      ))}
    </>
  );
}

// ── Markdown renderer ──────────────────────────────────────────────────────

const mdComponents: Record<string, React.ComponentType<React.HTMLAttributes<HTMLElement> & { href?: string; children?: React.ReactNode }>> = {
  p: ({ children, ...props }) => <p className="mb-1.5 last:mb-0" {...props}>{children}</p>,
  strong: ({ children, ...props }) => <strong className="font-semibold" {...props}>{children}</strong>,
  em: ({ children, ...props }) => <em {...props}>{children}</em>,
  ul: ({ children, ...props }) => <ul className="list-disc pl-4 mb-1.5 last:mb-0 space-y-0.5" {...props}>{children}</ul>,
  ol: ({ children, ...props }) => <ol className="list-decimal pl-4 mb-1.5 last:mb-0 space-y-0.5" {...props}>{children}</ol>,
  li: ({ children, ...props }) => <li className="text-[13.5px]" {...props}>{children}</li>,
  code: ({ children, className, ...props }) => {
    if (className?.includes("language-")) {
      return <code className="block bg-stone-100 dark:bg-stone-800 rounded-[0.3rem] p-2 text-[11px] font-mono text-stone-700 dark:text-stone-300 overflow-x-auto my-1.5" {...props}>{children}</code>;
    }
    return <code className="bg-stone-100 dark:bg-stone-800 rounded-[0.2rem] px-1 py-0.5 text-[12px] font-mono text-stone-700 dark:text-stone-300" {...props}>{children}</code>;
  },
  pre: ({ children, ...props }) => <pre className="mb-1.5 last:mb-0" {...props}>{children}</pre>,
  h1: ({ children, ...props }) => <h1 className="text-[16px] font-semibold mb-1" {...props}>{children}</h1>,
  h2: ({ children, ...props }) => <h2 className="text-[15px] font-semibold mb-1" {...props}>{children}</h2>,
  h3: ({ children, ...props }) => <h3 className="text-[14px] font-semibold mb-1" {...props}>{children}</h3>,
  blockquote: ({ children, ...props }) => <blockquote className="border-l-2 border-stone-300 dark:border-stone-700 pl-3 text-stone-600 dark:text-stone-300 my-1.5" {...props}>{children}</blockquote>,
  table: ({ children, ...props }) => <div className="overflow-x-auto my-1.5"><table className="text-[12px] w-full border-collapse" {...props}>{children}</table></div>,
  th: ({ children, ...props }) => <th className="text-left px-2 py-1 border-b border-border font-semibold text-[11px] font-mono uppercase text-stone-500 dark:text-stone-400" {...props}>{children}</th>,
  td: ({ children, ...props }) => <td className="px-2 py-1 border-b border-border/50" {...props}>{children}</td>,
  hr: (props) => <hr className="border-border my-2" {...props} />,
  a: ({ children, href, ...props }) => <a href={href} target="_blank" rel="noopener noreferrer" className="underline text-stone-700 dark:text-stone-300 hover:text-foreground" {...props}>{children}</a>,
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
    return msgs.map((m) => ({ ...m, executed: true }));
  } catch { return []; }
}

function expandHistoryFromMessages(
  messages: ChatMessage[],
): Array<{ role: "user" | "assistant"; content: string }> {
  const out: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const m of messages) {
    if (m.from === "system") continue;
    if (m.from === "voice-call") {
      for (const turn of m.voiceCall?.turns ?? []) {
        if (turn.user) out.push({ role: "user", content: turn.user });
        if (turn.ai) out.push({ role: "assistant", content: turn.ai });
      }
      continue;
    }
    if (!m.text) continue;
    out.push({
      role: m.from === "user" ? "user" : "assistant",
      content: m.text,
    });
  }
  return out;
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
function shortSelector(selector: string): string {
  const trimmed = selector.replace(/^#__merchiva_root\s*>\s*/, "");
  if (trimmed.length <= 20) return trimmed;
  return "…" + trimmed.slice(-19);
}

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

export interface BuilderModeContext {
  siteId: string;
  siteName: string;
  pageId: string;
  pageName: string;
  // Legacy Craft.js path — empty array when in HTML mode.
  elements: Array<{ name: string; type: string; props: Record<string, unknown> }>;
  theme?: Record<string, unknown>;
  // HTML mode — present means the AI should use setBuilderHtml/replaceBuilderHtml etc.
  html?: string;
  // Currently selected element's CSS selector in HTML mode (helps the AI target edits)
  selectedSelector?: string | null;
  // Site-wide values authored in the Values panel. Keys can be referenced in
  // HTML as `{key}` and are resolved at render time alongside system values
  // like {userName}, {siteName}, {currentYear}.
  customValues?: Record<string, string>;
  // All pages in the current site so the AI can switch / delete by id.
  pages?: Array<{ id: string; name: string; slug: string }>;
  // Names of FlowFn functions stored in this site's local list — the AI uses
  // these to know what to edit (replace by name) or delete.
  functions?: string[];
  // Page SEO metadata so the AI sees current title/description/OG fields and
  // can update them via updateBuilderPage.
  pageSlug?: string;
  pageMetadata?: Record<string, string | undefined>;
  // Site identity + plugin flags so the AI can update them via updateBuilderSite.
  siteSlug?: string;
  customDomain?: string | null;
  sitePublished?: boolean;
  siteFeatures?: Record<string, boolean>;
}

export function MerchivaChat({
  compact = false,
  header = true,
  builderContext,
}: {
  compact?: boolean;
  header?: boolean;
  builderContext?: BuilderModeContext;
} = {}) {
  const { currentOrg, organizationId, isOwner, role: orgRole, permissions: userPermissions } = usePermissions();
  const { locale } = useI18n();
  const t = useT();
  const builderMode = !!builderContext;
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [thinkingPhase, setThinkingPhase] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [callOpen, setCallOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Session management
  // useAiChatSessions() returns [rows[], boolean] from useTable
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionsTuple = useAiChatSessions() as any;
  const sessionRows: any[] = Array.isArray(sessionsTuple) && Array.isArray(sessionsTuple[0]) ? sessionsTuple[0] : (Array.isArray(sessionsTuple) ? sessionsTuple : []);
  const sessionsReady = Array.isArray(sessionsTuple) && sessionsTuple[1] === true;
  const mySessions = useMemo(() => {
    if (!organizationId || !sessionRows) return [];
    return sessionRows
      .filter((s: any) => s && s.organizationId === organizationId)
      .sort((a: any, b: any) => {
        const ta = typeof a.updatedAt === "object" && "microsSinceUnixEpoch" in a.updatedAt ? Number(a.updatedAt.microsSinceUnixEpoch) : 0;
        const tb = typeof b.updatedAt === "object" && "microsSinceUnixEpoch" in b.updatedAt ? Number(b.updatedAt.microsSinceUnixEpoch) : 0;
        return tb - ta;
      });
  }, [sessionRows, organizationId]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionListOpen, setSessionListOpen] = useState(false);
  const sessionInitDone = useRef(false);
  // Session-level circuit breaker for the background-enqueue path. If the
  // server returns 501 "reducer_missing" once, we know the SpacetimeDB module
  // isn't republished yet and skip the enqueue call entirely until the page
  // is reloaded — sendMessage falls straight through to the streaming route.
  const enqueueDisabledRef = useRef(false);

  // Builder mode uses site-scoped localStorage instead of SpacetimeDB sessions
  const builderStorageKey = builderMode ? `merchiva_builder_chat_${builderContext!.siteId}` : null;

  // Initialize: load most recent session or create one (or hydrate from localStorage in builder mode)
  useEffect(() => {
    if (sessionInitDone.current) return;
    if (builderMode && builderStorageKey) {
      try {
        const raw = localStorage.getItem(builderStorageKey);
        if (raw) setMessages(parseSessionMessages(raw));
      } catch {}
      sessionInitDone.current = true;
      return;
    }
    if (!organizationId || !sessionsReady) return;
    if (mySessions.length > 0) {
      const latest = mySessions.find((s: any) => !s.archived) ?? mySessions[0];
      const sid = latest.id.toHexString ? latest.id.toHexString() : String(latest.id);
      setActiveSessionId(sid);
      setMessages(parseSessionMessages(latest.messages));
      sessionInitDone.current = true;
    } else if (getConnection()) {
      execCreateSession("New conversation").catch(() => {});
      sessionInitDone.current = true;
    }
  }, [organizationId, mySessions, sessionsReady, builderMode, builderStorageKey]);

  // When sessions update and we just created one, pick the newest (skip in builder mode)
  useEffect(() => {
    if (builderMode) return;
    if (activeSessionId || !sessionInitDone.current || mySessions.length === 0) return;
    const latest = mySessions[0];
    const sid = latest.id.toHexString ? latest.id.toHexString() : String(latest.id);
    setActiveSessionId(sid);
    setMessages(parseSessionMessages(latest.messages));
  }, [mySessions, activeSessionId, builderMode]);

  // Save messages on change — to SpacetimeDB session or to localStorage (builder mode)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (messages.length === 0) return;
    if (builderMode && builderStorageKey) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        try {
          localStorage.setItem(builderStorageKey, JSON.stringify(messages.slice(-50)));
        } catch {}
      }, 500);
      return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
    }
    if (!activeSessionId || !organizationId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const json = JSON.stringify(messages.slice(-50));
      execSaveSession(activeSessionId, json).catch(() => {});
    }, 1000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [messages, activeSessionId, organizationId, builderMode, builderStorageKey]);

  const switchSession = useCallback((sessionId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = mySessions.find((s: any) => {
      const sid = s.id.toHexString ? s.id.toHexString() : String(s.id);
      return sid === sessionId;
    });
    setActiveSessionId(sessionId);
    setMessages(session ? parseSessionMessages(session.messages) : []);
    setSessionListOpen(false);
  }, [mySessions]);

  const handleNewChat = useCallback(async () => {
    if (builderMode && builderStorageKey) {
      try { localStorage.removeItem(builderStorageKey); } catch {}
      setMessages([]);
      return;
    }
    if (activeSessionId && messages.length > 0) {
      const json = JSON.stringify(messages.slice(-50));
      execSaveSession(activeSessionId, json).catch(() => {});
    }
    setActiveSessionId(null);
    setMessages([]);
    execCreateSession("New conversation").catch(() => {});
    setSessionListOpen(false);
  }, [activeSessionId, messages, builderMode, builderStorageKey]);

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

  // Element picker (builder mode only) — lets the user click any element in
  // the canvas iframe and attach it as context to the next prompt.
  const [pickMode, setPickMode] = useState(false);
  const [attachedElements, setAttachedElements] = useState<Array<{ selector: string; tag: string; outerHtml: string }>>([]);

  // Listen for picked elements dispatched by html-editor when pickMode is active.
  useEffect(() => {
    function onPicked(e: Event) {
      const detail = (e as CustomEvent).detail as { selector?: string; tag?: string; outerHtml?: string } | undefined;
      if (!detail?.selector) return;
      setAttachedElements((prev) =>
        prev.some((el) => el.selector === detail.selector)
          ? prev
          : [...prev, { selector: detail.selector!, tag: detail.tag ?? "?", outerHtml: detail.outerHtml ?? "" }],
      );
      setPickMode(false);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("builder:set-pick-mode", { detail: { active: false } }));
      }
    }
    window.addEventListener("builder:element-picked", onPicked);
    return () => window.removeEventListener("builder:element-picked", onPicked);
  }, []);

  // Esc cancels pick mode.
  useEffect(() => {
    if (!pickMode) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setPickMode(false);
        window.dispatchEvent(new CustomEvent("builder:set-pick-mode", { detail: { active: false } }));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickMode]);

  const togglePickMode = useCallback(() => {
    setPickMode((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("builder:set-pick-mode", { detail: { active: next } }));
      }
      return next;
    });
  }, []);

  const removeAttachedElement = useCallback((idx: number) => {
    setAttachedElements((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const orgName = currentOrg?.name ?? "your store";

  const { items: invItems } = useInventory(organizationId);
  const { history: salesHistory, hourly: salesHourly } = useSales();
  const { shifts, team, presets: shiftPresets, allAvailability, myTimeOffRequests: timeOffRequests, orgShiftTrades: shiftTrades } = useStaffing(organizationId, null, false);
  const { products } = useProducts(organizationId);
  const [rawNotifs] = useNotifications();
  // Settings row for this org — opening hours + country code for holiday lookup.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [settingsRows] = useSettingsRows() as any;
   
  const orgSettings = useMemo(() => (Array.isArray(settingsRows)
    ? settingsRows.find((s: any) => s?.organizationId === organizationId)
    : undefined), [settingsRows, organizationId]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const staffRoles = (useStaffRoles() as any[] || []).filter((r: any) => r && typeof r === "object" && r.name) as Array<{ id: any; name: string; color: string; icon: string; description: string; permissions: string }>;
  const staffRolesRef = useRef(staffRoles);
  staffRolesRef.current = staffRoles;
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
  const today = new Date().toISOString().slice(0, 10);
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
      openingHours,
      hoursStatus,
      countryCode,
      upcomingHolidays,
      inventory: invItems.slice(0, 50).map((i) => ({
        id: i.id, name: i.name, category: i.category, stock: i.currentStock,
        min: i.minStock, max: i.maxStock, unit: i.unit, supplier: i.supplier,
        status: i.status,
      })),
      todayShifts: shifts.filter((s) => s.date === today).map((s) => ({
        id: s.id, name: s.staffName, role: s.staffRoles.join(", "), start: s.startTime, end: s.endTime, type: s.shiftType,
      })),
      upcomingShifts: shifts.filter((s) => s.date > today).slice(0, 30).map((s) => ({
        id: s.id, name: s.staffName, date: s.date, start: s.startTime, end: s.endTime, type: s.shiftType,
      })),
      team: team.map((m) => ({ id: m.id, name: m.displayName, role: m.role })),
      recentSales: salesHistory.slice(-7).map((s) => ({ date: s.date, revenue: s.actual })),
      todaySales: salesHourly.map((s) => ({ hour: s.hour, revenue: s.actual })),
      products: products.slice(0, 30).map((p) => ({ id: p.id, name: p.name, price: p.price, category: p.category })),
      unreadNotifications: rawNotifs.filter((n) => !n.read).length,
      insights: insights.map((i) => ({ type: i.type, title: i.title, severity: i.severity })),
      // Roles with IDs and tasks
      roles: staffRoles.map((r) => ({
        id: String(r.id), name: r.name, color: r.color, icon: r.icon, description: r.description,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tasks: roleTasks.filter((t: any) => t.roleId === String(r.id)).map((t: any) => ({
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
            .filter((o) => o.dayId === d.id)
            .map((o) => ({ id: o.id, text: o.text, mediaType: o.mediaType })),
        })),
      },
      // Builder mode: editing a website page in the visual builder
      builder: builderContext ? {
        siteId: builderContext.siteId,
        siteName: builderContext.siteName,
        pageId: builderContext.pageId,
        pageName: builderContext.pageName,
        elements: builderContext.elements,
        theme: builderContext.theme,
        // HTML mode fields — only set when the editor is in HTML mode
        html: builderContext.html,
        selectedSelector: builderContext.selectedSelector,
        mode: builderContext.html != null ? "html" : "craft",
        // Global values — AI can reference these as {key} in HTML output
        customValues: builderContext.customValues,
        // Page list (for addBuilderPage / deleteBuilderPage)
        pages: builderContext.pages,
        // FlowFn function names (for addBuilderFunction replace + deleteBuilderFunction)
        functions: builderContext.functions,
        // Page metadata + site identity / plugins (for updateBuilderPage / updateBuilderSite)
        pageSlug: builderContext.pageSlug,
        pageMetadata: builderContext.pageMetadata,
        siteSlug: builderContext.siteSlug,
        customDomain: builderContext.customDomain,
        sitePublished: builderContext.sitePublished,
        siteFeatures: builderContext.siteFeatures,
      } : undefined,
    };
  }, [orgName, today, invItems, shifts, team, salesHistory, salesHourly, products, rawNotifs, insights, staffRoles, roleTasks, shiftPresets, allAvailability, timeOffRequests, shiftTrades, trainingDays, trainingObjectives, builderContext, orgSettings, locale]);

  // Scroll to bottom only when a new message is added
  const prevMsgCount = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMsgCount.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevMsgCount.current = messages.length;
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
      const res = await fetch("/api/store-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summarize: { prevSummary: mem.summary, newMessages: buf } }),
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
  }, [organizationId, activeSessionId, messages]);

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
      alert("Your browser doesn't support voice input.");
      return;
    }
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = locale === "zh" ? "zh-CN"
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
  }, [locale]);

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aiJobsTuple = useAiJobs() as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aiJobRows: any[] = Array.isArray(aiJobsTuple) && Array.isArray(aiJobsTuple[0])
    ? aiJobsTuple[0]
    : (Array.isArray(aiJobsTuple) ? aiJobsTuple : []);
  const renderedJobIdsRef = useRef<Set<string>>(new Set());
  const finalizedJobIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!organizationId || !activeSessionId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const myJobs = aiJobRows.filter((j: any) => j && j.organizationId === organizationId && j.sessionId === activeSessionId);
    if (myJobs.length === 0) return;

    for (const job of myJobs) {
      const jobId = job.id?.toHexString ? job.id.toHexString() : String(job.id);
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
          return [...prev, {
            id: msgId,
            from: "merchiva" as const,
            text: "",
            time: new Date().toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }),
          }];
        });
      }

      // 2) Live partial text — strip action JSON for display.
      if (!isDone) {
        const visible = extractActionBlocks(String(job.partialText ?? "")).cleanText;
        const display = visible || (job.partialText?.length > 0 ? "..." : "");
        setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, text: display } : m)));
        continue;
      }

      // 3) Done / failed — finalize once.
      if (finalizedJobIdsRef.current.has(jobId)) continue;
      finalizedJobIdsRef.current.add(jobId);

      if (job.status === "failed") {
        setMessages((prev) => prev.map((m) => (
          m.id === msgId
            ? { ...m, text: t("merchiva.errorNoResponse") + (job.error ? ` (${String(job.error).slice(0, 200)})` : "") }
            : m
        )));
        consumeAiJob(jobId).catch(() => {});
        continue;
      }

      const finalText = String(job.finalText ?? job.partialText ?? "");
      if (!finalText.trim()) {
        setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, text: t("merchiva.errorNoResponse") } : m)));
        consumeAiJob(jobId).catch(() => {});
        continue;
      }

      const parsed = parseAllSkills(finalText);
      if (organizationId && parsed.memoryUpdates.length > 0) {
        for (const update of parsed.memoryUpdates) saveMemoryField(organizationId, update.field, update.value);
      }
      const hasStructured = parsed.actions.length > 0 || parsed.rolesAdd.length > 0 ||
        parsed.tasksAdd.length > 0 || parsed.tasksDelete.length > 0 || parsed.questions.length > 0 || parsed.actionsList;
      const displayText = parsed.cleanText || (
        parsed.actionsList && parsed.actions.length === 0
          ? "这是当前可用的全部 AI actions："
          : hasStructured ? "" : finalText.trim()
      );
      setMessages((prev) => prev.map((m) => (
        m.id === msgId
          ? {
              ...m,
              from: parsed.actionsList && parsed.actions.length === 0 ? "system" : m.from,
              text: displayText,
              actions: parsed.actions.length > 0 ? parsed.actions : undefined,
              actionsList: parsed.actionsList || undefined,
              questions: parsed.questions.length > 0 ? parsed.questions : undefined,
              rolesAdd: parsed.rolesAdd.length > 0 ? parsed.rolesAdd : undefined,
              rolesList: parsed.rolesList || undefined,
              tasksAdd: parsed.tasksAdd.length > 0 ? parsed.tasksAdd : undefined,
              tasksDelete: parsed.tasksDelete.length > 0 ? parsed.tasksDelete : undefined,
              tasksList: parsed.tasksList || undefined,
            }
          : m
      )));
      // Fire-and-forget: mark consumed so we don't re-process on next render
      // (and so other tabs don't double-execute the same actions).
      consumeAiJob(jobId).catch(() => {});
      // House-keeping: drop fully-consumed rows after a delay so the table
      // doesn't grow unbounded. Failures here are non-fatal.
      setTimeout(() => { deleteAiJob(jobId).catch(() => {}); }, 60_000);
    }
  }, [aiJobRows, organizationId, activeSessionId, locale, t]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || sending) return;

    // Client-side: intercept local list/delete commands
    const parsed = parseAllSkills(text);
    if (parsed.actionsList && !parsed.actions.length && !parsed.tasksAdd.length && !parsed.rolesAdd.length && !parsed.tasksDelete.length) {
      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        from: "user",
        text: text.trim(),
        time: new Date().toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }),
      };
      const aiMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        from: "system",
        text: parsed.cleanText || "这是当前可用的全部 AI actions：",
        time: new Date().toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }),
        actionsList: true,
      };
      setMessages((prev) => [...prev, userMsg, aiMsg]);
      setDraft("");
      return;
    }
    if (parsed.tasksDelete.length > 0 && !parsed.tasksAdd.length && !parsed.rolesAdd.length && !parsed.actions.length) {
      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        from: "user",
        text: text.trim(),
        time: new Date().toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }),
      };
      const aiMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        from: "merchiva",
        text: parsed.cleanText || "",
        time: new Date().toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }),
        tasksDelete: parsed.tasksDelete,
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
    // Attached elements: give the AI the exact HTML it can use as old_string for
    // editBuilderHtml, plus the CSS selector for fallback selector-based actions.
    const elementPrefix = attachedElements.length > 0
      ? `[User pinned ${attachedElements.length} element${attachedElements.length === 1 ? "" : "s"} from the page — apply edits to THESE specifically]\n${attachedElements
          .map((el, i) => `Element ${i + 1}: <${el.tag}> at selector \`${el.selector}\`\n\`\`\`html\n${el.outerHtml}\n\`\`\``)
          .join("\n")}\n`
      : "";

    const fullText = `${dataPrefix}${filePrefix}${elementPrefix}${text.trim()}`;

    const displayParts: string[] = [];
    if (attachedData.length > 0) displayParts.push(`@${attachedData.join(" @")}`);
    if (attachedFiles.length > 0) displayParts.push(`📎 ${attachedFiles.map((f) => f.name).join(", ")}`);
    if (attachedElements.length > 0) displayParts.push(`📌 ${attachedElements.map((el) => `<${el.tag}>`).join(" ")}`);
    const displayText = displayParts.length > 0
      ? `${text.trim()}\n${displayParts.join(" · ")}`
      : text.trim();

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      from: "user",
      text: displayText,
      time: new Date().toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }),
    };
    setMessages((prev) => [...prev, userMsg]);
    setDraft("");
    setAttachedData([]);
    setAttachedFiles([]);
    setAttachedElements([]);
    setDataMentionOpen(false);
    setSending(true);
    setThinkingPhase(getThinkingLabel(text, "analyze", t));

    try {
      const last10 = expandHistoryFromMessages(messages).slice(-10);

      const mem = organizationId ? loadMemory(organizationId) : { summary: "", storeOverview: "", userPreferences: "" };

      setThinkingPhase(getThinkingLabel(text, "fetch", t));

      // ── Background path: enqueue server-side so the AI keeps generating
      // even if the user closes the tab. The reducer creates an ai_job row;
      // the subscription effect below picks it up, renders partialText as it
      // streams, and runs parsed actions when the row flips to status='done'.
      // If the SpacetimeDB module hasn't been republished with the AI-job
      // reducers yet, the route returns 501 once and we stay on streaming for
      // the rest of the session — no need to keep hammering the endpoint.
      const token = getStoredToken();
      if (token && organizationId && activeSessionId && !enqueueDisabledRef.current) {
        try {
          const enq = await fetch("/api/store-ai/enqueue", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token,
              organizationId,
              sessionId: activeSessionId,
              message: fullText,
              history: last10,
              context: storeContext,
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
            }),
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
      const res = await fetch("/api/store-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: fullText,
          history: last10,
          context: storeContext,
          lang: locale,
          stream: true,
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
        }),
      });

      // Pull the kaomoji the OSS triage picked (header is base64 of the
      // raw UTF-8 face) and surface it to the chat watermark.
      const kaomojiB64 = res.headers.get("X-Merchiva-Kaomoji");
      if (kaomojiB64) {
        try {
          const face = atob(kaomojiB64);
          // atob returns a "binary string"; decode it back to UTF-8.
          const bytes = new Uint8Array(face.length);
          for (let i = 0; i < face.length; i++) bytes[i] = face.charCodeAt(i);
          const decoded = new TextDecoder("utf-8").decode(bytes);
          if (decoded) {
            window.dispatchEvent(
              new CustomEvent("merchiva:set-kaomoji", { detail: decoded }),
            );
          }
        } catch (err) {
          console.warn("[Mr. Merchiva] kaomoji header decode failed:", err);
        }
      }

      const streamMsgId = `a-${Date.now()}`;
      const streamTime = new Date().toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });

      if (!res.ok || !res.body) {
        const errBody = !res.body ? "no body" : await res.text();
        console.error("[Mr. Merchiva] Stream failed:", res.status, errBody);
        throw new Error("Stream unavailable");
      }

      // Add a placeholder message for streaming
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
      const cmdRe = /\/(?:tasks|roles)\s+(?:add|delete|list)\s+(?:'[^']*'?|"[^"]*"?|`[^`]*`?|\{[^}]*\}?)/g;

      function stripActionBlocks(text: string): string {
        // Use the same brace-counting extractor as parseActions so display and
        // parsing agree — keeps nested-object action blocks (e.g. builder elements
        // with style/props sub-objects) from leaking into the visible message.
        const { cleanText } = extractActionBlocks(text);
        return cleanText.replace(cmdRe, "").trim();
      }

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (chunk) {
            fullReply += chunk;
            const visible = stripActionBlocks(fullReply);
            const display = visible || (fullReply.length > 0 ? "..." : "");
            setMessages((prev) => prev.map((m) =>
              m.id === streamMsgId ? { ...m, text: display } : m
            ));
          }
        }
      } catch (streamErr) {
        console.warn("[Mr. Merchiva] Stream read error:", streamErr);
      }

      let reply = fullReply;

      // Fallback: if stream returned nothing, retry non-streaming
      if (!reply.trim()) {
        console.log("[Mr. Merchiva] Stream empty, retrying non-streaming...");
        setMessages((prev) => prev.map((m) =>
          m.id === streamMsgId ? { ...m, text: "..." } : m
        ));
        try {
          const fallbackRes = await fetch("/api/store-ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: fullText,
              history: last10,
              context: storeContext,
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
            }),
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
      console.log("[Mr. Merchiva] Parsed:", { actions: parsed.actions.length, actionsList: parsed.actionsList, tasks: parsed.tasksAdd.length, deletes: parsed.tasksDelete.length, roles: parsed.rolesAdd.length, questions: parsed.questions.length });

      // Handle memory update commands from AI
      if (organizationId && parsed.memoryUpdates.length > 0) {
        for (const update of parsed.memoryUpdates) {
          saveMemoryField(organizationId, update.field, update.value);
        }
      }

      // If AI response was only commands/actions with no visible text,
      // show the raw reply so user can see what AI said
      const hasStructured = parsed.actions.length > 0 || parsed.rolesAdd.length > 0 ||
        parsed.tasksAdd.length > 0 || parsed.tasksDelete.length > 0 || parsed.questions.length > 0 ||
        parsed.actionsList;
      const displayText = parsed.cleanText || (
        parsed.actionsList && parsed.actions.length === 0
          ? "这是当前可用的全部 AI actions："
          : hasStructured ? "" : reply.trim()
      );

      // Finalize message with parsed commands
      setMessages((prev) => prev.map((m) =>
        m.id === streamMsgId ? {
          ...m,
          from: parsed.actionsList && parsed.actions.length === 0 ? "system" : m.from,
          text: displayText,
          actions: parsed.actions.length > 0 ? parsed.actions : undefined,
          actionsList: parsed.actionsList || undefined,
          questions: parsed.questions.length > 0 ? parsed.questions : undefined,
          rolesAdd: parsed.rolesAdd.length > 0 ? parsed.rolesAdd : undefined,
          rolesList: parsed.rolesList || undefined,
          tasksAdd: parsed.tasksAdd.length > 0 ? parsed.tasksAdd : undefined,
          tasksDelete: parsed.tasksDelete.length > 0 ? parsed.tasksDelete : undefined,
          tasksList: parsed.tasksList || undefined,
        } : m
      ));

      // Auto-title session from first user message
      if (activeSessionId && messages.length <= 2) {
        const title = text.trim().slice(0, 30) || "Chat";
        execSaveSession(activeSessionId, JSON.stringify(messages.slice(-50)), title).catch(() => {});
      }

      // Background: summarize conversational turns, not system catalog output.
      if (!parsed.actionsList) bufferAndMaybeSummarize(text.trim(), parsed.cleanText);
    } catch {
      setMessages((prev) => [...prev, {
        id: `e-${Date.now()}`,
        from: "merchiva",
        text: t("merchiva.errorNoResponse"),
        time: new Date().toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }),
      }]);
    } finally {
      setSending(false);
      setThinkingPhase("");
    }
  }, [sending, messages, storeContext, organizationId, bufferAndMaybeSummarize, attachedData, attachedFiles, attachedElements, toggleDataMention, isOwner, orgRole, userPermissions, locale, t, activeSessionId]);

  const handleApprove = useCallback(async (msgId: string, actionId: string) => {
    // Read action data from current messages state BEFORE updating
    const msg = messages.find((m) => m.id === msgId);
    const actionData = msg?.actions?.find((a) => a.id === actionId)?.action;

    if (!actionData) {
      console.error("[Approve] Action not found:", msgId, actionId);
      return;
    }

    console.log("[Approve] Executing:", actionData);

    if (actionData.action === "addShift") {
      const member = team.find((m) => m.displayName === actionData.staffName);
      if (!member) {
        const validNames = team.map((m) => m.displayName);
        toast.error(`"${actionData.staffName}" is not a team member. Add them first or pick from: ${validNames.join(", ") || "(no team members yet)"}`);
        return;
      }
      actionData.memberId = member.id;
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

    try {
      await executeAction(actionData);
      console.log("[Approve] Success:", actionData.action);
    } catch (err) {
      console.error("[Approve] Failed:", err);
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
  }, [messages, team]);

  const handleReject = useCallback((msgId: string, actionId: string) => {
    setMessages((prev) => prev.map((m) => {
      if (m.id !== msgId) return m;
      return {
        ...m,
        actions: m.actions?.map((a) =>
          a.id === actionId ? { ...a, status: "rejected" as const } : a
        ),
      };
    }));
  }, []);

  const quickChips = useMemo(() => {
    if (builderMode) {
      return [
        "Add a hero section",
        "Add a contact form",
        "Make this page mobile-friendly",
        "Delete the footer",
        "Add a pricing table",
      ];
    }
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
  }, [timeOffRequests, shiftTrades, staffRoles, t, builderMode]);

  const todayStr = new Date().toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" }).toLowerCase();

  return (
    <section className={cn(
      "bg-background overflow-hidden flex flex-col min-h-0 h-full flex-1",
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
                <MonoCap color="#059669">{t("merchiva.online")}</MonoCap>
              </span>
            </div>
            {!compact && (
              <div className="text-[11.5px] text-stone-600 dark:text-stone-300 mt-0.5">
                {t("merchiva.opsAgent").replace("{orgName}", orgName)}
              </div>
            )}
          </div>
          {!compact && (
            <>
              <button onClick={handleNewChat} title={t("merchiva.newChat")}
                className="h-8 w-8 rounded-[0.3rem] border bg-background text-foreground inline-flex items-center justify-center hover:bg-muted" style={{ borderColor: M_ACC_BD }}>
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setSessionListOpen((v) => !v)} title={t("merchiva.chatHistory")}
                className={cn("h-8 w-8 rounded-[0.3rem] border bg-background text-foreground inline-flex items-center justify-center hover:bg-muted", sessionListOpen && "bg-muted")} style={{ borderColor: M_ACC_BD }}>
                <History className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </header>
      )

      }

      {/* Session history panel */}
      {sessionListOpen && (
        <div className="border-b border-border bg-stone-50/60 dark:bg-stone-950/60 max-h-[240px] overflow-auto shrink-0">
          <div className="px-4 py-2 flex items-center justify-between">
            <span className="font-mono text-[9px] tracking-[0.08em] uppercase font-semibold text-muted-foreground">{t("merchiva.history")}</span>
            <span className="text-[10.5px] text-muted-foreground font-mono">{t("merchiva.conversations").replace("{n}", String(mySessions.length))}</span>
          </div>
          {mySessions.length === 0 ? (
            <div className="px-4 py-3 text-[12px] text-muted-foreground text-center">{t("merchiva.noConversations")}</div>
          ) : (
            <div className="divide-y divide-border">
              {mySessions.map((session) => {
                const sid = session.id.toHexString ? session.id.toHexString() : String(session.id);
                const isActive = sid === activeSessionId;
                const ts = typeof session.updatedAt === "object" && "microsSinceUnixEpoch" in session.updatedAt
                  ? new Date(Number(session.updatedAt.microsSinceUnixEpoch) / 1000)
                  : new Date();
                return (
                  <button key={sid} onClick={() => switchSession(sid)}
                    className={cn(
                      "w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-stone-100/80 dark:bg-stone-800/80 transition-colors",
                      isActive && "bg-stone-100 dark:bg-stone-800"
                    )}>
                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium truncate">{session.title || t("merchiva.untitled")}</div>
                      <div className="text-[10.5px] text-muted-foreground font-mono">
                        {ts.toLocaleDateString(locale, { month: "short", day: "numeric" })} · {ts.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })}
                      </div>
                    </div>
                    {session.archived && (
                      <span className="h-4 px-1 rounded-[0.2rem] bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400 text-[8px] font-mono uppercase shrink-0">{t("merchiva.archived")}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

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
            <div className="text-[14px] text-stone-800 dark:text-stone-200 leading-[1.55] max-w-[680px]">
              {headline}
            </div>
          </ChatRow>
        )}

        {!compact && insights.map((insight, idx) => (
          <ChatRow key={insight.id} time={`06:${14 + idx}`}>
            {insight.type === "watchlist" ? (
              <Bubble>
                <div className="flex items-center gap-2">
                  <span className="h-6 px-2 rounded-[0.3rem] inline-flex items-center gap-1.5 bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300">
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
                primary={insight.primaryAction ?? { label: "View" }}
                secondary={insight.secondaryAction ?? "Dismiss"}
                reasoning={insight.reasoning}
                embed={<InsightEmbed insight={insight} />}
              />
            )}
          </ChatRow>
        ))}

        {/* User/AI conversation messages */}
        {messages.map((msg) => {
          if (msg.from === "voice-call") {
            return <VoiceCallRow key={msg.id} message={msg} />;
          }
          if (msg.from === "system") {
            return msg.actionsList ? (
              <div key={msg.id} className="mx-auto w-full max-w-[680px]">
                <ChatRow from="system">{msg.text}</ChatRow>
                <ActionsListCard />
              </div>
            ) : (
              <ChatRow key={msg.id} from="system">{msg.text}</ChatRow>
            );
          }
          if (msg.from === "user") {
            return (
              <div key={msg.id} className="flex justify-end">
                <div className="max-w-[480px] rounded-lg bg-foreground text-background px-4 py-3">
                  <div className="text-[14px] leading-[1.5] whitespace-pre-wrap">{msg.text}</div>
                  <div className="text-[10px] text-background/50 mt-1 text-right font-mono">{msg.time}</div>
                </div>
              </div>
            );
          }
          return (
            <ChatRow key={msg.id} time={msg.time}>
              <Bubble>
                <div className="text-[13.5px] text-stone-800 dark:text-stone-200 leading-[1.55]">
                  <MerchivaMarkdown content={msg.text} />
                </div>
                {msg.actions && msg.actions.length > 0 && (
                  <>
                    {msg.actions.map((act) => (
                      <ActionApprovalCard
                        key={act.id}
                        action={act.action}
                        status={act.status}
                        alreadyExecuted={msg.executed}
                        onApprove={() => handleApprove(msg.id, act.id)}
                        onReject={() => handleReject(msg.id, act.id)}
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
                  const matchedRole = staffRoles.find((r) =>
                    r.name.toLowerCase() === msg.tasksList!.toLowerCase()
                  );
                  return matchedRole ? (
                    <TasksListInline roleId={matchedRole.id} roleName={matchedRole.name} />
                  ) : (
                    <div className="rounded-[0.3rem] border border-border bg-stone-50/60 dark:bg-stone-950/60 p-3 mt-2 text-[12px] text-muted-foreground">
                      未找到岗位「{msg.tasksList}」
                    </div>
                  );
                })()}
                {(msg.rolesAdd || msg.tasksAdd) && (
                  <CommandGroup
                    roles={msg.rolesAdd}
                    tasks={msg.tasksAdd}
                    staffRolesRef={staffRolesRef}
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
                    alreadyExecuted={msg.executed}
                  />
                )}
              </Bubble>
            </ChatRow>
          );
        })}

        {sending && (
          <ChatRow time="">
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: M_ACC }} />
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

      {/* Attached data/files/elements preview */}
      {(attachedData.length > 0 || attachedFiles.length > 0 || attachedElements.length > 0) && (
        <div className={cn("pt-2 flex items-center gap-1.5 flex-wrap shrink-0", compact ? "px-4" : "px-6")}>
          {attachedData.map((d) => (
            <span key={d} className="h-6 px-2 rounded-[0.3rem] inline-flex items-center gap-1.5 text-[11px] font-mono font-medium"
              style={{ background: M_ACC_SOFT, border: `1px solid ${M_ACC_BD}`, color: M_ACC }}>
              {DATA_ICONS[d]}
              @{d}
              <button onClick={() => toggleDataMention(d)} className="ml-0.5 hover:text-foreground">×</button>
            </span>
          ))}
          {attachedFiles.map((f, i) => (
            <span key={i} className="h-6 px-2 rounded-[0.3rem] inline-flex items-center gap-1.5 bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 text-[11px] font-mono">
              <Paperclip className="h-3 w-3" />
              {f.name.length > 20 ? f.name.slice(0, 17) + "..." : f.name}
              <button onClick={() => removeFile(i)} className="ml-0.5 hover:text-foreground">×</button>
            </span>
          ))}
          {attachedElements.map((el, i) => (
            <span
              key={`${el.selector}-${i}`}
              title={el.selector}
              className="h-6 px-2 rounded-[0.3rem] inline-flex items-center gap-1.5 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900 text-sky-700 dark:text-sky-300 text-[11px] font-mono"
            >
              <MousePointer2 className="h-3 w-3" />
              &lt;{el.tag}&gt;
              <span className="text-sky-500/70 dark:text-sky-400/60 max-w-[120px] truncate">
                {shortSelector(el.selector)}
              </span>
              <button onClick={() => removeAttachedElement(i)} className="ml-0.5 hover:text-foreground">×</button>
            </span>
          ))}
        </div>
      )}

      {/* @data mention dropdown */}
      {dataMentionOpen && (
        <div className={cn("pt-2 shrink-0", compact ? "px-4" : "px-6")}>
          <div className="rounded-[0.3rem] border border-border bg-background p-2 space-y-0.5">
            <div className="px-2 pb-1">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{t("merchiva.mentionData")}</span>
            </div>
            {DATA_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => toggleDataMention(cat.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-2.5 py-2 rounded-[0.3rem] text-left transition-colors",
                  attachedData.includes(cat.id) ? "bg-foreground text-background" : "hover:bg-muted"
                )}
              >
                {DATA_ICONS[cat.id]}
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-medium">{cat.label}</div>
                  <div className={cn("text-[10.5px]", attachedData.includes(cat.id) ? "text-background/60" : "text-muted-foreground")}>{cat.desc}</div>
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
        <div className="rounded-lg border border-border bg-background focus-within:border-stone-400 transition-colors">
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
            <button onClick={() => fileInputRef.current?.click()}
              className="h-8 w-8 rounded-[0.3rem] text-muted-foreground hover:bg-muted inline-flex items-center justify-center" title={t("merchiva.attachFile")}>
              <Paperclip className="h-[15px] w-[15px]" />
            </button>
            <button onClick={recording ? stopVoice : startVoice}
              className={cn(
                "h-8 w-8 rounded-[0.3rem] inline-flex items-center justify-center transition-colors",
                recording ? "bg-red-500 text-white animate-pulse" : "text-muted-foreground hover:bg-muted"
              )} title={recording ? t("merchiva.stopRecording") : t("merchiva.voiceInput")}>
              <Mic className="h-[15px] w-[15px]" />
            </button>
            {!builderMode && (
              <button onClick={() => setCallOpen(true)}
                className="h-8 w-8 rounded-[0.3rem] text-muted-foreground hover:bg-muted inline-flex items-center justify-center"
                title={t("merchiva.startCall")}>
                <Phone className="h-[15px] w-[15px]" />
              </button>
            )}
            {!builderMode && (
              <button onClick={() => setDataMentionOpen((v) => !v)}
                className={cn(
                  "h-8 px-2 rounded-[0.3rem] inline-flex items-center gap-1.5 transition-colors",
                  dataMentionOpen || attachedData.length > 0
                    ? "text-foreground bg-muted"
                    : "text-muted-foreground hover:bg-muted"
                )} title={t("merchiva.mentionData")}>
                <AtSign className="h-[14px] w-[14px]" />
                <span className="text-[11.5px]">{t("merchiva.dataLabel")}{attachedData.length > 0 ? ` · ${attachedData.length}` : ""}</span>
              </button>
            )}
            {builderMode && (
              <button
                onClick={togglePickMode}
                className={cn(
                  "h-8 px-2 rounded-[0.3rem] inline-flex items-center gap-1.5 transition-colors",
                  pickMode
                    ? "bg-sky-500 text-white hover:bg-sky-600"
                    : attachedElements.length > 0
                      ? "text-foreground bg-muted"
                      : "text-muted-foreground hover:bg-muted",
                )}
                title={pickMode ? "Click any element in the canvas · Esc to cancel" : "Pick an element to attach"}
              >
                <MousePointer2 className="h-[14px] w-[14px]" />
                <span className="text-[11.5px]">
                  {pickMode ? "Click element…" : `Element${attachedElements.length > 0 ? ` · ${attachedElements.length}` : ""}`}
                </span>
              </button>
            )}
            <div className="flex-1" />
            <kbd className="font-mono text-[10px] text-stone-400 dark:text-stone-500 border border-border rounded-[0.3rem] px-1.5 py-0.5">⏎ {t("merchiva.sendShortcut")}</kbd>
            <button
              disabled={(!draft.trim() && attachedFiles.length === 0 && attachedElements.length === 0) || sending}
              onClick={() => sendMessage(draft)}
              className="h-9 px-4 rounded-[0.3rem] bg-foreground text-background text-[13px] font-medium hover:bg-foreground/90 inline-flex items-center gap-2 disabled:opacity-30"
            >
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("merchiva.send")}
              {!sending && <ArrowUp className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>

      <MerchivaCallModal
        open={callOpen}
        onClose={() => setCallOpen(false)}
        getContext={() => ({
          history: expandHistoryFromMessages(messages).slice(-10),
          storeContext,
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
  const { organizationId } = usePermissions();
  const { shifts: allShifts } = useStaffing(organizationId, null, false);

  const today = new Date().toISOString().slice(0, 10);
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

  function formatTimeShort(t: string) {
    const [h, m] = t.split(":").map(Number);
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
          <div className="text-[13.5px] font-semibold">Today&apos;s schedule</div>
          <div className="text-[11px] text-muted-foreground">
            <span className="font-mono">{shifts.length}</span> shifts · <span className="font-mono">{totalHrs.toFixed(1)}</span> hrs
          </div>
        </div>
        <button className="text-[11.5px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5">
          Open <ChevronRight className="h-3 w-3" />
        </button>
      </header>

      {hasShifts ? (
        <>
          <div className="px-5 pt-3 pb-4">
            <div className="relative h-3 mb-1">
              {ticks.map((h) => (
                <div key={h} className="absolute font-mono text-[9px] text-stone-400 dark:text-stone-500 tabular-nums -translate-x-1/2" style={{ left: `${pct(h * 60)}%` }}>
                  {h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`}
                </div>
              ))}
            </div>
            <div className="relative rounded-[0.3rem] border border-border bg-stone-50 dark:bg-stone-950 overflow-hidden"
              style={{ height: lanes.length * 22 + (lanes.length - 1) * 3 + 8 }}>
              {ticks.map((h) => (
                <div key={h} className="absolute top-0 bottom-0 w-px bg-stone-200 dark:bg-stone-700" style={{ left: `${pct(h * 60)}%` }} />
              ))}
              {shifts.map((s) => {
                const left = pct(s.startMin);
                const width = pct(s.endMin) - pct(s.startMin);
                const isActive = nowMin >= s.startMin && nowMin < s.endMin;
                const lane = shiftLanes.get(s.id) ?? 0;
                return (
                  <div key={s.id}
                    className={cn(
                      "absolute flex items-center gap-1.5 px-1.5 rounded-[0.2rem] border text-[10px] font-medium whitespace-nowrap overflow-hidden",
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
              <div className="absolute -top-1 -bottom-1 w-px bg-red-500" style={{ left: `${pct(nowMin)}%` }}>
                <div className="absolute -top-1 -left-[3px] w-[7px] h-[7px] rounded-full bg-red-500" />
              </div>
            </div>
          </div>

          <div className="border-t border-border divide-y divide-border">
            {onShift.length > 0 && (
              <>
                <div className="px-5 py-2 flex items-center gap-2">
                  <MonoCap>on shift · {onShift.length}</MonoCap>
                  <span className="ml-auto text-[10.5px] font-mono text-emerald-600 inline-flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> live
                  </span>
                </div>
                {onShift.map((s) => (
                  <div key={s.id} className="px-5 py-2 flex items-center gap-3">
                    <Initials name={s.name} size={24} />
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
                  <MonoCap>up next</MonoCap>
                </div>
                {upNext.map((s) => {
                  const inMin = s.startMin - nowMin;
                  const inStr = inMin < 60 ? `in ${inMin}m` : `in ${Math.floor(inMin / 60)}h`;
                  return (
                    <div key={s.id} className="px-5 py-2 flex items-center gap-3">
                      <Initials name={s.name} size={24} />
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
        <div className="px-5 py-8 text-center text-xs text-muted-foreground">No shifts scheduled today</div>
      )}
    </section>
  );
}

// ── Notifications Card ──────────────────────────────────────────────────────

function NotificationsCard() {
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
          <div className="text-[13.5px] font-semibold">Notifications</div>
          <div className="text-[11px] text-muted-foreground">
            <span className="font-mono">{recent.length}</span> new
            {needsDecision > 0 && <> · <span className="font-mono">{needsDecision}</span> need a decision</>}
          </div>
        </div>
        <button className="text-[11.5px] text-muted-foreground hover:text-foreground">Mark all read</button>
      </header>

      {recent.length > 0 ? (
        <div className="divide-y divide-border">
          {recent.map((n) => {
            const t = tones[n.type] ?? tones.general;
            const icon = ICONS[n.type] ?? ICONS.general;
            const ago = timeAgo(n.createdAt.toDate().toISOString());
            return (
              <div key={n.id.toString()} className="px-5 py-3 flex items-start gap-3">
                <span className="h-6 w-6 rounded-[0.3rem] border inline-flex items-center justify-center shrink-0"
                  style={{ background: t.bg, borderColor: t.bd, color: t.fg }}>
                  {icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <div className="text-[12.5px] font-medium leading-tight truncate">{n.title}</div>
                    <span className="ml-auto font-mono text-[10px] text-stone-400 dark:text-stone-500 tabular-nums shrink-0">{ago}</span>
                  </div>
                  <div className="text-[11.5px] text-muted-foreground leading-snug mt-1">{n.body}</div>
                  {(n.type === "shift_trade" || n.type === "time_off") && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <button className="h-6 px-2 rounded-[0.3rem] bg-foreground text-background text-[11px] font-medium hover:bg-foreground/90">
                        Review
                      </button>
                      <button className="h-6 px-2 rounded-[0.3rem] border border-border bg-background text-muted-foreground text-[11px] font-medium hover:bg-muted">
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-5 py-8 text-center text-xs text-muted-foreground">No new notifications</div>
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
      <div className="flex-1 min-h-0 grid gap-4 p-4" style={{ gridTemplateColumns: "minmax(0,1fr) 360px" }}>
        <MerchivaChat />
        <div className="flex flex-col gap-4 min-h-0 overflow-auto">
          <TodayScheduleCard />
          <NotificationsCard />
        </div>
      </div>
    </div>
  );
}

// ── Mobile Dashboard ────────────────────────────────────────────────────────

function MobileKpiRow() {
  const { organizationId } = usePermissions();
  const { history: salesHistory, hourly: salesHourly, isReady: salesReady } = useSales();
  const { items: invItems, isReady: invReady } = useInventory(organizationId);

  const today = new Date().toISOString().slice(0, 10);

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
    <div className="grid grid-cols-2 gap-3 px-4 py-3">
      <div className="rounded-[0.3rem] border border-border bg-background p-3">
        <MonoCap>Revenue · today</MonoCap>
        <div className="text-[22px] font-semibold leading-none mt-1.5 tracking-tight">
          {todayRevenue != null ? `$${todayRevenue.toLocaleString()}` : "—"}
        </div>
      </div>
      <div className="rounded-[0.3rem] border border-border bg-background p-3">
        <MonoCap>SKUs at risk</MonoCap>
        <div className={cn("text-[22px] font-semibold leading-none mt-1.5 tracking-tight", atRisk && atRisk > 0 ? "text-amber-600" : "")}>
          {atRisk != null ? String(atRisk) : "—"}
        </div>
      </div>
    </div>
  );
}

function MobileMerchivaChat() {
  const { currentOrg, organizationId } = usePermissions();
  const t = useT();
  const orgName = currentOrg?.name ?? "your store";

  const { items: invItems } = useInventory(organizationId);
  const { history: salesHistory, hourly: salesHourly } = useSales();
  const { shifts } = useStaffing(organizationId, null, false);

  const insights = useMemo(
    () => generateInsights(invItems, shifts, salesHistory, salesHourly),
    [invItems, shifts, salesHistory, salesHourly],
  );

  const headline = useMemo(
    () => generateGreeting(insights.length),
    [insights.length],
  );

  const quickChips = [
    t("merchiva.quickSchedule"),
    t("merchiva.quickSales"),
    t("merchiva.quickInventory"),
  ];

  const MOBILE_ICONS: Record<string, React.ReactNode> = {
    inventory: <Package className="h-[10px] w-[10px]" />,
    staffing: <Users className="h-[10px] w-[10px]" />,
    sales: <ChevronRight className="h-[10px] w-[10px]" />,
    watchlist: <Eye className="h-[10px] w-[10px]" />,
  };

  return (
    <section className="mx-4 rounded-lg border border-border bg-background overflow-hidden flex flex-col">
      {/* Header */}
      <header className="px-4 py-3 border-b border-border flex items-center gap-3 shrink-0" style={{ background: M_ACC_SOFT }}>
        <NotchM size={32} fg={M_ACC_SOFT} bg="#1c1917" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold tracking-tight">{t("merchiva.name")}</span>
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <MonoCap color="#059669">{t("merchiva.online")}</MonoCap>
            </span>
          </div>
          <div className="text-[10.5px] text-stone-600 dark:text-stone-300 mt-0.5">{t("merchiva.trainedOn").replace("{orgName}", orgName)}</div>
        </div>
      </header>

      {/* Brief message */}
      <div className="px-4 py-4 flex items-start gap-3">
        <NotchM size={28} fg="#fff" bg="#1c1917" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[12px] font-semibold">{t("merchiva.name")}</span>
            <MonoCap color="#a8a29e">06:14</MonoCap>
          </div>
          <p className="text-[13px] text-stone-800 dark:text-stone-200 leading-[1.5]">{headline}</p>
        </div>
      </div>

      {/* Condensed insight cards from real data */}
      <div className="px-4 pb-3 space-y-2">
        {insights.slice(0, 4).map((insight) => (
          <MobileInsight
            key={insight.id}
            pill={insight.type.toUpperCase()}
            icon={MOBILE_ICONS[insight.type] ?? <Package className="h-[10px] w-[10px]" />}
            title={insight.title}
            sub={insight.body.slice(0, 60) + (insight.body.length > 60 ? "..." : "")}
            confidence={insight.confidence}
          />
        ))}
        {insights.length === 0 && (
          <div className="rounded-[0.3rem] border border-border bg-background p-3 text-center text-[12px] text-muted-foreground">
            {t("merchiva.allClear")}
          </div>
        )}
      </div>

      {/* Quick chips */}
      <div className="px-4 pb-3 flex items-center gap-1.5 overflow-x-auto">
        {quickChips.map((s) => (
          <button key={s} className="h-7 px-2.5 rounded-full border border-border bg-background text-[11px] text-muted-foreground hover:bg-muted inline-flex items-center gap-1 whitespace-nowrap shrink-0">
            <Sparkles className="h-[10px] w-[10px]" style={{ color: M_ACC }} />
            {s}
          </button>
        ))}
      </div>

      {/* Simple input */}
      <div className="px-4 pb-4">
        <div className="flex items-center gap-2 rounded-[0.3rem] border border-border bg-background px-3 py-2">
          <input
            type="text"
            placeholder={t("merchiva.composerPlaceholder")}
            className="flex-1 bg-transparent outline-none text-[13px] placeholder:text-muted-foreground/60"
          />
          <button className="h-7 w-7 rounded-[0.3rem] bg-foreground text-background inline-flex items-center justify-center">
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
}

function MobileInsight({ pill, icon, title, sub, confidence }: {
  pill: string;
  icon: React.ReactNode;
  title: string;
  sub: string;
  confidence: number;
}) {
  return (
    <div className="rounded-[0.3rem] border border-border bg-background p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="h-5 px-1.5 rounded-[0.2rem] inline-flex items-center gap-1"
          style={{ background: M_ACC_SOFT, border: `1px solid ${M_ACC_BD}`, color: M_ACC }}>
          {icon}
          <span className="font-mono text-[9px] tracking-[0.08em] uppercase font-semibold">{pill}</span>
        </span>
        <div className="flex-1" />
        <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{(confidence * 100).toFixed(0)}%</span>
      </div>
      <div className="text-[13px] font-medium leading-tight">{title}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}

export function MobileMerchivaDashboard() {
  return (
    <div className="pb-4 space-y-3">
      <style>{`@keyframes ddBlink { 0%,50% { opacity: 1; } 50.01%,100% { opacity: 0; } }`}</style>
      <MobileKpiRow />
      <MobileMerchivaChat />
      <div className="px-4 space-y-3">
        <TodayScheduleCard />
        <NotificationsCard />
      </div>
    </div>
  );
}
