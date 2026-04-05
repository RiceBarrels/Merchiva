"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Zap, Loader2, Users } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { ownerPermissions, getInvitationByToken, acceptInvitation } from "@/lib/db/team";
import { hapticLight, hapticSuccess, hapticError } from "@/lib/haptics";
import type { OrgInvitation } from "@/lib/types";

type Step = "form" | "verify";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteCode = searchParams.get("invite_code");

  const [step, setStep] = useState<Step>("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [yourName, setYourName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Invitation state
  const [invitation, setInvitation] = useState<OrgInvitation | null>(null);
  const [orgName, setOrgName] = useState<string>("");
  const [inviteStatus, setInviteStatus] = useState<"loading" | "valid" | "invalid" | "none">(
    inviteCode ? "loading" : "none"
  );

  useEffect(() => {
    if (!inviteCode) return;
    const supabase = createClient();
    getInvitationByToken(inviteCode)
      .then(async (inv) => {
        if (!inv) {
          setInviteStatus("invalid");
          return;
        }
        if (new Date(inv.expiresAt) < new Date()) {
          setInviteStatus("invalid");
          return;
        }
        setInvitation(inv);
        setEmail(inv.email);
        // Fetch org name (may work without auth depending on RLS)
        const { data: org } = await supabase
          .from("organizations")
          .select("name")
          .eq("id", inv.organizationId)
          .single();
        setOrgName(org?.name ?? "");
        setInviteStatus("valid");
      })
      .catch(() => setInviteStatus("invalid"));
  }, [inviteCode]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: yourName },
      },
    });

    if (error) {
      hapticError();
      setError(error.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      hapticSuccess();
      await postSignup(data.user!.id);
      return;
    }

    hapticLight();
    setStep("verify");
    setLoading(false);
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "signup",
    });

    if (error) {
      hapticError();
      setError(error.message);
      setLoading(false);
      return;
    }

    if (!data.user) {
      hapticError();
      setError("Verification succeeded but no user was returned. Please try signing in.");
      setLoading(false);
      return;
    }

    hapticSuccess();
    await postSignup(data.user.id);
  };

  const postSignup = async (userId: string) => {
    if (invitation && inviteCode) {
      await joinOrgViaInvite(userId);
    } else {
      await createOrgForUser(userId);
    }
  };

  // ── Invited user: join existing org ──────────────────────────────────────────
  const joinOrgViaInvite = async (userId: string) => {
    const supabase = createClient();
    const displayName = yourName.trim() || email.split("@")[0];

    try {
      // Create user profile
      await supabase
        .from("user_profiles")
        .upsert(
          { user_id: userId, display_name: displayName },
          { onConflict: "user_id" }
        );

      const res = await fetch("/api/team/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: inviteCode, displayName }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "Failed to join organization.");
      }

      // Set active org
      await supabase
        .from("user_profiles")
        .update({ last_active_org_id: invitation!.organizationId })
        .eq("user_id", userId);

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join organization.");
      setLoading(false);
    }
  };

  // ── New user: create their own org ───────────────────────────────────────────
  const createOrgForUser = async (userId: string) => {
    const supabase = createClient();
    const displayName = yourName.trim() || email.split("@")[0];
    const orgName = storeName.trim() || email.split("@")[0];

    await supabase
      .from("user_profiles")
      .upsert(
        { user_id: userId, display_name: displayName },
        { onConflict: "user_id" }
      );

    await supabase.from("settings").upsert({
      user_id: userId,
      business_name: orgName,
    });

    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .insert({ owner_id: userId, name: orgName })
      .select("id")
      .single();

    if (orgError || !org) {
      setError(orgError?.message ?? "Failed to create organization.");
      setLoading(false);
      return;
    }

    await supabase
      .from("user_profiles")
      .update({ last_active_org_id: org.id })
      .eq("user_id", userId);

    await supabase.from("org_members").insert({
      organization_id: org.id,
      user_id: userId,
      role: "owner",
      display_name: displayName,
      permissions: ownerPermissions(),
      status: "active",
    });

    // Accept any pending invitation for this email
    const { data: pendingInvite } = await supabase
      .from("org_invitations")
      .select("id")
      .eq("email", email.toLowerCase())
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .single();

    if (pendingInvite) {
      await supabase
        .from("org_invitations")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", pendingInvite.id);
    }

    router.push("/");
    router.refresh();
  };

  // ── Verification step ─────────────────────────────────────────────────────────
  if (step === "verify") {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-3 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-sm bg-stone-900 text-white">
              <Zap className="h-3.5 w-3.5" />
            </div>
            <div>
              <p className="font-bold text-base leading-none">BizOps</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">AI Business Manager</p>
            </div>
          </div>
          <div>
            <CardTitle className="text-xl">Check your email</CardTitle>
            <CardDescription>
              We sent a 6-digit verification code to <strong>{email}</strong>
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleVerify} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="code">Verification code</Label>
              <Input
                id="code"
                placeholder="123456"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                required
                autoComplete="one-time-code"
                inputMode="numeric"
                autoFocus
              />
            </div>

            {error && (
              <p className="text-sm text-destructive rounded-sm bg-destructive/10 px-3 py-2">
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={loading || code.length !== 6}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying…
                </>
              ) : (
                "Verify and continue"
              )}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Wrong email?{" "}
              <button
                type="button"
                onClick={() => {
                  setStep("form");
                  setError(null);
                  setCode("");
                }}
                className="font-medium text-foreground underline underline-offset-4"
              >
                Go back
              </button>
            </p>
          </form>
        </CardContent>
      </Card>
    );
  }

  // ── Sign up form ──────────────────────────────────────────────────────────────
  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="space-y-3 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-sm bg-stone-900 text-white">
            <Zap className="h-3.5 w-3.5" />
          </div>
          <div>
            <p className="font-bold text-base leading-none">BizOps</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">AI Business Manager</p>
          </div>
        </div>

        {inviteStatus === "valid" && orgName ? (
          <div>
            <CardTitle className="text-xl">Create account</CardTitle>
            <CardDescription>
              You&apos;ve been invited to join{" "}
              <strong>{orgName}</strong>
            </CardDescription>
          </div>
        ) : (
          <div>
            <CardTitle className="text-xl">Create account</CardTitle>
            <CardDescription>Start managing your business with AI</CardDescription>
          </div>
        )}
      </CardHeader>

      <CardContent>
        {/* Invite banner */}
        {inviteStatus === "valid" && invitation && (
          <div className="mb-4 flex items-start gap-2.5 rounded-sm border bg-muted/30 px-3 py-2.5">
            <Users className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium leading-none mb-0.5">
                {orgName || "A team"} invited you
              </p>
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
          <div className="mb-4 rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            This invite link is invalid or has expired. You can still create a new account below.
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="yourName">Your Name</Label>
            <Input
              id="yourName"
              placeholder="Jane Smith"
              value={yourName}
              onChange={(e) => setYourName(e.target.value)}
              autoComplete="name"
            />
          </div>

          {/* Only show store name for non-invited signups */}
          {inviteStatus !== "valid" && (
            <div className="space-y-1.5">
              <Label htmlFor="storeName">Store Name</Label>
              <Input
                id="storeName"
                placeholder="My Coffee Shop"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                autoComplete="organization"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              readOnly={inviteStatus === "valid"}
              className={inviteStatus === "valid" ? "bg-muted text-muted-foreground" : ""}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive rounded-sm bg-destructive/10 px-3 py-2">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating account…
              </>
            ) : (
              "Create account"
            )}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-foreground underline underline-offset-4"
            >
              Sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
