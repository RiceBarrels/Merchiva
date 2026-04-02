"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Zap,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Check,
  Plus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { ownerPermissions } from "@/lib/db/team";

const BUSINESS_TYPES = [
  "Restaurant",
  "Cafe",
  "Bakery",
  "Retail",
  "Bar/Pub",
  "Food Truck",
  "Grocery",
  "Salon/Spa",
  "Other",
];

const EMPLOYEE_RANGES = ["1–5", "6–15", "16–50", "50+"];

const POS_SYSTEMS = [
  {
    id: "square",
    name: "Square",
    description: "Point of sale, payments & inventory",
    icon: "▪",
    canConnect: true,
  },
  {
    id: "clover",
    name: "Clover",
    description: "All-in-one POS system",
    icon: "◆",
    canConnect: true,
  },
  {
    id: "toast",
    name: "Toast",
    description: "Restaurant-focused POS",
    icon: "◇",
    canConnect: false,
  },
  {
    id: "lightspeed",
    name: "Lightspeed",
    description: "Retail & hospitality POS",
    icon: "△",
    canConnect: false,
  },
  {
    id: "none",
    name: "None / Other",
    description: "I don't use a POS or use something else",
    icon: "○",
    canConnect: false,
  },
];

const STORAGE_KEY = "bizops_setup_state";
const TOTAL_STEPS = 4;

interface SetupState {
  step: number;
  businessName: string;
  businessType: string;
  employeeRange: string;
  posSystem: string;
  yourName: string;
  inviteEmails: string[];
}

const defaultState: SetupState = {
  step: 1,
  businessName: "",
  businessType: "",
  employeeRange: "",
  posSystem: "",
  yourName: "",
  inviteEmails: [""],
};

export default function SetupPage() {
  const router = useRouter();
  const [state, setState] = useState<SetupState>(defaultState);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(({ data: { user } }) => {
        if (!user) {
          router.replace("/login");
          return;
        }
        supabase
          .from("org_members")
          .select("id")
          .eq("user_id", user.id)
          .eq("status", "active")
          .limit(1)
          .single()
          .then(({ data }) => {
            if (data) {
              router.replace("/dashboard");
            } else {
              // Restore state saved before OAuth redirect
              try {
                const saved = localStorage.getItem(STORAGE_KEY);
                if (saved) {
                  const parsed = JSON.parse(saved) as SetupState;
                  setState(parsed);
                }
              } catch {
                // ignore
              }
              setChecking(false);
            }
          });
      })
      .catch(() => setChecking(false));
  }, [router]);

  const persist = (next: SetupState) => {
    setState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const goToStep = (step: number) => {
    setError(null);
    persist({ ...state, step });
  };

  // ── Step 1 ──────────────────────────────────────────────────────────────────
  const handleStep1Next = () => {
    if (!state.businessName.trim()) {
      setError("Business name is required.");
      return;
    }
    setError(null);
    goToStep(2);
  };

  // ── Step 2 — POS connect ────────────────────────────────────────────────────
  const handlePosConnect = (posId: string) => {
    // Save state before redirecting away for OAuth
    persist({ ...state, posSystem: posId });
    if (posId === "square") {
      window.location.href = "/api/square/oauth/authorize";
    } else if (posId === "clover") {
      window.location.href = "/api/clover/connect";
    }
  };

  // ── Step 4 — finish setup ───────────────────────────────────────────────────
  const handleFinish = async () => {
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    const displayName =
      state.yourName.trim() || user.email?.split("@")[0] || "Me";
    const orgName =
      state.businessName.trim() || user.email?.split("@")[0] || "My Business";

    try {
      // 1. User profile
      await supabase
        .from("user_profiles")
        .upsert(
          { user_id: user.id, display_name: displayName },
          { onConflict: "user_id" }
        );

      // 2. Organization
      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .insert({ owner_id: user.id, name: orgName })
        .select("id")
        .single();

      if (orgError || !org) {
        setError(orgError?.message ?? "Failed to create organization.");
        setLoading(false);
        return;
      }

      // 3. Set active org
      await supabase
        .from("user_profiles")
        .update({ last_active_org_id: org.id })
        .eq("user_id", user.id);

      // 4. Org membership
      const { error: memberError } = await supabase.from("org_members").insert({
        organization_id: org.id,
        user_id: user.id,
        role: "owner",
        display_name: displayName,
        permissions: ownerPermissions(),
        status: "active",
      });

      if (memberError) {
        setError(memberError.message);
        setLoading(false);
        return;
      }

      // 5. Settings
      await supabase.from("settings").upsert(
        {
          user_id: user.id,
          business_name: orgName,
          business_type: state.businessType || null,
        },
        { onConflict: "user_id" }
      );

      // 6. Send invitations
      const validEmails = state.inviteEmails.filter(
        (e) => e.trim() && e.includes("@")
      );
      for (const email of validEmails) {
        try {
          await fetch("/api/team/invite", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: email.trim(), role: "staff" }),
          });
        } catch {
          // Don't block setup on invite failure
        }
      }

      localStorage.removeItem(STORAGE_KEY);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed.");
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-6">
          <div className="flex h-7 w-7 items-center justify-center rounded-sm bg-stone-900 text-white">
            <Zap className="h-3.5 w-3.5" />
          </div>
          <p className="font-bold text-sm leading-none text-stone-900">BizOps</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1.5 mb-6">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div
                className={`h-2 w-2 rounded-full ${
                  i + 1 <= state.step ? "bg-stone-900" : "bg-stone-200"
                }`}
              />
              {i < TOTAL_STEPS - 1 && (
                <div
                  className={`h-px w-6 ${
                    i + 1 < state.step ? "bg-stone-900" : "bg-stone-200"
                  }`}
                />
              )}
            </div>
          ))}
          <span className="text-xs text-muted-foreground ml-2 font-mono">
            {state.step} / {TOTAL_STEPS}
          </span>
        </div>

        {/* ── Step 1: Business Info ─────────────────────────────────────────── */}
        {state.step === 1 && (
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-xl">Business info</CardTitle>
              <CardDescription>Tell us about your business</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="businessName">
                  Business Name{" "}
                  <span className="text-destructive" aria-hidden>
                    *
                  </span>
                </Label>
                <Input
                  id="businessName"
                  placeholder="My Coffee Shop"
                  value={state.businessName}
                  onChange={(e) =>
                    persist({ ...state, businessName: e.target.value })
                  }
                  autoFocus
                  autoComplete="organization"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="businessType">Business Type</Label>
                <Select
                  value={state.businessType}
                  onValueChange={(v) =>
                    persist({ ...state, businessType: v })
                  }
                >
                  <SelectTrigger id="businessType">
                    <SelectValue placeholder="Select type…" />
                  </SelectTrigger>
                  <SelectContent>
                    {BUSINESS_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="employees">Number of Employees</Label>
                <Select
                  value={state.employeeRange}
                  onValueChange={(v) =>
                    persist({ ...state, employeeRange: v })
                  }
                >
                  <SelectTrigger id="employees">
                    <SelectValue placeholder="Select range…" />
                  </SelectTrigger>
                  <SelectContent>
                    {EMPLOYEE_RANGES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {error && (
                <p className="text-sm text-destructive rounded-sm bg-destructive/10 px-3 py-2">
                  {error}
                </p>
              )}

              <Button onClick={handleStep1Next} className="w-full">
                Continue <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── Step 2: POS System ────────────────────────────────────────────── */}
        {state.step === 2 && (
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-xl">POS system</CardTitle>
              <CardDescription>
                Which point-of-sale system do you use?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                {POS_SYSTEMS.map((pos) => (
                  <button
                    key={pos.id}
                    type="button"
                    onClick={() =>
                      persist({
                        ...state,
                        posSystem: state.posSystem === pos.id ? "" : pos.id,
                      })
                    }
                    className={`w-full flex items-center gap-3 rounded-sm border px-3 py-2.5 text-left transition-colors ${
                      state.posSystem === pos.id
                        ? "border-stone-900 bg-stone-50"
                        : "border-border hover:border-stone-400"
                    }`}
                  >
                    <span className="text-base w-5 text-center leading-none select-none">
                      {pos.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-none">
                        {pos.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {pos.description}
                      </p>
                    </div>
                    {state.posSystem === pos.id && (
                      <Check className="h-4 w-4 text-stone-900 shrink-0" />
                    )}
                  </button>
                ))}
              </div>

              {state.posSystem &&
                ["square", "clover"].includes(state.posSystem) && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handlePosConnect(state.posSystem)}
                  >
                    Connect{" "}
                    {state.posSystem === "square" ? "Square" : "Clover"} account
                  </Button>
                )}

              <div className="flex items-center justify-between pt-1">
                <Button variant="ghost" size="sm" onClick={() => goToStep(1)}>
                  <ChevronLeft className="mr-1 h-4 w-4" /> Back
                </Button>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    className="text-sm text-muted-foreground hover:text-foreground"
                    onClick={() => goToStep(3)}
                  >
                    Skip for now
                  </button>
                  <Button
                    onClick={() => goToStep(3)}
                    disabled={!state.posSystem}
                  >
                    Continue <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 3: Your Profile + Invites ────────────────────────────────── */}
        {state.step === 3 && (
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-xl">Your profile</CardTitle>
              <CardDescription>
                Set your display name and invite your team
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="yourName">Your Name</Label>
                <Input
                  id="yourName"
                  placeholder="Jane Smith"
                  value={state.yourName}
                  onChange={(e) =>
                    persist({ ...state, yourName: e.target.value })
                  }
                  autoFocus
                  autoComplete="name"
                />
              </div>

              <div className="space-y-2">
                <Label>
                  Invite Team Members{" "}
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </Label>
                {state.inviteEmails.map((email, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="colleague@example.com"
                      value={email}
                      onChange={(e) => {
                        const emails = [...state.inviteEmails];
                        emails[i] = e.target.value;
                        persist({ ...state, inviteEmails: emails });
                      }}
                    />
                    {state.inviteEmails.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={() => {
                          const emails = state.inviteEmails.filter(
                            (_, j) => j !== i
                          );
                          persist({ ...state, inviteEmails: emails });
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                {state.inviteEmails.length < 5 && (
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      persist({
                        ...state,
                        inviteEmails: [...state.inviteEmails, ""],
                      })
                    }
                  >
                    <Plus className="h-3.5 w-3.5" /> Add another
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between pt-1">
                <Button variant="ghost" size="sm" onClick={() => goToStep(2)}>
                  <ChevronLeft className="mr-1 h-4 w-4" /> Back
                </Button>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    className="text-sm text-muted-foreground hover:text-foreground"
                    onClick={() => goToStep(4)}
                  >
                    I&apos;ll do this later
                  </button>
                  <Button onClick={() => goToStep(4)}>
                    Continue <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 4: Done ──────────────────────────────────────────────────── */}
        {state.step === 4 && (
          <Card>
            <CardHeader className="pb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-stone-900 text-white mb-3">
                <Check className="h-4.5 w-4.5" />
              </div>
              <CardTitle className="text-xl">You&apos;re all set!</CardTitle>
              <CardDescription>
                Your BizOps workspace is ready. Let&apos;s get started.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Summary */}
              <div className="rounded-sm border bg-muted/30 divide-y text-sm">
                <div className="flex justify-between px-3 py-2">
                  <span className="text-muted-foreground">Business</span>
                  <span className="font-medium">{state.businessName}</span>
                </div>
                {state.businessType && (
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">Type</span>
                    <span className="font-medium">{state.businessType}</span>
                  </div>
                )}
                {state.employeeRange && (
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">Team size</span>
                    <span className="font-medium">{state.employeeRange}</span>
                  </div>
                )}
                {state.posSystem && state.posSystem !== "none" && (
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">POS</span>
                    <span className="font-medium">
                      {POS_SYSTEMS.find((p) => p.id === state.posSystem)?.name}
                    </span>
                  </div>
                )}
                {state.yourName && (
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">Your name</span>
                    <span className="font-medium">{state.yourName}</span>
                  </div>
                )}
              </div>

              {error && (
                <p className="text-sm text-destructive rounded-sm bg-destructive/10 px-3 py-2">
                  {error}
                </p>
              )}

              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={() => goToStep(3)}>
                  <ChevronLeft className="mr-1 h-4 w-4" /> Back
                </Button>
                <Button onClick={handleFinish} disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Setting up…
                    </>
                  ) : (
                    "Go to Dashboard"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
