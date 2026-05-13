"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Package, Users, Eye, ChevronRight, ChevronDown, ChevronUp,
  Bell, Paperclip, Mic, AtSign, ArrowUp, ArrowRight, Check, Loader2,
  Calendar, History, MoreHorizontal, Sparkles,
  ArrowLeftRight, CalendarX, Truck,
} from "lucide-react";
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

// ── Brand colors ────────────────────────────────────────────────────────────

const M_ACC = "oklch(0.55 0.09 55)";
const M_ACC_SOFT = "#faf5ec";
const M_ACC_BD = "#ecd9b8";

// ── Notch M (agent mark) ────────────────────────────────────────────────────

function NotchM({ size = 28, fg = "#fff", bg = "#1c1917" }: { size?: number; fg?: string; bg?: string }) {
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
      className="rounded-full bg-stone-200 text-stone-700 flex items-center justify-center font-semibold shrink-0"
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

// ── Forecast Chart (inline in chat) ─────────────────────────────────────────

const FORECAST_DATA = {
  sku: "OAT-1L",
  name: "Oat milk · 1L",
  past: [38, 42, 39, 45, 47, 51, 49, 46, 52, 55, 53, 58, 56, 62],
  future: [63, 66, 64, 70, 72, 68, 74, 76, 73, 78, 80, 77, 82, 84],
  bandHi: [68, 72, 71, 78, 81, 78, 85, 88, 86, 92, 95, 93, 99, 102],
  bandLo: [58, 60, 57, 62, 63, 58, 63, 64, 60, 64, 65, 61, 65, 66],
  reorderDay: 4,
  stockoutDay: 9,
};

function ForecastChart() {
  const W = 600, H = 160, pad = 28;
  const all = [...FORECAST_DATA.past, ...FORECAST_DATA.future, ...FORECAST_DATA.bandHi];
  const max = Math.max(...all) * 1.12;
  const len = FORECAST_DATA.past.length + FORECAST_DATA.future.length - 1;
  const sx = (i: number) => pad + (i / len) * (W - pad * 2);
  const sy = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const pastPath = FORECAST_DATA.past.map((v, i) => `${i === 0 ? "M" : "L"} ${sx(i)} ${sy(v)}`).join(" ");
  const splitIdx = FORECAST_DATA.past.length - 1;
  const futPath = FORECAST_DATA.future.map((v, i) => `${i === 0 ? "M" : "L"} ${sx(splitIdx + i)} ${sy(v)}`).join(" ");
  const bandHi = FORECAST_DATA.bandHi.map((v, i) => `${i === 0 ? "M" : "L"} ${sx(splitIdx + i)} ${sy(v)}`).join(" ");
  const bandLo = FORECAST_DATA.bandLo.map((_v, i) =>
    `L ${sx(splitIdx + (FORECAST_DATA.bandLo.length - 1 - i))} ${sy(FORECAST_DATA.bandLo[FORECAST_DATA.bandLo.length - 1 - i])}`
  ).join(" ");
  const reorderX = sx(splitIdx + FORECAST_DATA.reorderDay);
  const stockoutX = sx(splitIdx + FORECAST_DATA.stockoutDay);
  const splitX = sx(splitIdx);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
      <defs>
        <linearGradient id="ddBandFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={M_ACC} stopOpacity="0.18" />
          <stop offset="100%" stopColor={M_ACC} stopOpacity="0.02" />
        </linearGradient>
        <pattern id="ddHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={M_ACC} strokeWidth="0.7" strokeOpacity="0.2" />
        </pattern>
      </defs>
      {[0.5, 1].map((p) => (
        <line key={p} x1={pad} x2={W - pad} y1={sy(max * p)} y2={sy(max * p)} stroke="#e7e5e4" strokeDasharray="2 4" />
      ))}
      <line x1={splitX} x2={splitX} y1={pad} y2={H - pad} stroke="#d6d3d1" strokeDasharray="3 3" />
      <text x={splitX - 5} y={pad + 9} textAnchor="end" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="#78716c">actual</text>
      <text x={splitX + 5} y={pad + 9} textAnchor="start" fontFamily="JetBrains Mono, monospace" fontSize="9" fill={M_ACC}>forecast</text>
      <path d={`${bandHi} ${bandLo} Z`} fill="url(#ddHatch)" />
      <path d={`${bandHi} ${bandLo} Z`} fill="url(#ddBandFill)" />
      <path d={pastPath} fill="none" stroke="#1c1917" strokeWidth="1.8" />
      <path d={futPath} fill="none" stroke={M_ACC} strokeWidth="1.8" strokeDasharray="4 3" />
      {FORECAST_DATA.past.map((v, i) => <circle key={`p${i}`} cx={sx(i)} cy={sy(v)} r="1.8" fill="#1c1917" />)}
      {FORECAST_DATA.future.map((v, i) => <circle key={`f${i}`} cx={sx(splitIdx + i)} cy={sy(v)} r="2.2" fill="#fff" stroke={M_ACC} strokeWidth="1.3" />)}
      <line x1={reorderX} x2={reorderX} y1={pad - 6} y2={H - pad} stroke="#1c1917" strokeWidth="1" />
      <rect x={reorderX - 48} y={pad - 14} width="96" height="14" fill="#1c1917" rx="3" />
      <text x={reorderX} y={pad - 4} textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="8.5" fill="#fff" letterSpacing="0.6">REORDER · MAY 14</text>
      <line x1={stockoutX} x2={stockoutX} y1={pad - 6} y2={H - pad} stroke="#dc2626" strokeWidth="1" strokeDasharray="2 2" />
      <rect x={stockoutX - 44} y={pad - 14} width="88" height="14" fill="#fef2f2" stroke="#fecaca" rx="3" />
      <text x={stockoutX} y={pad - 4} textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="8.5" fill="#b91c1c" letterSpacing="0.6">STOCKOUT · MAY 19</text>
    </svg>
  );
}

// ── Saturday preview (staffing embed) ───────────────────────────────────────

function SaturdayPreview() {
  const hours = ["4p", "5p", "6p", "7p", "8p", "9p", "10p"];
  return (
    <div className="rounded-[0.3rem] border border-border bg-stone-50/60 p-3">
      <div className="flex items-center gap-2 mb-2">
        <MonoCap>sat may 1 · closing window</MonoCap>
        <span className="ml-auto text-[10.5px] font-mono text-amber-600">−1 barista</span>
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
        {hours.map((h, i) => (
          <div key={h} className="flex flex-col items-center gap-1">
            <div className="text-[9px] font-mono text-stone-400 tabular-nums">{h}</div>
            <div className="w-full h-5 rounded-sm border" style={{
              background: i <= 5 ? "#1c1917" : "#fff",
              borderColor: i <= 5 ? "#1c1917" : "#d6d3d1",
            }} />
            <div className="w-full h-5 rounded-sm border border-dashed" style={{
              borderColor: "#d97706", background: "#fffbeb",
            }} />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-2 text-[10.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 bg-foreground rounded-sm" /> scheduled</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 border border-dashed border-amber-600 bg-amber-50 rounded-sm" /> suggested</span>
        <span className="ml-auto font-mono text-stone-600">+6h · $84 labor</span>
      </div>
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
              <span className="text-stone-400">/{r.par}</span>
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
  if (from === "system") {
    return (
      <div className="flex items-center gap-3 py-2">
        <div className="flex-1 h-px bg-stone-200" />
        <MonoCap>{children}</MonoCap>
        <div className="flex-1 h-px bg-stone-200" />
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3">
      <NotchM size={32} fg="#fff" bg="#1c1917" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[12.5px] font-semibold tracking-tight">Mr. Merchiva</span>
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
          <span className="inline-block w-12 h-1 rounded-full bg-stone-100 overflow-hidden">
            <span className="block h-full" style={{ width: `${confidence * 100}%`, background: M_ACC }} />
          </span>
        </div>
      </div>
      <h3 className="text-[20px] font-semibold tracking-tight leading-[1.2]">{title}</h3>
      <p className="text-[13.5px] text-stone-600 leading-[1.55]" style={{ textWrap: "pretty" }}>{body}</p>

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
        <div className="border-t border-border pt-3 -mx-4 -mb-4 px-4 pb-4 bg-stone-50/60">
          <MonoCap>based on</MonoCap>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {reasoning.map((r) => (
              <span key={r} className="inline-flex items-center gap-1.5 px-2 py-1 border border-border rounded-[0.3rem] bg-background font-mono text-[10.5px] text-stone-600">
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
      <div className="rounded-[0.3rem] border border-border bg-stone-50/40 p-3">
        <div className="flex items-baseline gap-2 mb-2">
          <div className="text-[12.5px] font-semibold">{d.itemName}</div>
          <MonoCap>{d.currentStock} / {d.maxStock} {d.unit} · ~{d.daysOfCover}d cover</MonoCap>
        </div>
        <div className="w-full h-2 rounded-full bg-stone-100 overflow-hidden">
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

// ── Action block parsing + approval ─────────────────────────────────────────

interface PendingAction {
  id: string;
  action: Record<string, unknown>;
  status: "pending" | "approved" | "rejected";
}

function parseActions(text: string): { cleanText: string; actions: Record<string, unknown>[] } {
  const actions: Record<string, unknown>[] = [];
  const cleanText = text.replace(/```action\n([\s\S]*?)```/g, (_match, json) => {
    try { actions.push(JSON.parse(json.trim())); } catch {}
    return "";
  }).trim();
  return { cleanText, actions };
}

function ActionApprovalCard({ action, onApprove, onReject, status }: {
  action: Record<string, unknown>;
  onApprove: () => void;
  onReject: () => void;
  status: "pending" | "approved" | "rejected";
}) {
  const actionName = String(action.action ?? "unknown");
  const labels: Record<string, string> = {
    addShift: "Add Shift",
    updateInventory: "Update Inventory",
    createPurchaseOrder: "Create PO",
    createNotification: "Create Notification",
    updatePrice: "Update Price",
    addStaffMember: "Add Staff Member",
  };

  return (
    <div className="rounded-[0.3rem] border border-border bg-stone-50/60 p-3 mt-2">
      <div className="flex items-center gap-2 mb-2">
        <span className="h-5 px-1.5 rounded-[0.2rem] inline-flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-700">
          <span className="font-mono text-[9px] tracking-[0.08em] uppercase font-semibold">ACTION</span>
        </span>
        <span className="text-[12px] font-medium">{labels[actionName] ?? actionName}</span>
      </div>
      <pre className="text-[11px] font-mono text-stone-600 bg-stone-100 rounded-[0.2rem] p-2 overflow-x-auto mb-2">
        {JSON.stringify(action, null, 2)}
      </pre>
      {status === "pending" ? (
        <div className="flex items-center gap-1.5">
          <button onClick={onApprove}
            className="h-7 px-3 rounded-[0.3rem] bg-foreground text-background text-[11px] font-medium hover:bg-foreground/90 inline-flex items-center gap-1.5">
            <Check className="h-3 w-3" /> Approve
          </button>
          <button onClick={onReject}
            className="h-7 px-3 rounded-[0.3rem] border border-border bg-background text-muted-foreground text-[11px] font-medium hover:bg-muted">
            Reject
          </button>
        </div>
      ) : (
        <div className={cn(
          "text-[11px] font-mono inline-flex items-center gap-1",
          status === "approved" ? "text-emerald-600" : "text-red-600"
        )}>
          <Check className="h-3 w-3" /> {status === "approved" ? "Approved & executed" : "Rejected"}
        </div>
      )}
    </div>
  );
}

// ── Q&A command parsing ────────────────────────────────────────────────────

interface QAItem {
  q: string;
  a: string[];
}

function parseAskCommands(text: string): { cleanText: string; questions: QAItem[] } {
  const questions: QAItem[] = [];
  const cleanText = text.replace(/\/ask\s+['"`]?(\[[\s\S]*?\])['"`]?/g, (_match, json) => {
    try {
      const parsed = JSON.parse(json.trim());
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item.q && Array.isArray(item.a)) {
            questions.push({ q: String(item.q), a: item.a.map(String) });
          }
        }
      }
    } catch {}
    return "";
  }).trim();
  return { cleanText, questions };
}

function QACard({ item, onAnswer }: { item: QAItem; onAnswer: (answer: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="rounded-[0.3rem] border border-border bg-stone-50/60 p-3 mt-2">
      <div className="flex items-center gap-2 mb-2">
        <span className="h-5 px-1.5 rounded-[0.2rem] inline-flex items-center gap-1"
          style={{ background: M_ACC_SOFT, border: `1px solid ${M_ACC_BD}`, color: M_ACC }}>
          <span className="font-mono text-[9px] tracking-[0.08em] uppercase font-semibold">Q&A</span>
        </span>
      </div>
      <p className="text-[13px] font-medium text-stone-800 mb-2">{item.q}</p>
      <div className="flex flex-wrap gap-1.5">
        {item.a.map((answer) => (
          <button
            key={answer}
            disabled={selected !== null}
            onClick={() => { setSelected(answer); onAnswer(answer); }}
            className={cn(
              "h-8 px-3 rounded-[0.3rem] text-[12px] font-medium transition-colors",
              selected === answer
                ? "bg-foreground text-background"
                : selected !== null
                ? "border border-border bg-background text-muted-foreground opacity-50 cursor-not-allowed"
                : "border border-border bg-background text-foreground hover:bg-muted"
            )}
          >
            {answer}
          </button>
        ))}
      </div>
    </div>
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
      return <code className="block bg-stone-100 rounded-[0.3rem] p-2 text-[11px] font-mono text-stone-700 overflow-x-auto my-1.5" {...props}>{children}</code>;
    }
    return <code className="bg-stone-100 rounded-[0.2rem] px-1 py-0.5 text-[12px] font-mono text-stone-700" {...props}>{children}</code>;
  },
  pre: ({ children, ...props }) => <pre className="mb-1.5 last:mb-0" {...props}>{children}</pre>,
  h1: ({ children, ...props }) => <h1 className="text-[16px] font-semibold mb-1" {...props}>{children}</h1>,
  h2: ({ children, ...props }) => <h2 className="text-[15px] font-semibold mb-1" {...props}>{children}</h2>,
  h3: ({ children, ...props }) => <h3 className="text-[14px] font-semibold mb-1" {...props}>{children}</h3>,
  blockquote: ({ children, ...props }) => <blockquote className="border-l-2 border-stone-300 pl-3 text-stone-600 my-1.5" {...props}>{children}</blockquote>,
  table: ({ children, ...props }) => <div className="overflow-x-auto my-1.5"><table className="text-[12px] w-full border-collapse" {...props}>{children}</table></div>,
  th: ({ children, ...props }) => <th className="text-left px-2 py-1 border-b border-border font-semibold text-[11px] font-mono uppercase text-stone-500" {...props}>{children}</th>,
  td: ({ children, ...props }) => <td className="px-2 py-1 border-b border-border/50" {...props}>{children}</td>,
  hr: (props) => <hr className="border-border my-2" {...props} />,
  a: ({ children, href, ...props }) => <a href={href} target="_blank" rel="noopener noreferrer" className="underline text-stone-700 hover:text-foreground" {...props}>{children}</a>,
};

function MerchivaMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
      {content}
    </ReactMarkdown>
  );
}

// ── Chat message types ──────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  from: "user" | "merchiva" | "system";
  text: string;
  time: string;
  actions?: PendingAction[];
  questions?: QAItem[];
}

function loadChatHistory(orgId: string | null): ChatMessage[] {
  if (typeof window === "undefined" || !orgId) return [];
  try {
    const raw = localStorage.getItem(`merchiva_chat_${orgId}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveChatHistory(orgId: string | null, messages: ChatMessage[]): void {
  if (typeof window === "undefined" || !orgId) return;
  try {
    const toSave = messages.slice(-50);
    localStorage.setItem(`merchiva_chat_${orgId}`, JSON.stringify(toSave));
  } catch {}
}

export function MerchivaChat() {
  const { currentOrg, organizationId } = usePermissions();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadChatHistory(organizationId));
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length > 0) saveChatHistory(organizationId, messages);
  }, [messages, organizationId]);
  const orgName = currentOrg?.name ?? "your store";

  const { items: invItems } = useInventory(organizationId);
  const { history: salesHistory, hourly: salesHourly } = useSales();
  const { shifts, team } = useStaffing(organizationId, null, false);
  const { products } = useProducts(organizationId);
  const [rawNotifs] = useNotifications();

  const insights = useMemo(
    () => generateInsights(invItems, shifts, salesHistory, salesHourly),
    [invItems, shifts, salesHistory, salesHourly],
  );

  const headline = useMemo(
    () => generateGreeting(insights.length),
    [insights.length],
  );

  // Build store context for AI
  const storeContext = useMemo(() => ({
    storeName: orgName,
    today: new Date().toISOString().slice(0, 10),
    inventory: invItems.slice(0, 50).map((i) => ({
      name: i.name, category: i.category, stock: i.currentStock,
      min: i.minStock, max: i.maxStock, unit: i.unit, supplier: i.supplier,
      status: i.status,
    })),
    todayShifts: shifts.filter((s) => s.date === new Date().toISOString().slice(0, 10)).map((s) => ({
      name: s.staffName, role: s.staffRoles.join(", "), start: s.startTime, end: s.endTime, type: s.shiftType,
    })),
    upcomingShifts: shifts.filter((s) => s.date > new Date().toISOString().slice(0, 10)).slice(0, 20).map((s) => ({
      name: s.staffName, date: s.date, start: s.startTime, end: s.endTime,
    })),
    team: team.map((m) => ({ name: m.displayName, role: m.role })),
    recentSales: salesHistory.slice(-7).map((s) => ({ date: s.date, revenue: s.actual })),
    todaySales: salesHourly.map((s) => ({ hour: s.hour, revenue: s.actual })),
    products: products.slice(0, 30).map((p) => ({ name: p.name, price: p.price, category: p.category })),
    unreadNotifications: rawNotifs.filter((n) => !n.read).length,
    insights: insights.map((i) => ({ type: i.type, title: i.title, severity: i.severity })),
  }), [orgName, invItems, shifts, team, salesHistory, salesHourly, products, rawNotifs, insights]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || sending) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      from: "user",
      text: text.trim(),
      time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    };
    setMessages((prev) => [...prev, userMsg]);
    setDraft("");
    setSending(true);

    try {
      const history = messages.filter((m) => m.from !== "system").map((m) => ({
        role: m.from === "user" ? "user" : "assistant",
        content: m.text,
      }));

      const res = await fetch("/api/store-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text.trim(),
          history,
          context: storeContext,
          lang: navigator.language.startsWith("zh") ? "zh" : "en",
        }),
      });

      const data = await res.json();
      const reply = data.reply ?? data.error ?? "No response";

      const { cleanText: afterActions, actions } = parseActions(reply);
      const { cleanText, questions } = parseAskCommands(afterActions);

      const aiMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        from: "merchiva",
        text: cleanText,
        time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
        actions: actions.map((a, i) => ({
          id: `act-${Date.now()}-${i}`,
          action: a,
          status: "pending" as const,
        })),
        questions: questions.length > 0 ? questions : undefined,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      setMessages((prev) => [...prev, {
        id: `e-${Date.now()}`,
        from: "merchiva",
        text: "Sorry, I couldn't reach the AI service. Please try again.",
        time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      }]);
    } finally {
      setSending(false);
    }
  }, [sending, messages, storeContext]);

  const handleApprove = useCallback(async (msgId: string, actionId: string) => {
    setMessages((prev) => prev.map((m) => {
      if (m.id !== msgId) return m;
      return {
        ...m,
        actions: m.actions?.map((a) =>
          a.id === actionId ? { ...a, status: "approved" as const } : a
        ),
      };
    }));

    const msg = messages.find((m) => m.id === msgId);
    const action = msg?.actions?.find((a) => a.id === actionId);
    if (!action) return;

    try {
      const conn = (await import("@/lib/spacetimedb/client")).getConnection();
      if (!conn) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = (conn as any).reducers;
      const act = action.action;

      switch (act.action) {
        case "addShift":
          await r.addShift({
            organizationId: (await import("@/lib/spacetimedb/client")).getActiveOrgId(),
            memberId: null,
            staffName: String(act.staffName ?? ""),
            staffRole: null,
            staffRoles: JSON.stringify(act.staffRoles ?? []),
            date: String(act.date ?? ""),
            shiftType: String(act.shiftType ?? "morning"),
            startTime: String(act.startTime ?? "09:00"),
            endTime: String(act.endTime ?? "17:00"),
            predictedDemand: "medium",
          });
          break;
        case "createNotification":
          await r.createNotification({
            organizationId: (await import("@/lib/spacetimedb/client")).getActiveOrgId(),
            targetIdentity: conn.identity,
            type: String(act.type ?? "general"),
            title: String(act.title ?? ""),
            body: String(act.body ?? ""),
            link: null,
          });
          break;
        case "addStaffMember":
          await r.addStaffMember({
            organizationId: (await import("@/lib/spacetimedb/client")).getActiveOrgId(),
            name: String(act.name ?? ""),
            role: String(act.role ?? "Staff"),
            hourlyRate: Number(act.hourlyRate ?? 0),
            availability: "[]",
          });
          break;
        default:
          console.log("Action not implemented:", act.action);
      }
    } catch (err) {
      console.error("Action execution failed:", err);
    }
  }, [messages]);

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

  const quickChips = [
    "Forecast next week",
    "Who can cover Saturday?",
    "Draft a PO",
    "Top sellers today",
    "Schedule a morning shift for tomorrow",
  ];

  const todayStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }).toLowerCase();

  return (
    <section className="rounded-lg border border-border bg-background overflow-hidden flex flex-col min-h-0">
      {/* Header */}
      <header className="px-5 py-3 border-b border-border flex items-center gap-3 shrink-0" style={{ background: M_ACC_SOFT }}>
        <NotchM size={36} fg={M_ACC_SOFT} bg="#1c1917" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold tracking-tight">Mr. Merchiva</span>
            <span className="inline-flex items-center gap-1 ml-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <MonoCap color="#059669">online</MonoCap>
            </span>
          </div>
          <div className="text-[11.5px] text-stone-600 mt-0.5">
            Your ops agent · trained on {orgName}
          </div>
        </div>
        <button className="h-8 w-8 rounded-[0.3rem] border bg-background text-foreground inline-flex items-center justify-center hover:bg-muted" style={{ borderColor: M_ACC_BD }}>
          <History className="h-3.5 w-3.5" />
        </button>
        <button className="h-8 w-8 rounded-[0.3rem] border bg-background text-foreground inline-flex items-center justify-center hover:bg-muted" style={{ borderColor: M_ACC_BD }}>
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </header>

      {/* Thread */}
      <div ref={scrollRef} className="flex-1 overflow-auto px-6 py-5 flex flex-col gap-5 min-h-0">
        <ChatRow from="system">today · {todayStr}</ChatRow>

        {/* Auto-generated insights */}
        <ChatRow time="06:14">
          <div className="text-[14px] text-stone-800 leading-[1.55] max-w-[680px]">
            {headline}
          </div>
        </ChatRow>

        {insights.map((insight, idx) => (
          <ChatRow key={insight.id} time={`06:${14 + idx}`}>
            {insight.type === "watchlist" ? (
              <Bubble>
                <div className="flex items-center gap-2">
                  <span className="h-6 px-2 rounded-[0.3rem] inline-flex items-center gap-1.5 bg-stone-100 border border-stone-200 text-stone-600">
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
                <div className="text-[13.5px] text-stone-800 leading-[1.55]">
                  <MerchivaMarkdown content={msg.text} />
                </div>
                {msg.actions?.map((act) => (
                  <ActionApprovalCard
                    key={act.id}
                    action={act.action}
                    status={act.status}
                    onApprove={() => handleApprove(msg.id, act.id)}
                    onReject={() => handleReject(msg.id, act.id)}
                  />
                ))}
                {msg.questions?.map((qa, i) => (
                  <QACard key={`qa-${msg.id}-${i}`} item={qa} onAnswer={(answer) => sendMessage(answer)} />
                ))}
              </Bubble>
            </ChatRow>
          );
        })}

        {sending && (
          <ChatRow time="">
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Mr. Merchiva is thinking...
            </div>
          </ChatRow>
        )}

        {messages.length === 0 && (
          <ChatRow from="system">type a message to chat with Mr. Merchiva</ChatRow>
        )}
      </div>

      {/* Quick chips */}
      <div className="px-6 pt-3 pb-2 flex items-center gap-1.5 flex-wrap shrink-0">
        {quickChips.map((s) => (
          <button key={s} onClick={() => sendMessage(s)}
            className="h-7 px-2.5 rounded-full border border-border bg-background text-[11.5px] text-muted-foreground hover:bg-muted inline-flex items-center gap-1.5">
            <Sparkles className="h-[11px] w-[11px]" style={{ color: M_ACC }} />
            {s}
          </button>
        ))}
      </div>

      {/* Composer */}
      <div className="px-6 pb-5 pt-2 shrink-0">
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
            placeholder={`Ask Mr. Merchiva anything — "schedule a shift", "reorder oat milk", "sales report"`}
            className="w-full resize-none bg-transparent border-0 outline-none px-4 pt-3 pb-2 text-[14px] leading-[1.5] placeholder:text-muted-foreground/60"
          />
          <div className="flex items-center gap-2 px-3 pb-2.5 pt-1">
            <button className="h-8 w-8 rounded-[0.3rem] text-muted-foreground hover:bg-muted inline-flex items-center justify-center" title="Attach">
              <Paperclip className="h-[15px] w-[15px]" />
            </button>
            <button className="h-8 w-8 rounded-[0.3rem] text-muted-foreground hover:bg-muted inline-flex items-center justify-center" title="Voice">
              <Mic className="h-[15px] w-[15px]" />
            </button>
            <button className="h-8 px-2 rounded-[0.3rem] text-muted-foreground hover:bg-muted inline-flex items-center gap-1.5" title="Mention data">
              <AtSign className="h-[14px] w-[14px]" />
              <span className="text-[11.5px]">data</span>
            </button>
            <div className="flex-1" />
            <kbd className="font-mono text-[10px] text-stone-400 border border-border rounded-[0.3rem] px-1.5 py-0.5">⏎ to send</kbd>
            <button
              disabled={!draft.trim() || sending}
              onClick={() => sendMessage(draft)}
              className="h-9 px-4 rounded-[0.3rem] bg-foreground text-background text-[13px] font-medium hover:bg-foreground/90 inline-flex items-center gap-2 disabled:opacity-30"
            >
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Send"}
              {!sending && <ArrowUp className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Today's Schedule Card ───────────────────────────────────────────────────

function TodayScheduleCard() {
  const { organizationId } = usePermissions();
  const { shifts: allShifts, loading } = useStaffing(organizationId, null, false);

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
                <div key={h} className="absolute font-mono text-[9px] text-stone-400 tabular-nums -translate-x-1/2" style={{ left: `${pct(h * 60)}%` }}>
                  {h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`}
                </div>
              ))}
            </div>
            <div className="relative rounded-[0.3rem] border border-border bg-stone-50 overflow-hidden"
              style={{ height: lanes.length * 22 + (lanes.length - 1) * 3 + 8 }}>
              {ticks.map((h) => (
                <div key={h} className="absolute top-0 bottom-0 w-px bg-stone-200" style={{ left: `${pct(h * 60)}%` }} />
              ))}
              {shifts.map((s) => {
                const left = pct(s.startMin);
                const width = pct(s.endMin) - pct(s.startMin);
                const isActive = nowMin >= s.startMin && nowMin < s.endMin;
                const lane = shiftLanes.get(s.id) ?? 0;
                return (
                  <div key={s.id}
                    className="absolute flex items-center gap-1.5 px-1.5 rounded-[0.2rem] border text-[10px] font-medium whitespace-nowrap overflow-hidden"
                    style={{
                      left: `${left}%`, width: `${width}%`,
                      top: lane * 25 + 4, height: 21,
                      background: isActive ? "#1c1917" : "#fff",
                      borderColor: isActive ? "#1c1917" : "#d6d3d1",
                      color: isActive ? "#fff" : "#1c1917",
                    }}>
                    <span className="w-1 h-1 rounded-full shrink-0" style={{ background: isActive ? "#fff" : (SHIFT_COLORS[s.shiftType] || "#78716c") }} />
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
                    <span className="ml-auto font-mono text-[10px] text-stone-400 tabular-nums shrink-0">{ago}</span>
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
    "Forecast next week",
    "Draft a PO",
    "Top sellers today",
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
            <span className="text-[14px] font-semibold tracking-tight">Mr. Merchiva</span>
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <MonoCap color="#059669">online</MonoCap>
            </span>
          </div>
          <div className="text-[10.5px] text-stone-600 mt-0.5">Trained on {orgName}</div>
        </div>
      </header>

      {/* Brief message */}
      <div className="px-4 py-4 flex items-start gap-3">
        <NotchM size={28} fg="#fff" bg="#1c1917" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[12px] font-semibold">Mr. Merchiva</span>
            <MonoCap color="#a8a29e">06:14</MonoCap>
          </div>
          <p className="text-[13px] text-stone-800 leading-[1.5]">{headline}</p>
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
            All clear — no issues found.
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
            placeholder="Ask Mr. Merchiva..."
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
