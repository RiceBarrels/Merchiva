"use client";

import { useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Bell,
  Box,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Cloud,
  Code2,
  Copy,
  CreditCard,
  Database,
  Download,
  Edit,
  ExternalLink,
  Eye,
  File,
  Filter,
  Flag,
  Folder,
  Gift,
  Globe,
  Heart,
  Home,
  Image as ImageIcon,
  Info,
  Layers,
  Link2,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Menu,
  MessageSquare,
  Minus,
  MoreHorizontal,
  MousePointer,
  Package,
  Pencil,
  Phone,
  Pin,
  Play,
  Plus,
  Search,
  Settings,
  Share2,
  ShoppingCart,
  Sparkles,
  Star,
  Trash2,
  TrendingUp,
  Upload,
  User,
  X,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function SectionHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <div className="space-y-1">
      <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
        {eyebrow}
      </p>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

function Block({ label, children, className = "" }: { label?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {label && (
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
      )}
      {children}
    </div>
  );
}

function Swatch({ token, className }: { token: string; className: string }) {
  return (
    <div className="space-y-1.5">
      <div className={`h-14 rounded-[0.3rem] border border-border ${className}`} />
      <div className="flex items-baseline justify-between">
        <code className="font-mono text-[11px] text-foreground">{token}</code>
      </div>
    </div>
  );
}

function RadiusSwatch({ token, value }: { token: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <div
        className="h-16 border border-border bg-muted"
        style={{ borderRadius: value }}
      />
      <div className="space-y-0.5">
        <code className="font-mono text-[11px] text-foreground">{token}</code>
        <p className="font-mono text-[10px] text-muted-foreground">{value}</p>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

const COLORS = [
  { token: "background", cls: "bg-background" },
  { token: "foreground", cls: "bg-foreground" },
  { token: "card", cls: "bg-card" },
  { token: "popover", cls: "bg-popover" },
  { token: "primary", cls: "bg-primary" },
  { token: "primary-foreground", cls: "bg-primary-foreground" },
  { token: "secondary", cls: "bg-secondary" },
  { token: "muted", cls: "bg-muted" },
  { token: "muted-foreground", cls: "bg-muted-foreground" },
  { token: "accent", cls: "bg-accent" },
  { token: "destructive", cls: "bg-destructive" },
  { token: "border", cls: "bg-border" },
  { token: "input", cls: "bg-input" },
  { token: "ring", cls: "bg-ring" },
];

const CHART_COLORS = [
  { token: "chart-1", cls: "bg-chart-1" },
  { token: "chart-2", cls: "bg-chart-2" },
  { token: "chart-3", cls: "bg-chart-3" },
  { token: "chart-4", cls: "bg-chart-4" },
  { token: "chart-5", cls: "bg-chart-5" },
];

const RADII = [
  { token: "--radius-sm", value: "calc(var(--radius) * 0.6)" },
  { token: "--radius-md", value: "calc(var(--radius) * 0.8)" },
  { token: "--radius", value: "0.3rem" },
  { token: "--radius-lg", value: "var(--radius)" },
  { token: "--radius-xl", value: "calc(var(--radius) * 1.4)" },
  { token: "--radius-2xl", value: "calc(var(--radius) * 1.8)" },
  { token: "--radius-3xl", value: "calc(var(--radius) * 2.2)" },
];

const BUTTON_VARIANTS = ["default", "outline", "secondary", "ghost", "destructive", "link"] as const;
const BUTTON_SIZES = ["xs", "sm", "default", "lg"] as const;
const BADGE_VARIANTS = ["default", "secondary", "destructive", "outline"] as const;

const ICON_GRID = [
  Home, Settings, User, Mail, Bell, Search, Menu, Filter,
  Plus, Minus, X, Check, Edit, Pencil, Copy, Trash2,
  ChevronRight, ArrowRight, ExternalLink, Link2, Share2, Download, Upload, Eye,
  Heart, Star, Flag, Pin, Lock, Globe, Cloud, Database,
  Package, Box, Folder, File, Calendar, Clock, Activity, TrendingUp,
  Zap, Sparkles, Gift, CreditCard, ShoppingCart, MessageSquare, Phone, Info,
  Code2, Layers, Play, MousePointer, MoreHorizontal, LogOut, AlertCircle, Loader2,
  ImageIcon,
];

export default function DesignSystemPage() {
  const [switchOn, setSwitchOn] = useState(true);
  const [checked, setChecked] = useState(true);
  const [progress, setProgress] = useState(62);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Merchiva
            </span>
            <span className="h-3 w-px bg-border" />
            <span className="text-sm font-semibold tracking-tight">Design System</span>
          </div>
          <div className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
            <span>v0.1</span>
            <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
            <span>Built on shadcn/ui</span>
            <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
            <span>Base UI</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-16 px-6 py-10">
        {/* Intro */}
        <section className="space-y-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Foundations
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Compact, utilitarian, and calm.
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Merchiva is built as a tool — not a demo. The design language favors Stone / Slate
            tones, sharp 0.3rem radii, solid borders over diffuse shadows, and dense data
            layouts over empty whitespace. Every surface here reflects the production defaults.
          </p>
        </section>

        <Separator />

        {/* Color — system */}
        <section className="space-y-6">
          <SectionHeader
            eyebrow="01 · Color"
            title="Semantic tokens"
            description="All tokens are defined in oklch() — the palette adapts automatically between light and dark modes."
          />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-7">
            {COLORS.map((c) => (
              <Swatch key={c.token} token={c.token} className={c.cls} />
            ))}
          </div>

          <div className="pt-4">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Charts
            </p>
            <div className="grid grid-cols-5 gap-4">
              {CHART_COLORS.map((c) => (
                <Swatch key={c.token} token={c.token} className={c.cls} />
              ))}
            </div>
          </div>
        </section>

        <Separator />

        {/* Typography */}
        <section className="space-y-6">
          <SectionHeader
            eyebrow="02 · Typography"
            title="Inter for UI, Geist Mono for data"
          />

          <div className="grid gap-8 md:grid-cols-2">
            <div className="space-y-4">
              <Block label="Display · 2xl / semibold">
                <p className="text-3xl font-semibold tracking-tight">The quick brown fox</p>
              </Block>
              <Block label="Heading · xl / semibold">
                <p className="text-xl font-semibold tracking-tight">The quick brown fox</p>
              </Block>
              <Block label="Title · lg / medium">
                <p className="text-lg font-medium">The quick brown fox</p>
              </Block>
              <Block label="Body · sm">
                <p className="text-sm">
                  Jumps over the lazy dog — 0123456789. A paragraph of supporting copy
                  should sit at this weight and size for readability in tight panels.
                </p>
              </Block>
              <Block label="Caption · xs / muted">
                <p className="text-xs text-muted-foreground">
                  Micro-copy, help text, and secondary labels.
                </p>
              </Block>
            </div>

            <div className="space-y-4">
              <Block label="Monospace · data / sm">
                <p className="font-mono text-sm">SKU-0042 · $1,240.58</p>
              </Block>
              <Block label="Monospace · code / xs">
                <pre className="overflow-x-auto rounded-[0.3rem] border border-border bg-muted px-3 py-2 font-mono text-xs leading-relaxed">
{`import { Button } from "@/components/ui/button";

<Button variant="outline" size="sm">
  Confirm
</Button>`}
                </pre>
              </Block>
              <Block label="Tabular numerics">
                <div className="flex flex-col gap-1 font-mono text-sm tabular-nums">
                  <span>  1,204.00</span>
                  <span> 12,400.58</span>
                  <span>124,005.80</span>
                </div>
              </Block>
            </div>
          </div>
        </section>

        <Separator />

        {/* Radius & density */}
        <section className="space-y-6">
          <SectionHeader
            eyebrow="03 · Radius"
            title="Sharp by default"
            description="Base radius is 0.3rem — compact and structural, not soft."
          />
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-7">
            {RADII.map((r) => (
              <RadiusSwatch key={r.token} token={r.token} value={r.value} />
            ))}
          </div>
        </section>

        <Separator />

        {/* Buttons */}
        <section className="space-y-6">
          <SectionHeader
            eyebrow="04 · Buttons"
            title="Six variants · four sizes"
          />

          <Block label="Variants">
            <div className="flex flex-wrap items-center gap-2">
              {BUTTON_VARIANTS.map((v) => (
                <Button key={v} variant={v}>
                  {v}
                </Button>
              ))}
            </div>
          </Block>

          <Block label="Sizes">
            <div className="flex flex-wrap items-center gap-2">
              {BUTTON_SIZES.map((s) => (
                <Button key={s} size={s}>
                  Size {s}
                </Button>
              ))}
              <Button size="icon-xs" aria-label="plus"><Plus /></Button>
              <Button size="icon-sm" aria-label="plus"><Plus /></Button>
              <Button size="icon" aria-label="plus"><Plus /></Button>
              <Button size="icon-lg" aria-label="plus"><Plus /></Button>
            </div>
          </Block>

          <Block label="With icons">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="default"><Plus />New item</Button>
              <Button variant="outline"><Download />Export</Button>
              <Button variant="secondary"><Settings />Configure</Button>
              <Button variant="ghost"><Eye />Preview</Button>
              <Button variant="destructive"><Trash2 />Delete</Button>
              <Button variant="outline" disabled><Loader2 className="animate-spin" />Loading</Button>
            </div>
          </Block>
        </section>

        <Separator />

        {/* Badges */}
        <section className="space-y-6">
          <SectionHeader eyebrow="05 · Badges" title="Status & labels" />
          <div className="flex flex-wrap items-center gap-2">
            {BADGE_VARIANTS.map((v) => (
              <Badge key={v} variant={v}>{v}</Badge>
            ))}
            <Badge variant="default"><Check className="mr-1 h-3 w-3" />Verified</Badge>
            <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />Pending</Badge>
            <Badge variant="destructive"><AlertCircle className="mr-1 h-3 w-3" />Error</Badge>
            <Badge variant="outline"><Sparkles className="mr-1 h-3 w-3" />New</Badge>
          </div>
        </section>

        <Separator />

        {/* Form controls */}
        <section className="space-y-6">
          <SectionHeader eyebrow="06 · Inputs" title="Form controls" />

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <Block label="Text input">
                <div className="space-y-1.5">
                  <Label htmlFor="ds-name">Name</Label>
                  <Input id="ds-name" placeholder="Acme Industries" />
                </div>
              </Block>

              <Block label="Input · disabled">
                <Input disabled placeholder="Read only" />
              </Block>

              <Block label="Input · invalid">
                <Input aria-invalid placeholder="Something went wrong" />
              </Block>

              <Block label="Textarea">
                <Textarea rows={3} placeholder="Notes for the team…" />
              </Block>

              <Block label="Select">
                <Select defaultValue="pending">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </Block>
            </div>

            <div className="space-y-4">
              <Block label="Checkbox">
                <div className="flex items-center gap-2">
                  <Checkbox id="ds-cb" checked={checked} onCheckedChange={(v) => setChecked(v === true)} />
                  <Label htmlFor="ds-cb" className="cursor-pointer font-normal">
                    Subscribe to weekly summary
                  </Label>
                </div>
              </Block>

              <Block label="Switch">
                <div className="flex items-center gap-3">
                  <Switch id="ds-sw" checked={switchOn} onCheckedChange={setSwitchOn} />
                  <Label htmlFor="ds-sw" className="cursor-pointer font-normal">
                    {switchOn ? "Notifications on" : "Notifications off"}
                  </Label>
                </div>
              </Block>

              <Block label="Progress">
                <div className="space-y-2">
                  <Progress value={progress} />
                  <div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground">
                    <span>{progress}% complete</span>
                    <div className="flex gap-1">
                      <Button size="icon-xs" variant="outline" aria-label="decrease"
                        onClick={() => setProgress((p) => Math.max(0, p - 10))}
                      >
                        <Minus />
                      </Button>
                      <Button size="icon-xs" variant="outline" aria-label="increase"
                        onClick={() => setProgress((p) => Math.min(100, p + 10))}
                      >
                        <Plus />
                      </Button>
                    </div>
                  </div>
                </div>
              </Block>

              <Block label="Tabs">
                <Tabs defaultValue="overview">
                  <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="activity">Activity</TabsTrigger>
                    <TabsTrigger value="settings">Settings</TabsTrigger>
                  </TabsList>
                  <TabsContent value="overview" className="mt-2 text-sm text-muted-foreground">
                    Summary metrics go here.
                  </TabsContent>
                  <TabsContent value="activity" className="mt-2 text-sm text-muted-foreground">
                    Recent changes and events.
                  </TabsContent>
                  <TabsContent value="settings" className="mt-2 text-sm text-muted-foreground">
                    Per-account configuration.
                  </TabsContent>
                </Tabs>
              </Block>
            </div>
          </div>
        </section>

        <Separator />

        {/* Cards */}
        <section className="space-y-6">
          <SectionHeader eyebrow="07 · Surfaces" title="Cards & composite layouts" />

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Revenue · MTD</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-2xl tabular-nums">$42,108.20</p>
                <p className="mt-1 flex items-center gap-1 font-mono text-[11px] text-emerald-600">
                  <TrendingUp className="h-3 w-3" />
                  +8.4% vs. last month
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Active staff</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-2xl tabular-nums">12 / 18</p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  Scheduled today
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Low stock</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-2xl tabular-nums text-amber-600">7 SKUs</p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  Below minimum threshold
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <Separator />

        {/* Table */}
        <section className="space-y-6">
          <SectionHeader eyebrow="08 · Tables" title="Data-dense rows" />

          <div className="rounded-[0.3rem] border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px] font-mono text-[10px] uppercase tracking-wider">SKU</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-wider">Item</TableHead>
                  <TableHead className="text-right font-mono text-[10px] uppercase tracking-wider">Stock</TableHead>
                  <TableHead className="text-right font-mono text-[10px] uppercase tracking-wider">Cost</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-wider">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { sku: "SKU-0041", name: "Ethiopian Yirgacheffe", stock: 42, cost: 18.5, status: "In stock" },
                  { sku: "SKU-0042", name: "Kenyan AA",            stock:  6, cost: 21.0, status: "Low" },
                  { sku: "SKU-0043", name: "Guatemala Antigua",    stock:  0, cost: 17.2, status: "Out" },
                  { sku: "SKU-0044", name: "Sumatra Mandheling",   stock: 58, cost: 16.8, status: "In stock" },
                ].map((r) => (
                  <TableRow key={r.sku}>
                    <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                    <TableCell className="text-sm">{r.name}</TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">{r.stock}</TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">${r.cost.toFixed(2)}</TableCell>
                    <TableCell>
                      {r.status === "In stock" && <Badge variant="outline" className="font-normal">In stock</Badge>}
                      {r.status === "Low" && <Badge variant="secondary" className="font-normal">Low</Badge>}
                      {r.status === "Out" && <Badge variant="destructive" className="font-normal">Out</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        <Separator />

        {/* Icons */}
        <section className="space-y-6">
          <SectionHeader
            eyebrow="09 · Iconography"
            title="Lucide React"
            description="1.5px stroke, h-4 w-4 default. Use icons to reinforce — not replace — labels."
          />

          <div className="grid grid-cols-8 gap-1 rounded-[0.3rem] border border-border p-2 sm:grid-cols-12 md:grid-cols-16">
            {ICON_GRID.map((Icon, i) => (
              <div
                key={i}
                className="group flex aspect-square items-center justify-center rounded-[0.2rem] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title={Icon.displayName}
              >
                <Icon className="h-4 w-4" />
              </div>
            ))}
          </div>
        </section>

        <Separator />

        {/* Principles */}
        <section className="space-y-6">
          <SectionHeader eyebrow="10 · Principles" title="How we make decisions" />

          <div className="grid gap-4 md:grid-cols-2">
            {[
              {
                title: "Tools, not demos",
                body: "Optimize for the fifth-time user. Density beats decoration; clarity beats delight.",
              },
              {
                title: "Solid over diffuse",
                body: "A 1px border always wins against a glowing shadow. Structure is a feature.",
              },
              {
                title: "Monospace for data",
                body: "Numbers, IDs, and code get Geist Mono. Prose and UI get Inter. Never cross the streams.",
              },
              {
                title: "Motion with purpose",
                body: "Micro-translations confirm intent. No particles, no typewriter reveals, no slow transitions.",
              },
            ].map((p) => (
              <div key={p.title} className="rounded-[0.3rem] border border-border p-4">
                <h3 className="text-sm font-semibold tracking-tight">{p.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="pb-6 pt-10 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          — End of design system —
        </div>
      </main>
    </div>
  );
}
