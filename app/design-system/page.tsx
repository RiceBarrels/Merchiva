"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ChevronsUpDown,
  DollarSign,
  Inbox,
  LayoutDashboard,
  Loader2,
  MessageSquare,
  Monitor,
  MoreHorizontal,
  Package,
  Plus,
  Settings,
  ShoppingBag,
  TrendingUp,
  Users,
} from "lucide-react";

import { MerchivaLogo } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Avatar } from "@/components/ui/avatar";
import { Callout } from "@/components/ui/callout";
import { DialogActions } from "@/components/ui/dialog-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Field } from "@/components/ui/field";
import { IconTile } from "@/components/ui/icon-tile";
import { NotificationDot } from "@/components/ui/notification-dot";
import { Num, NumCell } from "@/components/ui/num";
import { OptionRow } from "@/components/ui/option-row";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatGrid, StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

// ─── Content ─────────────────────────────────────────────────────────────────

const TOC: { group: string; items: { id: string; label: string }[] }[] = [
  { group: "Foundations", items: [
    { id: "principles", label: "Principles" },
    { id: "color", label: "Color" },
    { id: "type", label: "Typography" },
    { id: "shape", label: "Radius & spacing" },
  ] },
  { group: "Components", items: [
    { id: "buttons", label: "Buttons" },
    { id: "badges", label: "Badges" },
    { id: "forms", label: "Form controls" },
    { id: "cards", label: "Cards" },
    { id: "tables", label: "Tables" },
    { id: "states", label: "States" },
    { id: "composites", label: "Composites" },
  ] },
  { group: "Shell", items: [
    { id: "nav", label: "Navigation" },
    { id: "logo", label: "Logo" },
    { id: "motion", label: "Motion" },
  ] },
  { group: "Notes", items: [
    { id: "drift", label: "Known drift" },
    { id: "files", label: "Files" },
  ] },
];

const PRINCIPLES = [
  { title: "Tools, not demos", body: <>Built for the fifth-time user. Dense, predictable, no hero sections inside <code>/manager/</code>.</> },
  { title: "Borders over shadows", body: <>Structure is a 1px <code>border-border</code>. Shadows appear only on popovers.</> },
  { title: "Monospace for data", body: <>Prices, SKUs, IDs, timestamps: <code>font-mono tabular-nums</code>.</> },
  { title: "Semantic tokens first", body: <><code>text-foreground</code>, <code>bg-muted</code>. Direct <code>stone-*</code> classes are legacy.</> },
  { title: "Density over whitespace", body: <>Spacing unit is 0.24rem, 4% tighter than stock Tailwind.</> },
  { title: "Motion with purpose", body: <>200–300ms transitions, spring taps on mobile, haptics on every button.</> },
];

const LIGHT_TOKENS = [
  ["background", "#ffffff", "255 255 255"],
  ["foreground", "#0a0a0a", "10 10 10"],
  ["primary", "#171717", "23 23 23"],
  ["secondary / muted / accent", "#f5f5f5", "245 245 245"],
  ["muted-foreground", "#737373", "115 115 115"],
  ["border / input", "#e5e5e5", "229 229 229"],
  ["ring", "#a1a1a1", "161 161 161"],
  ["destructive", "#e7000b", "231 0 11"],
  ["sidebar", "#fafafa", "250 250 250"],
] as const;

const DARK_TOKENS = [
  ["background", "#0a0a0a", "10 10 10"],
  ["foreground", "#fafafa", "250 250 250"],
  ["primary", "#e5e5e5", "229 229 229"],
  ["card / sidebar", "#171717", "23 23 23"],
  ["secondary / muted / popover", "#262626", "38 38 38"],
  ["accent", "#404040", "64 64 64"],
  ["muted-foreground", "#a1a1a1", "161 161 161"],
  ["border", "#282828", "40 40 40"],
  ["input", "#343434", "52 52 52"],
  ["destructive", "#ff6467", "255 100 103"],
] as const;

const CHART = [
  ["chart-1", "bg-chart-1", "145 197 255"],
  ["chart-2", "bg-chart-2", "58 129 246"],
  ["chart-3", "bg-chart-3", "37 99 239"],
  ["chart-4", "bg-chart-4", "26 78 218"],
  ["chart-5", "bg-chart-5", "31 63 173"],
] as const;

const TYPE_SCALE: { k: string; cls: string; text: string }[] = [
  { k: "Display · text-3xl semibold tracking-tight", cls: "text-3xl font-semibold tracking-tight leading-tight", text: "Inventory at a glance" },
  { k: "Brand hero · 28px semibold", cls: "text-[28px] font-semibold tracking-tight leading-tight", text: "Run the store from one screen" },
  { k: "Heading · text-xl semibold", cls: "text-xl font-semibold tracking-tight", text: "Low stock this week" },
  { k: "Card title · text-base medium", cls: "text-base font-medium leading-snug", text: "Suppliers awaiting approval" },
  { k: "Page title · 15px semibold", cls: "text-[15px] font-semibold leading-tight", text: "Inventory" },
  { k: "Nav item · 13px medium", cls: "text-[13px] font-medium", text: "Products" },
  { k: "Body · text-sm", cls: "text-sm max-w-[62ch]", text: "Three items dropped below their reorder point overnight. Merchiva drafted purchase orders for each supplier and is waiting for a manager to approve them." },
  { k: "Tab · 12px medium", cls: "text-[12px] font-medium", text: "Waste Log" },
  { k: "Subtitle · 11.5px muted", cls: "text-[11.5px] text-muted-foreground", text: "Last synced with Square 4 minutes ago" },
  { k: "Eyebrow · 10.5px semibold upper", cls: "text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground", text: "Live inventory" },
  { k: "Data · font-mono text-sm tabular", cls: "font-mono text-sm tabular-nums", text: "SKU-0042 · $1,240.58 · 2026-09-11 14:32" },
  { k: "Data emphasis · mono 13px medium", cls: "font-mono text-[13px] font-medium tabular-nums", text: "Thu, Sep 11 · 09:30" },
];

const RADII = [
  { label: "rounded-sm · 0", px: "0px" },
  { label: "rounded-md · 0.4px", px: "0.4px" },
  { label: "rounded-lg · 2.4px", px: "2.4px" },
  { label: "rounded · 4px", px: "4px" },
  { label: "rounded-xl · 6.4px", px: "6.4px" },
];

const SPACING = [
  ["gap-1", "3.84"], ["gap-1.5", "5.76"], ["gap-2", "7.68"], ["gap-2.5", "9.6"], ["gap-3", "11.52"],
  ["gap-4", "15.36"], ["px-6", "23.04"], ["h-7", "26.9"], ["h-8", "30.7"], ["h-14", "53.8"],
] as const;

const BUTTON_VARIANT_SPECS = [
  ["default", "bg-primary text-primary-foreground hover:bg-primary/80"],
  ["outline", "border-border bg-background hover:bg-muted · dark border-input bg-input/30"],
  ["secondary", "bg-secondary text-secondary-foreground hover:bg-secondary/80"],
  ["ghost", "hover:bg-muted hover:text-foreground"],
  ["destructive", "bg-destructive/10 text-destructive hover:bg-destructive/20"],
  ["link", "text-primary underline-offset-4 hover:underline"],
] as const;

type StockStatus = "ok" | "warn" | "bad";
const INVENTORY: { name: string; sku: string; status: StockStatus; label: string; onHand: string; reorder: string; cost: string; updated: string }[] = [
  { name: "Oat milk, 1 L", sku: "OAT-1L", status: "bad", label: "Out soon", onHand: "2", reorder: "12", cost: "$3.10", updated: "14:32" },
  { name: "12 oz hot cups", sku: "CUP-12H", status: "warn", label: "Low", onHand: "40", reorder: "200", cost: "$0.08", updated: "14:32" },
  { name: "Espresso beans, 1 kg", sku: "ESP-1KG", status: "warn", label: "Low", onHand: "1.5", reorder: "4", cost: "$18.40", updated: "13:05" },
  { name: "Croissant, butter", sku: "BAK-CRS", status: "ok", label: "In stock", onHand: "36", reorder: "12", cost: "$1.25", updated: "07:10" },
  { name: "Whole milk, 4 L", sku: "MLK-4L", status: "ok", label: "In stock", onHand: "9", reorder: "4", cost: "$4.60", updated: "07:10" },
];

const MOTION = [
  ["Sidebar width", "220ms cubic-bezier(0.4,0,0.2,1)"],
  ["Bottom-bar tap", "spring · damping 18 · stiffness 450 · scale 0.9"],
  ["Bottom-bar indicator", "spring · damping 25 · stiffness 350"],
  ["Overlay", "bg-black/10 backdrop-blur-xs · fade 100ms"],
  ["Popover", "fade-in-0 zoom-in-95"],
  ["Sheets (legacy)", "slideUp / slideInRight 300ms ease-out"],
  ["Landing only", "mv-* reveals 700ms; never inside /manager/"],
] as const;

const BREAKPOINTS = [
  ["default", "0", "Mobile first, bottom bar"],
  ["md:", "768", "Inputs drop to text-sm; use-is-mobile threshold"],
  ["lg:", "1024", "Page header, brand panel visible"],
  ["xl:", "1280", "Breadcrumbs visible"],
] as const;

const FILES = [
  ["app/globals.css", "Tokens, dark mode, mobile touch-target rules, keyframes"],
  ["components.json", "shadcn config: style base-nova, base color neutral, Lucide"],
  ["components/ui/*.tsx", "Primitives (Base UI + cva)"],
  ["components/sidebar.tsx", "Desktop shell, resizable panels, store switcher, mobile drawer"],
  ["components/bottom-bar.tsx", "Mobile navigation"],
  ["components/page-header.tsx · page-tabs.tsx", "Page chrome"],
  ["components/logo.tsx · public/logo.svg", "Mark"],
  ["design-system/README.md · tokens.css · logo/", "Written snapshot of this page"],
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Section({ id, eyebrow, title, lede, children }: { id: string; eyebrow: string; title: string; lede?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-16 border-b border-border py-8 first:pt-0 last:border-b-0">
      <p className="mb-2 font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">{eyebrow}</p>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {lede && <p className="mt-1.5 max-w-[62ch] text-sm text-muted-foreground">{lede}</p>}
      {children}
    </section>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-6 mb-2.5 text-[13px] font-semibold">{children}</h3>;
}

function Hint({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-xs text-muted-foreground", className)}>{children}</p>;
}

function SpecTable({ head, rows }: { head?: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        {head && (
          <TableHeader>
            <TableRow>{head.map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow>
          </TableHeader>
        )}
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}>
              {r.map((c, j) => <TableCell key={j} className={cn("whitespace-normal text-[13px]", j === 0 && "font-medium")}>{c}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function TokenPane({ title, tokens, dark }: { title: string; tokens: readonly (readonly [string, string, string])[]; dark?: boolean }) {
  return (
    <div className={cn("rounded-lg border p-3.5", dark ? "border-[#282828] bg-[#0a0a0a] text-[#fafafa]" : "border-[#e5e5e5] bg-white text-[#0a0a0a]")}>
      <p className="mb-2.5 font-mono text-[10.5px] uppercase tracking-wider opacity-60">{title}</p>
      {tokens.map(([name, hex, rgb]) => (
        <div key={name} className={cn("flex items-center gap-2 border-b py-1.5 text-xs last:border-b-0", dark ? "border-[#282828]" : "border-[#e5e5e5]")}>
          <span className={cn("h-[18px] w-[18px] shrink-0 rounded-[3px] border", dark ? "border-[#282828]" : "border-[#e5e5e5]")} style={{ background: hex }} />
          <span>{name}</span>
          <span className="ml-auto font-mono text-[10.5px] opacity-60">{rgb}</span>
        </div>
      ))}
    </div>
  );
}

const STATUS_PILL: Record<StockStatus, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-400",
  warn: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  bad: "border-red-200 bg-red-50 text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400",
};

function StatusPill({ status, children, className }: { status: StockStatus | "mute"; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn(
      "inline-flex h-5 items-center gap-1.5 rounded border px-2 text-xs font-medium",
      status === "mute" ? "border-border bg-muted text-muted-foreground" : STATUS_PILL[status],
      className,
    )}>
      <i className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded-[3px] border border-border bg-muted px-1 font-mono text-[12px]">{children}</code>;
}

function NavIcon({ icon: Icon, className }: { icon: React.ComponentType<{ className?: string }>; className?: string }) {
  return <Icon className={className} />;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DesignSystemPage() {
  const [track, setTrack] = useState(true);
  const [online, setOnline] = useState(false);
  const [pos, setPos] = useState(true);
  const [taxable, setTaxable] = useState(false);
  const [range, setRange] = useState<"day" | "week" | "month">("week");
  const [plan, setPlan] = useState<"monthly" | "yearly">("yearly");

  return (
    <div className="h-dvh overflow-y-auto overscroll-contain bg-background text-foreground [&_code]:rounded-[3px] [&_code]:border [&_code]:border-border [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-[12px]">
      {/* Top bar */}
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2.5 border-b border-border bg-background px-4 sm:px-6">
        <MerchivaLogo size={22} />
        <span className="text-[13px] font-semibold tracking-tight">Merchiva</span>
        <span className="ml-auto hidden font-mono text-[11px] text-muted-foreground sm:inline">
          design-system · snapshot 2026-09-11 · source: app/globals.css, components/ui
        </span>
      </header>

      <div className="mx-auto grid max-w-[1180px] gap-0 px-4 sm:px-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-10">
        {/* TOC */}
        <nav aria-label="Sections" className="flex flex-wrap gap-0.5 border-b border-border py-3 text-xs lg:sticky lg:top-14 lg:block lg:self-start lg:border-b-0 lg:py-7">
          {TOC.map((g) => (
            <div key={g.group} className="contents lg:block">
              <p className="hidden px-2 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground first:pt-0 lg:block">{g.group}</p>
              {g.items.map((it) => (
                <a key={it.id} href={`#${it.id}`} className="block rounded px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">{it.label}</a>
              ))}
            </div>
          ))}
        </nav>

        <main className="min-w-0 pt-7 pb-20">
          {/* Intro */}
          <section className="border-b border-border pb-8">
            <p className="mb-2 font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">Merchiva · Next.js 16 · shadcn/ui base-nova · Tailwind v4</p>
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight">The design system as it ships today</h1>
            <p className="mt-2 max-w-[62ch] text-sm text-muted-foreground">
              Read from the code, not from the old brief. Neutral gray tokens, 2.4px corners, 1px borders instead of shadows,
              Inter for interface text and a monospace face for every number. Where the older design.md disagrees with the code,
              the code is documented here and the gap is listed under Known drift.
            </p>
          </section>

          <Section id="principles" eyebrow="Foundations" title="Principles">
            <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {PRINCIPLES.map((p) => (
                <div key={p.title} className="rounded-lg border border-border p-3.5">
                  <p className="text-[13px] font-semibold">{p.title}</p>
                  <Hint className="mt-1">{p.body}</Hint>
                </div>
              ))}
            </div>
          </Section>

          <Section
            id="color"
            eyebrow="Foundations"
            title="Color"
            lede={<>Plain <Code>rgb()</Code> tokens in <Code>app/globals.css</Code>, mapped to Tailwind through <Code>@theme inline</Code>. Dark mode is the <Code>.dark</Code> class on <Code>&lt;html&gt;</Code>. No hue anywhere except status colors and the chart ramp.</>}
          >
            <H3>Semantic tokens, light and dark</H3>
            <div className="grid gap-3 md:grid-cols-2">
              <TokenPane title="Light · :root" tokens={LIGHT_TOKENS} />
              <TokenPane title="Dark · .dark" tokens={DARK_TOKENS} dark />
            </div>

            <H3>Chart ramp (same in both modes)</H3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {CHART.map(([name, cls, rgb]) => (
                <div key={name} className="overflow-hidden rounded-lg border border-border">
                  <div className={cn("h-11", cls)} />
                  <div className="flex justify-between gap-1.5 px-2 py-1.5 text-[11px]">
                    <span className="font-medium">{name}</span>
                    <span className="font-mono text-[10.5px] text-muted-foreground">{rgb}</span>
                  </div>
                </div>
              ))}
            </div>

            <H3>Status colors (hardcoded Tailwind, by convention)</H3>
            <div className="flex flex-wrap gap-2">
              <StatusPill status="ok">In stock · emerald-600 / 700</StatusPill>
              <StatusPill status="warn">Low stock · amber-600 / 700 on amber-50</StatusPill>
              <StatusPill status="bad">Out of stock · red-600 on red-50</StatusPill>
              <StatusPill status="mute">Archived · muted-foreground</StatusPill>
            </div>
            <Hint className="mt-2.5">Dark variants: <Code>text-emerald-400</Code>, <Code>bg-amber-950 border-amber-900 text-amber-300</Code>, <Code>text-destructive</Code>. <Code>sky</Code>, <Code>violet</Code>, <Code>rose</Code> appear in small numbers and are not standardized.</Hint>
          </Section>

          <Section
            id="type"
            eyebrow="Foundations"
            title="Typography"
            lede={<><Code>app/layout.tsx</Code> loads Inter as <Code>--font-sans</Code> and Geist Mono as <Code>--font-geist-mono</Code> via next/font. Sizes below are the ones actually used in the shell, including the bracketed pixel sizes.</>}
          >
            <div className="mt-4">
              {TYPE_SCALE.map((t) => (
                <div key={t.k} className="grid items-baseline gap-1 border-b border-border py-2.5 last:border-b-0 md:grid-cols-[180px_minmax(0,1fr)] md:gap-4">
                  <p className="font-mono text-[10.5px] text-muted-foreground">{t.k}</p>
                  <p className={t.cls}>{t.text}</p>
                </div>
              ))}
              <div className="grid items-baseline gap-1 py-2.5 md:grid-cols-[180px_minmax(0,1fr)] md:gap-4">
                <p className="font-mono text-[10.5px] text-muted-foreground">Tabular column</p>
                <div className="grid w-[110px] text-right font-mono text-sm tabular-nums"><span>1,204.00</span><span>12,400.58</span><span>124,005.80</span></div>
              </div>
            </div>
          </Section>

          <Section
            id="shape"
            eyebrow="Foundations"
            title="Radius & spacing"
            lede={<><Code>--radius: 0.15rem</Code> (2.4px). Sharper than the 0.3rem in the old brief. <Code>--spacing: 0.24rem</Code>, so every Tailwind spacing utility is 4% smaller than stock.</>}
          >
            <H3>Radius tokens</H3>
            <div className="flex flex-wrap gap-3">
              {RADII.map((r) => (
                <div key={r.label} className="grid h-14 w-[88px] place-items-end border border-foreground p-1.5 font-mono text-[10px] text-muted-foreground" style={{ borderRadius: r.px }}>
                  <span className="justify-self-start">{r.label}</span>
                </div>
              ))}
              <div className="grid h-14 w-14 place-items-center rounded-full border border-foreground font-mono text-[10px] text-muted-foreground">full</div>
            </div>
            <Hint className="mt-2.5"><Code>rounded-lg</Code> on controls, cards, dialogs. <Code>rounded</Code> on badges and sidebar rows. <Code>rounded-full</Code> only for switches, counters and the bottom-bar pill.</Hint>

            <H3>Spacing scale at 0.24rem</H3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Utility</TableHead>
                    {SPACING.map(([u]) => <TableHead key={u}>{u}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>px</TableCell>
                    {SPACING.map(([u, px]) => <TableCell key={u} className="font-mono tabular-nums">{px}</TableCell>)}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </Section>

          <Section
            id="buttons"
            eyebrow="Components · components/ui/button.tsx"
            title="Buttons"
            lede={<>Six variants, four heights plus icon sizes. Base UI primitive, <Code>rounded-lg</Code>, <Code>font-medium</Code>, <Code>active:translate-y-px</Code>, and <Code>hapticLight()</Code> on every click.</>}
          >
            <H3>Variants</H3>
            <div className="flex flex-wrap items-center gap-2">
              <Button>Approve order</Button>
              <Button variant="outline">Export CSV</Button>
              <Button variant="secondary">Duplicate</Button>
              <Button variant="ghost">Cancel</Button>
              <Button variant="destructive">Delete product</Button>
              <Button variant="link">View details</Button>
              <Button disabled>Disabled</Button>
            </div>
            <H3>Sizes</H3>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="xs">xs · h-6</Button>
              <Button variant="outline" size="sm">sm · h-7</Button>
              <Button variant="outline">default · h-8</Button>
              <Button variant="outline" size="lg">lg · h-9</Button>
              <Button variant="outline" size="icon" aria-label="Add"><Plus /></Button>
              <Button><Plus />New product</Button>
            </div>
            <div className="mt-4">
              <SpecTable head={["Variant", "Classes"]} rows={BUTTON_VARIANT_SPECS.map(([v, c]) => [v, <Code key={v}>{c}</Code>])} />
            </div>
          </Section>

          <Section
            id="badges"
            eyebrow="Components · components/ui/badge.tsx"
            title="Badges"
            lede={<><Code>h-5 rounded px-2 text-xs font-medium</Code>. Variants mirror Button.</>}
          >
            <div className="mt-3.5 flex flex-wrap items-center gap-2">
              <Badge>Owner</Badge>
              <Badge variant="secondary">Manager</Badge>
              <Badge variant="outline">Staff</Badge>
              <Badge variant="destructive">Overdue</Badge>
              <Badge variant="ghost">Draft</Badge>
              <Badge variant="link">12 more</Badge>
            </div>
          </Section>

          <Section
            id="forms"
            eyebrow="Components · input, textarea, select, checkbox, switch, label"
            title="Form controls"
            lede={<>Every control is <Code>h-8</Code>, <Code>rounded-lg</Code>, <Code>border-input</Code> on a transparent ground. Focus is <Code>ring-3 ring-ring/50</Code>; invalid swaps in <Code>destructive</Code>. Date and time inputs open custom pickers.</>}
          >
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="ds-name">Product name</Label>
                <Input id="ds-name" defaultValue="Oat milk latte, 12 oz" />
                <Hint>Shown on receipts and the storefront.</Hint>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ds-sku">SKU</Label>
                <Input id="ds-sku" defaultValue="OML-12" aria-invalid className="font-mono" />
                <p className="text-xs text-destructive">This SKU already exists.</p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ds-cat">Category</Label>
                <Select defaultValue="beverages">
                  <SelectTrigger id="ds-cat" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beverages">Beverages</SelectItem>
                    <SelectItem value="bakery">Bakery</SelectItem>
                    <SelectItem value="retail">Retail</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ds-reorder">Reorder point</Label>
                <Input id="ds-reorder" defaultValue="24" className="font-mono" />
              </div>
              <div className="grid gap-1.5 md:col-span-2">
                <Label htmlFor="ds-notes">Notes</Label>
                <Textarea id="ds-notes" defaultValue="Supplier ships Tuesdays. Keep two cases in the back cooler." />
              </div>
              <div className="flex flex-wrap items-center gap-6 md:col-span-2">
                <div className="flex items-center gap-2"><Checkbox id="ds-track" checked={track} onCheckedChange={(v) => setTrack(v === true)} /><Label htmlFor="ds-track">Track inventory</Label></div>
                <div className="flex items-center gap-2"><Checkbox id="ds-online" checked={online} onCheckedChange={(v) => setOnline(v === true)} /><Label htmlFor="ds-online">Sell online</Label></div>
                <div className="flex items-center gap-2"><Switch id="ds-pos" checked={pos} onCheckedChange={setPos} /><Label htmlFor="ds-pos">Available at POS</Label></div>
                <div className="flex items-center gap-2"><Switch id="ds-tax" checked={taxable} onCheckedChange={setTaxable} /><Label htmlFor="ds-tax">Taxable</Label></div>
              </div>
            </div>
          </Section>

          <Section
            id="cards"
            eyebrow="Components · components/ui/card.tsx"
            title="Cards"
            lede={<><Code>rounded-lg border border-border bg-card py-4 gap-4</Code>, header and content <Code>px-4</Code>, footer <Code>border-t bg-muted/50 p-4</Code>. <Code>size=&quot;sm&quot;</Code> tightens to <Code>py-3 gap-3 px-3</Code>.</>}
          >
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Today&apos;s sales</CardTitle>
                  <CardDescription>Square · 41 orders</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="font-mono text-[22px] font-medium tabular-nums tracking-tight">$1,842.20</p>
                  <Hint className="mt-1"><span className="text-emerald-600 dark:text-emerald-400">+12.4%</span> vs last Thursday</Hint>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Low stock</CardTitle>
                  <CardDescription>Below reorder point</CardDescription>
                  <CardAction><Badge variant="destructive">3</Badge></CardAction>
                </CardHeader>
                <CardContent className="grid gap-1.5 text-[13px]">
                  <div className="flex justify-between"><span>Oat milk, 1 L</span><span className="font-mono text-red-600 dark:text-red-400">2 left</span></div>
                  <div className="flex justify-between"><span>12 oz cups</span><span className="font-mono text-amber-700 dark:text-amber-300">40 left</span></div>
                  <div className="flex justify-between"><span>Espresso beans</span><span className="font-mono text-amber-700 dark:text-amber-300">1.5 kg</span></div>
                </CardContent>
                <CardFooter className="justify-end gap-2">
                  <Button variant="outline" size="sm">Dismiss</Button>
                  <Button size="sm">Order from supplier</Button>
                </CardFooter>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>On shift</CardTitle>
                  <CardDescription>Front of house</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-1.5 text-[13px]">
                  <div className="flex justify-between"><span>Priya</span><span className="font-mono text-muted-foreground">08:00–14:00</span></div>
                  <div className="flex justify-between"><span>Marcus</span><span className="font-mono text-muted-foreground">10:00–18:00</span></div>
                  <div className="flex justify-between"><span>Lin</span><span className="font-mono text-muted-foreground">14:00–21:00</span></div>
                </CardContent>
              </Card>
            </div>
          </Section>

          <Section
            id="tables"
            eyebrow="Components · components/ui/table.tsx"
            title="Tables"
            lede={<>Head <Code>h-8 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground</Code>. Row <Code>border-b hover:bg-muted/50</Code>. Cell <Code>py-2 px-3 whitespace-nowrap</Code>. Numbers right-aligned in mono.</>}
          >
            <div className="mt-4 overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">On hand</TableHead>
                    <TableHead className="text-right">Reorder</TableHead>
                    <TableHead className="text-right">Unit cost</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {INVENTORY.map((r) => (
                    <TableRow key={r.sku}>
                      <TableCell>{r.name}</TableCell>
                      <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                      <TableCell><StatusPill status={r.status}>{r.label}</StatusPill></TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{r.onHand}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{r.reorder}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{r.cost}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{r.updated}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={5}>5 items · 2 below reorder point</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">$27.43</TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </Section>

          <Section id="states" eyebrow="Components · loading, empty, error" title="States">
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border p-8 text-center">
                <Package className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No products yet. Import from Square or add one.</p>
                <Button variant="outline" size="sm">Add product</Button>
              </div>
              <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border p-8 text-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                <Hint>Loading · <Code>Loader2 h-4 w-4 animate-spin</Code></Hint>
              </div>
              <div className="flex flex-col gap-3 rounded-lg border border-border p-8">
                <p className="text-sm text-destructive">Couldn&apos;t reach SpacetimeDB. Check your connection and try again.</p>
                <Hint>Inline: <Code>text-destructive text-sm</Code>. Toasts: Sonner, top-center, richColors.</Hint>
              </div>
            </div>
          </Section>

          <Section
            id="composites"
            eyebrow="Components · components/ui, added 2026-09-11"
            title="Shared composites"
            lede="Built from the primitives so pages stop hand-rolling the same blocks. Every example below is the real component."
          >
            <H3>StatusBadge · five tones, nothing else</H3>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone="success" dot>In stock</StatusBadge>
              <StatusBadge tone="warning" dot>Low stock</StatusBadge>
              <StatusBadge tone="danger" dot>Out of stock</StatusBadge>
              <StatusBadge tone="info">Synced</StatusBadge>
              <StatusBadge tone="neutral">Archived</StatusBadge>
              <StatusBadge tone="warning" size="xs">Pending</StatusBadge>
              <StatusBadge tone="neutral" size="xs">Draft</StatusBadge>
            </div>
            <Hint className="mt-2"><Code>tone=&quot;success | warning | danger | info | neutral&quot;</Code>. Orange, yellow, blue, rose and violet all map onto one of these. <Code>STATUS_TONE_TEXT</Code> gives the matching text colour for deltas.</Hint>

            <H3>StatTile + StatGrid</H3>
            <StatGrid>
              <StatTile label="Today's sales" value="$1,842.20" delta="+12.4%" deltaTone="success" sub="vs last Thu" icon={DollarSign} />
              <StatTile label="Orders" value={<Num value={41} />} sub="Square" icon={TrendingUp} />
              <StatTile label="Low stock" value={<Num value={3} />} sub="below reorder point" icon={Package} tone="danger" />
              <StatTile label="On shift" value="3 / 5" sub="front of house" icon={Users} />
            </StatGrid>

            <H3>EmptyState</H3>
            <div className="grid gap-3 md:grid-cols-2">
              <Card><EmptyState icon={Inbox} title="No requests" description="Time off and shift trades waiting for you show up here." /></Card>
              <Card><EmptyState icon={Package} description="No products yet. Import from Square or add one." action={<Button variant="outline" size="sm">Add product</Button>} /></Card>
            </div>

            <H3>SegmentedControl</H3>
            <div className="flex flex-wrap items-center gap-4">
              <SegmentedControl
                aria-label="Range"
                value={range}
                onChange={setRange}
                options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }]}
              />
              <SegmentedControl
                aria-label="Filter"
                variant="chips"
                size="sm"
                value={range}
                onChange={setRange}
                options={[{ value: "day", label: "All", count: 12 }, { value: "week", label: "Unread", count: 3 }, { value: "month", label: "Mentions" }]}
              />
            </div>
            <Hint className="mt-2">Single-select only. Active is <Code>bg-primary text-primary-foreground</Code>. <Code>variant=&quot;joined&quot;</Code> for mode toggles, <Code>variant=&quot;chips&quot;</Code> for filters with counts.</Hint>

            <H3>OptionRow</H3>
            <div className="grid max-w-md gap-2">
              <OptionRow selected={plan === "monthly"} onSelect={() => setPlan("monthly")} title="Pro · monthly" description="Cancel any time" meta={<Num value="$29" />} />
              <OptionRow selected={plan === "yearly"} onSelect={() => setPlan("yearly")} title="Pro · yearly" description="Two months free" meta={<span className="flex items-center gap-2"><StatusBadge tone="success" size="xs">-17%</StatusBadge><Num value="$290" /></span>} />
            </div>

            <H3>Field · Callout · DialogActions</H3>
            <Card>
              <CardContent className="grid gap-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Supplier email" htmlFor="ds-sup" hint="Purchase orders are sent here."><Input id="ds-sup" defaultValue="orders@dairyco.example" /></Field>
                  <Field label="Lead time (days)" htmlFor="ds-lead" error="Must be between 1 and 30." required><Input id="ds-lead" defaultValue="45" aria-invalid className="font-mono" /></Field>
                </div>
                <Field label="Width" htmlFor="ds-w" layout="inline"><Input id="ds-w" defaultValue="320" className="h-7 font-mono" /></Field>
                <Callout tone="warning" icon={AlertTriangle} title="Offline" action={<Button variant="outline" size="xs">Retry</Button>}>
                  3 orders are queued and will sync when the connection returns.
                </Callout>
                <DialogActions onCancel={() => {}} onConfirm={() => {}} confirmLabel="Send order" />
              </CardContent>
            </Card>

            <H3>Avatar · IconTile · Num / Money / NumCell</H3>
            <div className="flex flex-wrap items-center gap-3">
              <Avatar name="Priya Patel" size="sm" />
              <Avatar name="Marcus Lee" />
              <Avatar name="Lin Zhao" size="lg" />
              <Avatar name="Corner Coffee" size="lg" shape="square" />
              <IconTile icon={Package} size="sm" />
              <IconTile icon={Package} />
              <IconTile icon={Package} size="lg" tone="warning" />
              <span className="ml-2 flex items-baseline gap-3">
                <Num value={1240.5} decimals={2} />
                <Num value="+$1,240.50" tone="success" />
                <Num value="-$86.20" tone="danger" size="xs" />
                <Num value="2026-09-11 14:32" size="xs" muted />
              </span>
            </div>
            <div className="mt-3 max-w-md overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                <TableBody>
                  <TableRow><TableCell>Oat milk, 1 L</TableCell><NumCell>12</NumCell><NumCell>$37.20</NumCell></TableRow>
                  <TableRow><TableCell>Espresso beans, 1 kg</TableCell><NumCell>4</NumCell><NumCell>$73.60</NumCell></TableRow>
                </TableBody>
              </Table>
            </div>
            <Hint className="mt-2">Every number goes through <Code>Num</Code>, <Code>Money</Code> (org currency, needs the app provider) or <Code>NumCell</Code> so <Code>font-mono tabular-nums</Code> is never forgotten. <Code>Eyebrow</Code> is the label above: <Eyebrow as="span">Section label</Eyebrow> / <Eyebrow as="span" size="xs">micro label</Eyebrow>.</Hint>
          </Section>

          <Section
            id="nav"
            eyebrow="Shell · sidebar.tsx, page-header.tsx, page-tabs.tsx, bottom-bar.tsx"
            title="Navigation"
            lede="Desktop is three resizable panels: sidebar 220px (min 140, max 360, collapses to 64), content, right panel 420px (min 220, max 680, collapses to 44). Mobile swaps the sidebar for a 280px drawer and a bottom bar."
          >
            <div className="mt-4 grid items-start gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
              {/* Sidebar specimen */}
              <div className="w-[220px] max-w-full overflow-hidden rounded-lg border border-border bg-background text-[13px]">
                <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
                  <span className="grid h-7 w-7 place-items-center rounded bg-foreground"><MerchivaLogo size={16} fg="var(--background)" /></span>
                  <span className="font-medium">Corner Coffee</span>
                  <ChevronsUpDown className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="space-y-0.5 px-2 py-3">
                  {[
                    { icon: LayoutDashboard, label: "Dashboard" },
                    { icon: Package, label: "Inventory", active: true, dot: true },
                    { icon: ShoppingBag, label: "Products" },
                    { icon: TrendingUp, label: "Sales" },
                    { icon: Users, label: "Personnel" },
                    { icon: Monitor, label: "POS" },
                  ].map((it) => (
                    <div
                      key={it.label}
                      className={cn(
                        "flex items-center gap-2.5 rounded px-2.5 py-1.5 font-medium transition-colors",
                        it.active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <span className="relative flex shrink-0"><NavIcon icon={it.icon} className="h-[15px] w-[15px]" /><NotificationDot show={!!it.dot} className={it.active ? "ring-foreground" : undefined} /></span>
                      <span className="flex-1 truncate">{it.label}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-0.5 border-t border-border px-2 py-3">
                  <div className="flex items-center gap-2.5 rounded px-2.5 py-1.5 font-medium text-muted-foreground"><Settings className="h-[15px] w-[15px]" />Settings</div>
                </div>
              </div>

              <div className="grid min-w-0 gap-4">
                {/* Page header specimen */}
                <div className="flex h-14 items-center gap-3 rounded-lg border border-border px-6">
                  <div className="hidden items-center gap-1.5 text-xs text-muted-foreground xl:flex">
                    <span>Inventory</span><span className="text-border">/</span><span className="text-foreground">Waste Log</span>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-semibold leading-tight">Waste Log</div>
                    <div className="truncate text-[11.5px] leading-tight text-muted-foreground">14 entries this week · $86.20 written off</div>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <Button variant="outline" size="sm">Export</Button>
                    <Button size="sm">Log waste</Button>
                  </div>
                </div>
                {/* Page tabs specimen */}
                <div className="flex overflow-x-auto border-b border-border bg-background">
                  {["Inventory", "Suppliers", "Waste Log", "Counts"].map((t, i) => (
                    <span key={t} className={cn("shrink-0 border-b-2 px-3.5 py-2 text-[12px] font-medium", i === 0 ? "border-foreground text-foreground" : "border-transparent text-muted-foreground")}>{t}</span>
                  ))}
                </div>
                <Hint>
                  Page header: <Code>hidden lg:flex h-14 border-b px-6</Code>, breadcrumbs <Code>hidden xl:flex text-xs</Code>, title <Code>text-[15px] font-semibold</Code>, subtitle <Code>text-[11.5px] text-muted-foreground</Code>.
                  Page tabs: <Code>px-3.5 py-2 text-[12px] font-medium border-b-2</Code>, active <Code>border-foreground</Code>.
                  Sidebar item: <Code>rounded text-[13px] font-medium px-2.5 py-1.5 gap-2.5</Code>, active <Code>bg-foreground text-background</Code>, icon <Code>h-[15px] w-[15px]</Code>; something new is a <Code>NotificationDot</Code> on the icon&apos;s top-end corner (<Code>ring-foreground</Code> on the active row), never a count.
                </Hint>
              </div>
            </div>

            <H3>Mobile bottom bar</H3>
            <div className="flex w-[390px] max-w-full rounded-lg border border-border bg-background/95 pb-2 backdrop-blur-md">
              {[
                { icon: LayoutDashboard, label: "Dashboard", active: true },
                { icon: Package, label: "Inventory" },
                { icon: TrendingUp, label: "Sales" },
                { icon: MessageSquare, label: "Channel" },
                { icon: MoreHorizontal, label: "More" },
              ].map((it) => (
                <div key={it.label} className={cn("relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1", it.active ? "text-foreground" : "text-muted-foreground")}>
                  {it.active && <span className="absolute top-0 h-[2px] w-7 rounded-full bg-foreground" />}
                  <div className={cn("relative flex h-8 w-14 items-center justify-center rounded-full", it.active && "bg-foreground/8")}>
                    <NavIcon icon={it.icon} className="h-[19px] w-[19px]" />
                  </div>
                  <span className={cn("text-[10.5px] leading-none tracking-tight", it.active ? "font-semibold" : "font-medium")}>{it.label}</span>
                </div>
              ))}
            </div>
            <Hint className="mt-2.5">
              <Code>fixed bottom-0 border-t bg-background/95 backdrop-blur-md</Code>. Item <Code>min-h-[52px]</Code>, icon 19px in a <Code>h-8 w-14 rounded-full</Code> pill (<Code>bg-foreground/8</Code> when active), 2px × 28px top indicator shared with <Code>layoutId</Code>, label 10.5px. Tap spring: scale 0.9, damping 18, stiffness 450. Touch targets ≥44px via <Code>html.mobile-device</Code>.
            </Hint>
          </Section>

          <Section
            id="logo"
            eyebrow="Shell · components/logo.tsx, public/logo.svg"
            title="Logo"
            lede={<>One flat &quot;M&quot; path in a 100×100 viewBox. No gradients, no hue, no shadow. Files are in <Code>design-system/logo/</Code>.</>}
          >
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div>
                <div className="grid aspect-square place-items-center rounded-lg border border-border bg-white"><MerchivaLogo size={56} fg="#0c0a09" /></div>
                <p className="mt-1.5 font-mono text-[10.5px] text-muted-foreground">merchiva-logo.svg · #0c0a09</p>
              </div>
              <div>
                <div className="grid aspect-square place-items-center rounded-lg border border-border bg-[#0a0a0a]"><MerchivaLogo size={56} fg="#fafafa" /></div>
                <p className="mt-1.5 font-mono text-[10.5px] text-muted-foreground">merchiva-logo-white.svg · #fafafa</p>
              </div>
              <div>
                <div className="grid aspect-square place-items-center rounded-lg border border-border"><MerchivaLogo size={56} fg="#fafafa" bg="#0a0a0a" rounded /></div>
                <p className="mt-1.5 font-mono text-[10.5px] text-muted-foreground">merchiva-logo-tile.svg · 12% radius</p>
              </div>
              <div>
                <div className="grid aspect-square place-items-center rounded-lg border border-border">
                  <span className="inline-flex items-center gap-2 text-[13px] font-semibold tracking-tight"><MerchivaLogo size={22} />Merchiva</span>
                </div>
                <p className="mt-1.5 font-mono text-[10.5px] text-muted-foreground">lockup · 22px + 13px semibold</p>
              </div>
            </div>
            <div className="mt-4">
              <SpecTable
                head={["Context", "Treatment"]}
                rows={[
                  ["Auth brand panel", <>22px mark, ink <Code>#292524</Code>, wordmark <Code>text-[13px] font-semibold tracking-tight</Code>, <Code>gap-2</Code></>],
                  ["Sidebar store tile", <><Code>h-7 w-7</Code> tile, mark in <Code>bg-foreground</Code> / <Code>text-background</Code></>],
                  ["App icon", <>Mark on near-black tile, 12% corner radius (<Code>icon-192.png</Code>, <Code>icon-512.png</Code>)</>],
                  ["React", <><Code>&lt;MerchivaLogo size={"{22}"} fg=&quot;#292524&quot; /&gt;</Code> · <Code>fg</Code> defaults to <Code>currentColor</Code>; <Code>bg</Code> + <Code>rounded</Code> add the tile</>],
                  ["Clear space", "At least 14% of the mark's width on every side (the path's own inset)"],
                ]}
              />
            </div>
          </Section>

          <Section id="motion" eyebrow="Shell" title="Motion & breakpoints">
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <SpecTable head={["Animation", "Spec"]} rows={MOTION.map(([a, s]) => [a, <Code key={a}>{s}</Code>])} />
              <SpecTable head={["Breakpoint", "Width", "Effect"]} rows={BREAKPOINTS.map(([b, w, e]) => [<Code key={b}>{b}</Code>, <span key={w} className="font-mono tabular-nums">{w}</span>, e])} />
            </div>
          </Section>

          <Section id="drift" eyebrow="Notes" title="Known drift between docs and code">
            <ol className="mt-3 max-w-[70ch] list-decimal space-y-2 pl-5 text-[13px]">
              <li><b>Radius is 0.15rem, not 0.3rem.</b> Changed in commit 3344896 (2026-05-17). <Code>design.md</Code> and some <Code>rounded-[0.3rem]</Code> pickers still assume 0.3rem. <Code>--radius-sm</Code> now clamps to 0.</li>
              <li><b>Tokens are <Code>rgb()</Code>, not <Code>oklch()</Code></b>, and the chart ramp is blue, not gray.</li>
              <li><b>Font declarations conflict.</b> <Code>globals.css :root</Code> declares Cascadia Code and JetBrains Mono while <Code>layout.tsx</Code> puts Inter and Geist Mono on the same element. <Code>font-mono</Code> maps to <Code>--font-mono</Code> (JetBrains Mono, not loaded), so data falls back to the system monospace. Fix: <Code>--font-mono: var(--font-geist-mono)</Code> in <Code>@theme inline</Code>, delete the leftovers.</li>
              <li><b><Code>font-heading</Code> on <Code>CardTitle</Code> is undefined</b> and silently inherits Inter.</li>
              <li><b>Dark <Code>sidebar-primary</Code> is blue</b> <Code>rgb(20 71 230)</Code>; unused by the sidebar today.</li>
              <li><b><Code>--spacing: 0.24rem</Code></b> shrinks every spacing utility by 4%. Do not mix in hardcoded px that assume a 4px grid.</li>
              <li><Code>design.md</Code> still says BizOps, Supabase and Clerk. <Code>design-system/README.md</Code> supersedes it.</li>
            </ol>
          </Section>

          <Section id="files" eyebrow="Notes" title="Where things live">
            <div className="mt-3">
              <SpecTable rows={FILES.map(([f, d]) => [<span key={f} className="font-mono text-xs whitespace-nowrap">{f}</span>, d])} />
            </div>
          </Section>
        </main>
      </div>
    </div>
  );
}
