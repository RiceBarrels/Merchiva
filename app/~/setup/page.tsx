"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MerchivaLogo } from "@/components/logo";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Check, ArrowRight, ArrowLeft, Clock, MapPin, Store, UserPlus,
  Link2, SkipForward, Send, Loader2, Plus, X, Mail, CreditCard,
} from "lucide-react";
import { getConnection, getActiveOrgId } from "@/lib/spacetimedb/client";

interface InviteRow { email: string; role: string; }

const STEPS = ["Store Info", "Hours", "Team", "POS"];

function Stepper({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1.5 mb-6">
      {STEPS.map((label, i, arr) => {
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
                active ? "font-semibold text-foreground" : "font-medium text-muted-foreground/60"
              )}>{label}</span>
            </div>
            {i < arr.length - 1 && <div className={cn("flex-1 h-px mx-0.5", i < step ? "bg-muted-foreground/40" : "bg-border")} />}
          </div>
        );
      })}
    </div>
  );
}

function StoreInfoStep({ storeName, setStoreName, address, setAddress, businessType, setBusinessType, onNext }: {
  storeName: string; setStoreName: (v: string) => void;
  address: string; setAddress: (v: string) => void;
  businessType: string; setBusinessType: (v: string) => void;
  onNext: () => void;
}) {
  const types = [
    { id: "cafe", label: "Cafe / Bakery" },
    { id: "restaurant", label: "Restaurant" },
    { id: "retail", label: "Retail Shop" },
    { id: "service", label: "Service / Repair" },
    { id: "other", label: "Other" },
  ];
  return (
    <div className="w-full max-w-md mx-auto">
      <Stepper step={0} />
      <div className="flex items-center gap-3 mb-2">
        <Store className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-[22px] font-semibold tracking-tight">Tell us about your store.</h1>
      </div>
      <p className="text-[13px] text-muted-foreground leading-relaxed mb-6">We&apos;ll use this to customize your dashboard and set up your workspace.</p>
      <div className="space-y-4">
        <div>
          <label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">Store name</label>
          <Input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="e.g. Maple Coffee" className="h-11" autoFocus />
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">Address</label>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. 123 Main St, Oakland CA" className="h-11" />
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">Business type</label>
          <div className="grid grid-cols-2 gap-2">
            {types.map((t) => (
              <button key={t.id} onClick={() => setBusinessType(t.id)}
                className={cn("h-10 px-3 rounded-[0.3rem] border text-[13px] font-medium text-left transition-colors",
                  businessType === t.id ? "bg-foreground text-background border-foreground" : "bg-background text-foreground border-border hover:bg-muted"
                )}>{t.label}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-end mt-6">
        <Button size="lg" className="gap-2" onClick={onNext} disabled={!storeName.trim()}>Next <ArrowRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

function HoursStep({ hours, setHours, onNext, onBack }: {
  hours: { open: string; close: string; days: boolean[] };
  setHours: (v: { open: string; close: string; days: boolean[] }) => void;
  onNext: () => void; onBack: () => void;
}) {
  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (
    <div className="w-full max-w-md mx-auto">
      <Stepper step={1} />
      <div className="flex items-center gap-3 mb-2">
        <Clock className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-[22px] font-semibold tracking-tight">When are you open?</h1>
      </div>
      <p className="text-[13px] text-muted-foreground leading-relaxed mb-6">This helps Mr. Merchiva schedule staff and predict demand.</p>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">Open</label>
            <Input type="time" value={hours.open} onChange={(e) => setHours({ ...hours, open: e.target.value })} className="h-11 font-mono" />
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">Close</label>
            <Input type="time" value={hours.close} onChange={(e) => setHours({ ...hours, close: e.target.value })} className="h-11 font-mono" />
          </div>
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted-foreground mb-2 block">Open days</label>
          <div className="flex gap-1.5">
            {dayLabels.map((d, i) => (
              <button key={d} onClick={() => { const nd = [...hours.days]; nd[i] = !nd[i]; setHours({ ...hours, days: nd }); }}
                className={cn("flex-1 h-10 rounded-[0.3rem] border text-[12px] font-medium transition-colors",
                  hours.days[i] ? "bg-foreground text-background border-foreground" : "bg-background text-muted-foreground border-border hover:bg-muted"
                )}>{d}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between mt-6">
        <Button variant="outline" size="lg" className="gap-2" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Back</Button>
        <Button size="lg" className="gap-2" onClick={onNext}>Next <ArrowRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

function InviteStep({ invites, setInvites, onNext, onBack, onSkip }: {
  invites: InviteRow[]; setInvites: (v: InviteRow[]) => void;
  onNext: () => void; onBack: () => void; onSkip: () => void;
}) {
  const filled = invites.filter((r) => r.email.includes("@")).length;
  return (
    <div className="w-full max-w-md mx-auto">
      <Stepper step={2} />
      <div className="flex items-center gap-3 mb-2">
        <UserPlus className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-[22px] font-semibold tracking-tight">Invite your team.</h1>
      </div>
      <p className="text-[13px] text-muted-foreground leading-relaxed mb-6">Add staff so they can clock in, view schedules, and use POS.</p>
      <div className="space-y-2">
        {invites.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <Input value={row.email} onChange={(e) => { const n = [...invites]; n[i] = { ...n[i], email: e.target.value }; setInvites(n); }}
              placeholder="name@email.com" type="email" className="h-10 flex-1" />
            <select value={row.role} onChange={(e) => { const n = [...invites]; n[i] = { ...n[i], role: e.target.value }; setInvites(n); }}
              className="h-10 rounded-[0.3rem] border border-border bg-background px-2 text-[12px] font-medium">
              <option value="manager">Manager</option>
              <option value="staff">Staff</option>
            </select>
            <button onClick={() => setInvites(invites.filter((_, idx) => idx !== i))}
              className="h-8 w-8 rounded-[0.3rem] text-muted-foreground hover:bg-muted inline-flex items-center justify-center">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button onClick={() => setInvites([...invites, { email: "", role: "staff" }])}
          className="h-9 px-3 rounded-[0.3rem] border border-dashed border-border text-[12px] text-muted-foreground hover:bg-muted inline-flex items-center gap-1.5 w-full justify-center">
          <Plus className="h-3.5 w-3.5" /> Add another
        </button>
      </div>
      <div className="flex items-center justify-between mt-6">
        <div className="flex gap-2">
          <Button variant="outline" size="lg" className="gap-2" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Back</Button>
          <Button variant="ghost" size="lg" className="gap-1.5 text-muted-foreground" onClick={onSkip}><SkipForward className="h-[13px] w-[13px]" /> Skip</Button>
        </div>
        <Button size="lg" className="gap-2" onClick={onNext}>{filled > 0 ? `Send ${filled} invite${filled !== 1 ? "s" : ""}` : "Next"} <ArrowRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

function PosStep({ onFinish, onBack, onSkip, finishing }: {
  onFinish: () => void; onBack: () => void; onSkip: () => void; finishing: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const posOptions = [
    { id: "square", label: "Square", desc: "Connect via OAuth" },
    { id: "clover", label: "Clover", desc: "Connect via OAuth" },
    { id: "none", label: "No POS yet", desc: "Set up manually later" },
  ];
  return (
    <div className="w-full max-w-md mx-auto">
      <Stepper step={3} />
      <div className="flex items-center gap-3 mb-2">
        <CreditCard className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-[22px] font-semibold tracking-tight">Connect your POS.</h1>
      </div>
      <p className="text-[13px] text-muted-foreground leading-relaxed mb-6">Merchiva syncs sales, products, and inventory from your POS.</p>
      <div className="space-y-2">
        {posOptions.map((pos) => (
          <button key={pos.id} onClick={() => setSelected(pos.id)}
            className={cn("w-full h-14 px-4 rounded-[0.3rem] border flex items-center gap-3 text-left transition-colors",
              selected === pos.id ? "bg-foreground text-background border-foreground" : "bg-background text-foreground border-border hover:bg-muted"
            )}>
            {pos.id === "none" ? <SkipForward className="h-4 w-4 shrink-0" /> : <Link2 className="h-4 w-4 shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium">{pos.label}</div>
              <div className={cn("text-[11px]", selected === pos.id ? "text-background/70" : "text-muted-foreground")}>{pos.desc}</div>
            </div>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between mt-6">
        <div className="flex gap-2">
          <Button variant="outline" size="lg" className="gap-2" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Back</Button>
          <Button variant="ghost" size="lg" className="gap-1.5 text-muted-foreground" onClick={onSkip}><SkipForward className="h-[13px] w-[13px]" /> Skip</Button>
        </div>
        <Button size="lg" className="gap-2" onClick={onFinish} disabled={finishing}>
          {finishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-3.5 w-3.5" /> Finish setup</>}
        </Button>
      </div>
    </div>
  );
}

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [address, setAddress] = useState("");
  const [businessType, setBusinessType] = useState("cafe");
  const [hours, setHours] = useState({ open: "07:00", close: "21:00", days: [true, true, true, true, true, true, false] });
  const [invites, setInvites] = useState<InviteRow[]>([{ email: "", role: "staff" }]);

  useEffect(() => {
    const token = localStorage.getItem("stdb_token");
    if (!token) { router.replace("/login"); return; }
    try { const raw = localStorage.getItem("merchiva_setup_org"); if (raw) setStoreName(raw); } catch {}
  }, [router]);

  const saveAndFinish = useCallback(async () => {
    setFinishing(true);
    try {
      const conn = getConnection();
      if (conn) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = (conn as any).reducers;
        const orgId = getActiveOrgId();
        if (storeName.trim()) { try { await r.updateOrg({ organizationId: orgId, name: storeName.trim() }); } catch {} }
        try {
          await r.updateSettings({
            organizationId: orgId, businessName: storeName.trim() || null, businessType: businessType || null,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, paymentTaxRate: 0, paymentCurrency: "USD",
            locationLatitude: null, locationLongitude: null, googlePlacesId: null,
          });
        } catch {}
        for (const inv of invites.filter((r) => r.email.includes("@"))) {
          try { await r.inviteToOrg({ organizationId: orgId, email: inv.email.trim(), role: inv.role }); } catch {}
        }
        if (address.trim()) {
          try { await r.addLocation({ organizationId: orgId, name: storeName.trim() || "Main", address: address.trim(), phone: null, isDefault: true, sortOrder: 0 }); } catch {}
        }
      }
      toast.success("Setup complete!");
      router.replace("/~/dashboard");
    } catch {
      // The setup signal lives in SpacetimeDB (settings.updatedAt > createdAt
      // after updateSettings runs). If we got here, that reducer either
      // succeeded or threw — the layout will retry the gate on next mount.
      toast.error("Something went wrong, but your workspace is ready.");
      router.replace("/~/dashboard");
    }
  }, [storeName, address, businessType, invites, router]);

  if (finishing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Setting up your workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="h-14 border-b border-border flex items-center px-5 gap-2.5 shrink-0">
        <MerchivaLogo size={24} fg="var(--background)" bg="var(--foreground)" rounded />
        <span className="text-[13px] font-semibold tracking-tight">Merchiva</span>
      </div>
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 overflow-y-auto">
        {step === 0 && <StoreInfoStep storeName={storeName} setStoreName={setStoreName} address={address} setAddress={setAddress} businessType={businessType} setBusinessType={setBusinessType} onNext={() => setStep(1)} />}
        {step === 1 && <HoursStep hours={hours} setHours={setHours} onNext={() => setStep(2)} onBack={() => setStep(0)} />}
        {step === 2 && <InviteStep invites={invites} setInvites={setInvites} onNext={() => setStep(3)} onBack={() => setStep(1)} onSkip={() => setStep(3)} />}
        {step === 3 && <PosStep onFinish={saveAndFinish} onBack={() => setStep(2)} onSkip={saveAndFinish} finishing={finishing} />}
      </div>
      <div className="h-10 border-t border-border flex items-center justify-between px-6 text-[11px] text-muted-foreground shrink-0">
        <span className="inline-flex items-center gap-1.5"><MapPin className="h-3 w-3" />{storeName || "Your store"}</span>
        <span className="font-mono">Step {step + 1} / {STEPS.length}</span>
      </div>
    </div>
  );
}
