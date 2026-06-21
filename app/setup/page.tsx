"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MerchivaLogo } from "@/components/logo";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Check, ArrowRight, ArrowLeft, Monitor, Package, Users, TrendingUp, ShoppingBag, Layout, Heart, Coffee, Wrench, SlidersHorizontal, UserPlus, Rocket, Link2, Copy, Mail, X, Plus, Upload, Contact, Shield, Info, SkipForward, Send, ChefHat, ShieldCheck, Database, CreditCard, MailCheck, UserCog, ChevronDown, ChevronUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Spinner } from "@/components/ui/loaders/geometric";

// ─── Feature / preset data ─────────────────────────────────

interface Feature {
  id: string;
  icon: LucideIcon;
  label: string;
  desc: string;
  badge?: string;
  recommended?: boolean;
  defaultOn: boolean;
  addon?: boolean;
  meta: string;
}

const FEATURES: Feature[] = [
  { id: "pos", icon: Monitor, label: "Point of Sale", desc: "Run registers, take payments, print receipts.", badge: "Recommended", recommended: true, defaultOn: true, meta: "Connects to Stripe Terminal · iPad / Android" },
  { id: "inventory", icon: Package, label: "Inventory", desc: "Track SKUs, stock counts, low-stock alerts, suppliers.", badge: "Recommended", recommended: true, defaultOn: true, meta: "Sync with shipments · barcode scanner" },
  { id: "staffing", icon: Users, label: "Staffing & Schedules", desc: "Shifts, time-off, punch-in / punch-out, payroll export.", badge: "Recommended", recommended: true, defaultOn: true, meta: "Gusto · Deputy · CSV" },
  { id: "sales", icon: TrendingUp, label: "Sales Reporting", desc: "Daily / weekly revenue, SKU performance, tax summaries.", defaultOn: true, meta: "Daily digest email · CSV exports" },
  { id: "products", icon: ShoppingBag, label: "Products Catalog", desc: "Pricing, variants, modifiers, photos, kitchen display.", defaultOn: true, meta: "Required for POS" },
  { id: "website", icon: Layout, label: "Online Storefront", desc: "Public site, menu, online ordering, pickup & delivery.", badge: "Beta", defaultOn: false, meta: "Custom domain support · v2.4 beta" },
  { id: "kds", icon: ChefHat, label: "Kitchen Display", desc: "Route tickets to bar / kitchen screens, course timing.", defaultOn: false, meta: "Restaurants only" },
  { id: "loyalty", icon: Heart, label: "Loyalty & Marketing", desc: "Points, member tiers, SMS / email campaigns.", badge: "Add-on", defaultOn: false, addon: true, meta: "Add-on pricing after 30-day trial" },
];

const PRESETS = [
  { id: "cafe", icon: Coffee, label: "Café / Bakery", desc: "POS + inventory + staffing + KDS" },
  { id: "retail", icon: ShoppingBag, label: "Retail Shop", desc: "POS + inventory + sales + storefront" },
  { id: "svc", icon: Wrench, label: "Service & Repair", desc: "Staffing + sales + loyalty" },
  { id: "custom", icon: SlidersHorizontal, label: "Custom", desc: "Pick everything yourself" },
];

const PRESET_CONFIGS: Record<string, Record<string, boolean>> = {
  cafe: { pos: true, inventory: true, staffing: true, sales: true, products: true, website: false, kds: true, loyalty: false },
  retail: { pos: true, inventory: true, staffing: true, sales: true, products: true, website: true, kds: false, loyalty: false },
  svc: { pos: false, inventory: false, staffing: true, sales: true, products: false, website: false, kds: false, loyalty: true },
};

const ROLES = [
  { id: "Owner", desc: "Everything · billing · delete workspace" },
  { id: "Manager", desc: "Most things, except billing & destructive ops" },
  { id: "Cashier", desc: "POS · clock in/out · own sales" },
  { id: "Kitchen", desc: "KDS only · no pricing or inventory edits" },
  { id: "View", desc: "Read-only · reports & schedules" },
];

// ─── Stepper ───────────────────────────────────────────────

function OnbStepper({ step }: { step: number }) {
  const steps = ["Account", "Workspace", "Features", "Invite"];
  return (
    <div className="flex items-center gap-1.5 mb-5">
      {steps.map((label, i, arr) => {
        const done = i < step;
        const active = i === step;
        return (
          <div key={label} className="contents">
            <div className="flex items-center gap-1.5">
              <div className={cn(
                "w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-semibold font-mono",
                active || done ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
              )}>
                {done ? <Check className="h-[11px] w-[11px]" strokeWidth={3} /> : i + 1}
              </div>
              <span className={cn(
                "text-[11.5px]",
                active ? "font-semibold text-foreground" : done ? "font-medium text-muted-foreground" : "font-medium text-muted-foreground/60"
              )}>{label}</span>
            </div>
            {i < arr.length - 1 && (
              <div className={cn("flex-1 h-px mx-0.5", i < step ? "bg-muted-foreground/40" : "bg-border")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Toggle ────────────────────────────────────────────────

function Toggle({ on }: { on: boolean }) {
  return (
    <div className={cn("w-8 h-[18px] rounded-full relative shrink-0 transition-colors duration-200", on ? "bg-foreground" : "bg-stone-300 dark:bg-stone-700")}>
      <div className={cn("w-3.5 h-3.5 rounded-full bg-white dark:bg-stone-900 absolute top-[2px] shadow-sm transition-[left] duration-200", on ? "left-4" : "left-[2px]")} />
    </div>
  );
}

// ─── Step 1: Welcome ───────────────────────────────────────

function WelcomeStep({ orgName, onNext, onSkip }: { orgName: string; onNext: () => void; onSkip: () => void }) {
  const initials = orgName.slice(0, 2).toUpperCase();
  return (
    <div className="w-full max-w-md mx-auto">
      <OnbStepper step={2} />
      <h1 className="text-[22px] font-semibold tracking-tight leading-tight mb-1">Workspace ready,<br />let&apos;s wire it up.</h1>
      <p className="text-[13px] text-muted-foreground leading-relaxed mb-5">Two short steps left — choose what Merchiva should do for you, then bring your team in.</p>

      <div className="border border-border rounded-[0.3rem] bg-muted/30 p-4 flex gap-3.5 mb-4">
        <div className="w-11 h-11 rounded-[0.3rem] bg-foreground text-background flex items-center justify-center text-base font-bold tracking-tight shrink-0">{initials}</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">{orgName}</div>
          <div className="text-[11.5px] text-muted-foreground font-mono mt-0.5">merchiva.app</div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {([[ShieldCheck, "SSL provisioned"], [Database, "Storage seeded"], [CreditCard, "Payments ready"], [MailCheck, "Owner verified"]] as [LucideIcon, string][]).map(([Icon, label]) => (
              <span key={label} className="inline-flex items-center gap-1.5 h-[22px] px-1.5 border border-border rounded-[0.3rem] bg-background text-[11px] text-muted-foreground font-medium">
                <Icon className="h-3 w-3 text-emerald-600" />{label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 mb-4">
        {[{ icon: SlidersHorizontal, title: "Pick features", desc: "Toggle the modules you actually need. Change later in Settings." }, { icon: UserPlus, title: "Invite the team", desc: "Send invite emails to managers and cashiers. Skippable." }].map((c) => (
          <div key={c.title} className="border border-border rounded-[0.3rem] p-3 bg-background">
            <div className="w-[26px] h-[26px] rounded-[0.3rem] bg-muted flex items-center justify-center mb-2"><c.icon className="h-3.5 w-3.5 text-muted-foreground" /></div>
            <div className="text-[12.5px] font-semibold">{c.title}</div>
            <div className="text-[11.5px] text-muted-foreground leading-snug mt-1">{c.desc}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button variant="ghost" size="lg" onClick={onSkip}>Skip setup</Button>
        <Button size="lg" className="flex-1 gap-2" onClick={onNext}>Start setup <ArrowRight className="h-4 w-4" /></Button>
      </div>
      <p className="mt-3.5 text-[11px] text-muted-foreground text-center">Estimated time <span className="font-mono text-muted-foreground/80">~ 90 seconds</span></p>
    </div>
  );
}

// ─── Step 2: Features ──────────────────────────────────────

function FeaturesStep({ onNext, onBack }: { onNext: (enabled: Record<string, boolean>) => void; onBack: () => void }) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => Object.fromEntries(FEATURES.map((f) => [f.id, f.defaultOn])));
  const [preset, setPreset] = useState("cafe");
  const applyPreset = (id: string) => { setPreset(id); if (PRESET_CONFIGS[id]) setEnabled(PRESET_CONFIGS[id]); };
  const toggle = (id: string) => { setPreset("custom"); setEnabled((s) => ({ ...s, [id]: !s[id] })); };
  const onCount = useMemo(() => Object.values(enabled).filter(Boolean).length, [enabled]);

  return (
    <div className="w-full max-w-lg mx-auto">
      <OnbStepper step={2} />
      <h1 className="text-[22px] font-semibold tracking-tight leading-tight mb-1">What should Merchiva do for you?</h1>
      <p className="text-[13px] text-muted-foreground leading-relaxed mb-5">Turn on the modules you&apos;ll actually use today. You can flip these on or off any time in Settings.</p>

      <div className="text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Start from a preset</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mb-4">
        {PRESETS.map((p) => {
          const active = preset === p.id;
          return (
            <button key={p.id} onClick={() => applyPreset(p.id)} className={cn(
              "text-left p-2.5 border rounded-[0.3rem] flex flex-col gap-1 transition-all duration-150 cursor-pointer",
              active ? "border-foreground ring-[3px] ring-stone-300/30 bg-background" : "border-border bg-muted/30 hover:bg-muted/50"
            )}>
              <div className="flex items-center gap-1.5">
                <p.icon className={cn("h-[13px] w-[13px]", active ? "text-foreground" : "text-muted-foreground")} />
                <span className="text-xs font-semibold">{p.label}</span>
              </div>
              <span className="text-[10.5px] text-muted-foreground leading-snug">{p.desc}</span>
            </button>
          );
        })}
      </div>

      <div className="flex justify-between items-baseline mb-2">
        <span className="text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wider">Modules</span>
        <span className="text-[11px] text-muted-foreground/60">Tap a row to toggle</span>
      </div>

      <div className="border border-border rounded-[0.3rem] bg-background overflow-hidden">
        {FEATURES.map((f, i) => {
          const on = !!enabled[f.id];
          return (
            <button key={f.id} onClick={() => toggle(f.id)} className={cn(
              "w-full text-left flex items-start gap-2.5 px-3 py-2.5 cursor-pointer transition-colors duration-150",
              on ? "bg-background" : "bg-muted/30",
              i < FEATURES.length - 1 && "border-b border-border"
            )}>
              <div className={cn("w-7 h-7 rounded-[0.3rem] flex items-center justify-center shrink-0 transition-all duration-150", on ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}>
                <f.icon className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-semibold">{f.label}</span>
                  {f.badge && (
                    <span className={cn("h-4 px-1.5 rounded-[3px] text-[9.5px] font-semibold uppercase tracking-wider inline-flex items-center",
                      f.recommended ? "bg-foreground text-background" : f.addon ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground"
                    )}>{f.badge}</span>
                  )}
                </div>
                <div className="text-[11.5px] text-muted-foreground mt-0.5 leading-snug">{f.desc}</div>
                <div className="text-[10.5px] text-muted-foreground/60 font-mono mt-1 tracking-wide">{f.meta}</div>
              </div>
              <div className="mt-1"><Toggle on={on} /></div>
            </button>
          );
        })}
      </div>

      <div className="mt-3.5 p-2.5 border border-border rounded-[0.3rem] bg-muted/30 flex items-start gap-2">
        <Info className="h-[13px] w-[13px] text-muted-foreground mt-0.5 shrink-0" />
        <span className="text-[11.5px] text-muted-foreground leading-relaxed">Disabled modules stay hidden from the sidebar but keep their data. Re-enable any time — no re-import needed.</span>
      </div>

      <div className="flex gap-2 mt-4">
        <Button variant="outline" size="lg" className="gap-2" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Back</Button>
        <Button size="lg" className="flex-1 gap-2" onClick={() => onNext(enabled)}>Continue · {onCount} module{onCount === 1 ? "" : "s"} <ArrowRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

// ─── Step 3: Invite ────────────────────────────────────────

interface InviteRow { id: number; email: string; role: string; }

function InviteStep({ onFinish, onBack, onSkip }: { onFinish: (rows: InviteRow[]) => void; onBack: () => void; onSkip: () => void }) {
  const [rows, setRows] = useState<InviteRow[]>([{ id: 1, email: "", role: "Manager" }, { id: 2, email: "", role: "Cashier" }]);
  const [linkCopied, setLinkCopied] = useState(false);
  const [openRoleId, setOpenRoleId] = useState<number | null>(null);

  const addRow = () => setRows((r) => [...r, { id: Date.now(), email: "", role: "Cashier" }]);
  const removeRow = (id: number) => setRows((r) => r.filter((x) => x.id !== id));
  const setEmail = (id: number, v: string) => setRows((r) => r.map((x) => (x.id === id ? { ...x, email: v } : x)));
  const setRole = (id: number, v: string) => setRows((r) => r.map((x) => (x.id === id ? { ...x, role: v } : x)));
  const filled = rows.filter((r) => r.email.trim()).length;
  const handleCopy = () => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1400); };

  return (
    <div className="w-full max-w-lg mx-auto">
      <OnbStepper step={3} />
      <h1 className="text-[22px] font-semibold tracking-tight leading-tight mb-1">Bring your team in</h1>
      <p className="text-[13px] text-muted-foreground leading-relaxed mb-5">Send invites now, or skip and add people later from <span className="font-mono text-muted-foreground/80">Team → Members</span>. Invites expire after 7 days.</p>

      <div className="flex items-center gap-2 p-2 border border-border rounded-[0.3rem] bg-muted/30 mb-4">
        <Link2 className="h-3.5 w-3.5 text-muted-foreground ml-1" />
        <span className="flex-1 min-w-0 text-xs text-muted-foreground font-mono truncate tracking-wide">merchiva.app/join/invite-link</span>
        <Button variant={linkCopied ? "ghost" : "outline"} size="sm" className="gap-1.5 h-7" onClick={handleCopy}>
          {linkCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {linkCopied ? "Copied" : "Copy link"}
        </Button>
      </div>

      <div className="flex justify-between items-baseline mb-2">
        <span className="text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wider">Email invites</span>
        <button onClick={addRow} className="text-[11px] font-semibold text-foreground inline-flex items-center gap-1 hover:opacity-70"><Plus className="h-3 w-3" /> Add another</button>
      </div>

      <div className="flex flex-col gap-1.5 mb-3.5">
        {rows.map((row) => (
          <div key={row.id} className="grid gap-1.5 items-center" style={{ gridTemplateColumns: "1fr 138px 28px" }}>
            <div className="relative">
              <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={row.email} onChange={(e) => setEmail(row.id, e.target.value)} placeholder="name@yourshop.com" className="pl-8 h-[34px] text-[12.5px]" />
            </div>
            <div className="relative">
              <button onClick={() => setOpenRoleId(openRoleId === row.id ? null : row.id)}
                className={cn("w-full h-[34px] border rounded-[0.3rem] bg-background flex items-center justify-between px-2.5 text-[12.5px] font-medium cursor-pointer transition-all duration-150",
                  openRoleId === row.id ? "border-stone-400 ring-[3px] ring-stone-300/30" : "border-border"
                )}>
                <span className="inline-flex items-center gap-1.5"><UserCog className="h-3 w-3 text-muted-foreground" />{row.role}</span>
                {openRoleId === row.id ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
              </button>
              {openRoleId === row.id && (
                <div className="absolute top-[calc(100%+4px)] right-0 w-60 bg-background border border-border rounded-[0.3rem] shadow-lg z-30 p-1">
                  {ROLES.map((r) => {
                    const active = r.id === row.role;
                    return (
                      <button key={r.id} onClick={() => { setRole(row.id, r.id); setOpenRoleId(null); }}
                        className={cn("w-full text-left px-2.5 py-2 rounded-[0.3rem] flex flex-col gap-0.5 cursor-pointer", active ? "bg-muted" : "hover:bg-muted/50")}>
                        <span className="text-[12.5px] font-semibold flex items-center gap-1.5">{r.id}{active && <Check className="h-3 w-3 ml-auto" strokeWidth={2.5} />}</span>
                        <span className="text-[10.5px] text-muted-foreground leading-snug">{r.desc}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <button onClick={() => removeRow(row.id)} disabled={rows.length <= 1}
              className={cn("w-7 h-7 border border-border rounded-[0.3rem] bg-background flex items-center justify-center text-muted-foreground",
                rows.length > 1 ? "cursor-pointer hover:bg-muted" : "cursor-not-allowed opacity-40"
              )}><X className="h-[13px] w-[13px]" /></button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-3.5">
        <Button variant="outline" size="sm" className="gap-1.5 h-7"><Upload className="h-3 w-3" /> Import CSV</Button>
        <Button variant="outline" size="sm" className="gap-1.5 h-7"><Contact className="h-3 w-3" /> From contacts</Button>
      </div>

      <div className="p-2.5 border border-border rounded-[0.3rem] bg-muted/30 mb-4">
        <div className="text-[11px] font-semibold text-muted-foreground/80 flex items-center gap-1.5 mb-1.5"><Shield className="h-3 w-3 text-muted-foreground" /> What each role can do</div>
        <div className="grid gap-y-1 gap-x-3 text-[11.5px] text-muted-foreground" style={{ gridTemplateColumns: "90px 1fr" }}>
          {ROLES.slice(0, 4).map((r) => (
            <div key={r.id} className="contents">
              <span className="font-semibold font-mono text-[11px] text-muted-foreground/80">{r.id}</span>
              <span>{r.desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="lg" className="gap-1.5 text-muted-foreground" onClick={onSkip}><SkipForward className="h-[13px] w-[13px]" /> Skip for now</Button>
        <div className="flex gap-2">
          <Button variant="outline" size="lg" className="gap-2" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Back</Button>
          <Button size="lg" className="gap-2" onClick={() => onFinish(rows)}>
            <Send className="h-3.5 w-3.5" />
            {filled > 0 ? `Send ${filled} invite${filled === 1 ? "" : "s"} & finish` : "Finish setup"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Setup page ────────────────────────────────────────────

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [orgName, setOrgName] = useState("My Store");

  useEffect(() => {
    const token = localStorage.getItem("stdb_token");
    if (!token) { router.replace("/login"); return; }
    try {
      const raw = localStorage.getItem("merchiva_setup_org");
      if (raw) setOrgName(raw);
    } catch {}
  }, [router]);

  const handleSkip = useCallback(() => {
    try { localStorage.setItem("merchiva_setup_done", "1"); } catch {}
    router.replace("/~/");
  }, [router]);

  const handleFeaturesNext = useCallback((_enabled: Record<string, boolean>) => {
    setStep(2);
  }, []);

  const handleFinish = useCallback(async (_rows: InviteRow[]) => {
    setFinishing(true);
    try { localStorage.setItem("merchiva_setup_done", "1"); } catch {}
    toast.success("Setup complete!");
    router.replace("/~/");
  }, [router]);

  if (finishing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Spinner size={20} className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Setting up your workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="h-14 border-b border-border flex items-center px-5 gap-2.5 shrink-0">
        <MerchivaLogo size={24} fg="var(--background)" bg="var(--foreground)" rounded />
        <span className="text-[13px] font-semibold tracking-tight">Merchiva</span>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 overflow-y-auto">
        {step === 0 && <WelcomeStep orgName={orgName} onNext={() => setStep(1)} onSkip={handleSkip} />}
        {step === 1 && <FeaturesStep onNext={handleFeaturesNext} onBack={() => setStep(0)} />}
        {step === 2 && <InviteStep onFinish={handleFinish} onBack={() => setStep(1)} onSkip={handleSkip} />}
      </div>

      {/* Footer */}
      <div className="h-10 border-t border-border flex items-center justify-between px-6 text-[11px] text-muted-foreground shrink-0">
        <span className="inline-flex items-center gap-1.5">
          <Check className="h-3 w-3 text-emerald-600" />
          Workspace <span className="font-mono">{orgName}</span> is live
        </span>
        <span className="font-mono">Step {step + 3} / 4</span>
      </div>
    </div>
  );
}
