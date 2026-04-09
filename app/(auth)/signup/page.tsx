"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Zap, Loader2, ArrowLeft, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { hapticLight, hapticSuccess, hapticError } from "@/lib/haptics";
import { connectToStdb, hashPassword } from "@/lib/spacetimedb/auth";
import type { OrgInvitation } from "@/lib/types";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteCode = searchParams.get("invite_code");

  const [step, setStep] = useState(1); // 1=name, 2=email, 3=password, 4=store
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [storeName, setStoreName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [invitation, setInvitation] = useState<OrgInvitation | null>(null);
  const [orgName, setOrgName] = useState("");
  const [inviteStatus, setInviteStatus] = useState<"loading" | "valid" | "invalid" | "none">(
    inviteCode ? "loading" : "none"
  );

  // Validate invite code
  useEffect(() => {
    if (!inviteCode) return;

    connectToStdb()
      .then(async ({ conn }) => {
        await new Promise<void>((resolve) => {
          conn.subscriptionBuilder().onApplied(() => resolve())
            .subscribe(["SELECT * FROM org_invitation", "SELECT * FROM organization"]);
          setTimeout(resolve, 4000);
        });

        const db = conn as any;
        const invites: any[] = db.db?.orgInvitation ? [...db.db.orgInvitation.iter()] : [];
        const inv = invites.find((i: any) => i.token === inviteCode);

        if (!inv || new Date(inv.expiresAt?.toDate?.() ?? inv.expiresAt) < new Date()) {
          setInviteStatus("invalid");
          return;
        }

        const orgs: any[] = db.db?.organization ? [...db.db.organization.iter()] : [];
        const org = orgs.find((o: any) => o.id?.toString() === inv.organizationId);

        setInvitation({
          id: inv.id?.toString() ?? "",
          organizationId: inv.organizationId,
          email: inv.email,
          role: inv.role,
          permissions: (() => { try { return JSON.parse(inv.permissions); } catch { return {}; } })(),
          token: inv.token,
          expiresAt: inv.expiresAt?.toDate?.()?.toISOString() ?? "",
          acceptedAt: inv.acceptedAt ? inv.acceptedAt.toDate().toISOString() : null,
        });
        setEmail(inv.email);
        setOrgName(org?.name ?? "");
        setInviteStatus("valid");
      })
      .catch(() => setInviteStatus("invalid"));
  }, [inviteCode]);

  // With a valid invite, skip the store step (step 4 not shown)
  const totalSteps = inviteStatus === "valid" ? 3 : 4;

  const handleNext = () => {
    hapticLight();
    setError(null);
    setStep((s) => s + 1);
  };

  const handleBack = (to: number) => {
    hapticLight();
    setError(null);
    setStep(to);
  };

  const handleSignup = async () => {
    setLoading(true);
    setError(null);

    try {
      const passwordHash = await hashPassword(password);
      const displayName = name.trim() || email.split("@")[0];

      const { conn } = await connectToStdb();

      await new Promise<void>((resolve) => {
        conn.subscriptionBuilder().onApplied(() => resolve())
          .subscribe(["SELECT * FROM user", "SELECT * FROM org_member", "SELECT * FROM org_invitation"]);
        setTimeout(resolve, 4000);
      });

      await conn.reducers.createUser({
        email: email.trim(),
        passwordHash,
        displayName,
      });

      if (invitation && inviteCode) {
        await conn.reducers.acceptInvitation({ token: inviteCode });
      } else {
        const orgDisplayName = storeName.trim() || displayName + "'s Store";
        await conn.reducers.createOrg({ name: orgDisplayName });
      }

      hapticSuccess();
      router.push("/dashboard");
    } catch (err) {
      hapticError();
      setError(err instanceof Error ? err.message : "Sign-up failed. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center px-6 py-12 bg-background">
      <div className="mx-auto w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-8">
          <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-stone-900 text-white">
            <Zap className="h-4 w-4" />
          </div>
          <div>
            <p className="font-bold text-lg leading-none">BizOps</p>
            <p className="text-xs text-muted-foreground">AI Business Manager</p>
          </div>
        </div>

        {/* Invite banner */}
        {inviteStatus === "valid" && invitation && (
          <div className="mb-6 flex items-start gap-2.5 rounded-sm border bg-muted/30 px-3 py-2.5">
            <Users className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium leading-none mb-0.5">{orgName || "A team"} invited you</p>
              <p className="text-muted-foreground text-xs">
                Role:{" "}
                <Badge variant="secondary" className="text-xs capitalize py-0">
                  {invitation.role}
                </Badge>
              </p>
            </div>
          </div>
        )}

        {inviteStatus === "invalid" && (
          <div className="mb-6 rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            This invite link is invalid or has expired. You can still create a new account below.
          </div>
        )}

        {/* Step progress */}
        <div className="flex gap-1.5 mb-6">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full ${i + 1 <= step ? "bg-stone-900" : "bg-stone-200"}`}
            />
          ))}
        </div>

        {/* Step 1 — Name */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold">What&apos;s your name?</h1>
              <p className="text-muted-foreground text-sm mt-1">Let&apos;s get you set up</p>
            </div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoFocus
              autoComplete="name"
              className="text-lg h-12"
              onKeyDown={(e) => e.key === "Enter" && name.trim() && handleNext()}
            />
            <Button onClick={handleNext} disabled={!name.trim()} className="w-full h-11">
              Continue
            </Button>
          </div>
        )}

        {/* Step 2 — Email */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <button
                onClick={() => handleBack(1)}
                className="text-muted-foreground mb-2 flex items-center gap-1 text-sm"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              <h1 className="text-2xl font-bold">What&apos;s your email?</h1>
            </div>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus
              autoComplete="email"
              readOnly={inviteStatus === "valid"}
              className={`text-lg h-12 ${inviteStatus === "valid" ? "bg-muted text-muted-foreground" : ""}`}
              onKeyDown={(e) => e.key === "Enter" && email.trim() && handleNext()}
            />
            <Button onClick={handleNext} disabled={!email.trim()} className="w-full h-11">
              Continue
            </Button>
          </div>
        )}

        {/* Step 3 — Password */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <button
                onClick={() => handleBack(2)}
                className="text-muted-foreground mb-2 flex items-center gap-1 text-sm"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              <h1 className="text-2xl font-bold">Create a password</h1>
              <p className="text-muted-foreground text-sm mt-1">At least 6 characters</p>
            </div>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoFocus
              autoComplete="new-password"
              className="text-lg h-12"
              onKeyDown={(e) => {
                if (e.key === "Enter" && password.length >= 6) {
                  if (inviteStatus === "valid") handleSignup();
                  else handleNext();
                }
              }}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              onClick={inviteStatus === "valid" ? handleSignup : handleNext}
              disabled={password.length < 6 || loading}
              className="w-full h-11"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : inviteStatus === "valid" ? "Create account" : "Continue"}
            </Button>
          </div>
        )}

        {/* Step 4 — Store name (skipped for invite flow) */}
        {step === 4 && inviteStatus !== "valid" && (
          <div className="space-y-6">
            <div>
              <button
                onClick={() => handleBack(3)}
                className="text-muted-foreground mb-2 flex items-center gap-1 text-sm"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              <h1 className="text-2xl font-bold">Name your store</h1>
              <p className="text-muted-foreground text-sm mt-1">You can change this later</p>
            </div>
            <Input
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="My Coffee Shop"
              autoFocus
              autoComplete="organization"
              className="text-lg h-12"
              onKeyDown={(e) => e.key === "Enter" && handleSignup()}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={handleSignup} disabled={loading} className="w-full h-11">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
            </Button>
          </div>
        )}

        <p className="text-center text-sm text-muted-foreground mt-8">
          Already have an account?{" "}
          <a href="/" className="font-medium text-foreground underline underline-offset-4">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
