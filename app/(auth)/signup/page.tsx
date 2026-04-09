"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Zap, Loader2, Users, ArrowRight, ArrowLeft } from "lucide-react";
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
import { hapticLight, hapticSuccess, hapticError } from "@/lib/haptics";
import { connectToStdb, hashPassword } from "@/lib/spacetimedb/auth";
import type { OrgInvitation } from "@/lib/types";

type MobileStep = "name" | "store" | "email" | "password";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteCode = searchParams.get("invite_code");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [yourName, setYourName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileStep, setMobileStep] = useState<MobileStep>("name");
  const fieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setIsMobile(window.innerWidth < 640); }, []);

  // Invitation state — loaded from SpacetimeDB after signup if inviteCode present
  const [invitation, setInvitation] = useState<OrgInvitation | null>(null);
  const [orgName, setOrgName] = useState<string>("");
  const [inviteStatus, setInviteStatus] = useState<"loading" | "valid" | "invalid" | "none">(
    inviteCode ? "loading" : "none"
  );

  // Validate the invite code by checking SpacetimeDB org_invitation table
  useEffect(() => {
    if (!inviteCode) return;

    connectToStdb()
      .then(async ({ conn }) => {
        await new Promise<void>((resolve) => {
          conn.subscriptionBuilder().onApplied(resolve)
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

  // Mobile step list
  const mobileSteps: MobileStep[] = inviteStatus === "valid"
    ? ["name", "email", "password"]
    : ["name", "store", "email", "password"];
  const mobileStepIdx = mobileSteps.indexOf(mobileStep);

  const advanceMobileStep = () => {
    if (mobileStepIdx < mobileSteps.length - 1) {
      setMobileStep(mobileSteps[mobileStepIdx + 1]);
      setTimeout(() => fieldRef.current?.focus(), 100);
      return true;
    }
    return false;
  };

  const retreatMobileStep = () => {
    if (mobileStepIdx > 0) {
      setMobileStep(mobileSteps[mobileStepIdx - 1]);
      setError(null);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Mobile: advance steps until last
    if (isMobile) {
      if (mobileStep === "name" && !yourName.trim()) { setError("Please enter your name."); return; }
      if (mobileStep === "email" && !email.trim()) { setError("Please enter your email."); return; }
      if (advanceMobileStep()) { hapticLight(); return; }
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    try {
      const passwordHash = await hashPassword(password);
      const displayName = yourName.trim() || email.split("@")[0];

      // Connect to SpacetimeDB — generates a new Identity
      const { conn } = await connectToStdb();

      // Subscribe to tables we'll need
      await new Promise<void>((resolve) => {
        conn.subscriptionBuilder().onApplied(resolve)
          .subscribe(["SELECT * FROM user", "SELECT * FROM org_member", "SELECT * FROM org_invitation"]);
        setTimeout(resolve, 4000);
      });

      // Register the user profile
      await conn.reducers.createUser({
        email: email.trim(),
        passwordHash,
        displayName,
      });

      if (invitation && inviteCode) {
        // Join via invitation
        await conn.reducers.acceptInvitation({ token: inviteCode });
      } else {
        // Create a new org
        const orgDisplayName = storeName.trim() || email.split("@")[0];
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

  // ── Sign up form ────────────────────────────────────────────────────────────
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
              {isMobile && mobileStep !== "name"
                ? ({ store: "Name your store", email: "Enter your email", password: "Choose a password" } as Record<string, string>)[mobileStep]
                : <>You&apos;ve been invited to join <strong>{orgName}</strong></>}
            </CardDescription>
          </div>
        ) : (
          <div>
            <CardTitle className="text-xl">Create account</CardTitle>
            <CardDescription>
              {isMobile
                ? ({ name: "What's your name?", store: "Name your store", email: "Enter your email", password: "Choose a password" } as Record<string, string>)[mobileStep]
                : "Start managing your business with AI"}
            </CardDescription>
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
          {isMobile ? (
            <>
              {mobileStepIdx > 0 && (
                <button
                  type="button"
                  onClick={retreatMobileStep}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors -mt-1"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back
                </button>
              )}

              {mobileStep === "name" && (
                <div className="space-y-1.5">
                  <Label htmlFor="yourName">Your Name</Label>
                  <Input ref={fieldRef} id="yourName" placeholder="Jane Smith" value={yourName}
                    onChange={(e) => setYourName(e.target.value)} autoComplete="name" autoFocus />
                </div>
              )}
              {mobileStep === "store" && (
                <div className="space-y-1.5">
                  <Label htmlFor="storeName">Store Name</Label>
                  <Input ref={fieldRef} id="storeName" placeholder="My Coffee Shop" value={storeName}
                    onChange={(e) => setStoreName(e.target.value)} autoComplete="organization" autoFocus />
                </div>
              )}
              {mobileStep === "email" && (
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input ref={fieldRef} id="email" type="email" placeholder="you@example.com" value={email}
                    onChange={(e) => setEmail(e.target.value)} required autoComplete="email"
                    readOnly={inviteStatus === "valid"} className={inviteStatus === "valid" ? "bg-muted text-muted-foreground" : ""}
                    autoFocus />
                </div>
              )}
              {mobileStep === "password" && (
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input ref={fieldRef} id="password" type="password" placeholder="At least 6 characters" value={password}
                    onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" autoFocus />
                </div>
              )}
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="yourName">Your Name</Label>
                <Input id="yourName" placeholder="Jane Smith" value={yourName}
                  onChange={(e) => setYourName(e.target.value)} autoComplete="name" />
              </div>
              {inviteStatus !== "valid" && (
                <div className="space-y-1.5">
                  <Label htmlFor="storeName">Store Name</Label>
                  <Input id="storeName" placeholder="My Coffee Shop" value={storeName}
                    onChange={(e) => setStoreName(e.target.value)} autoComplete="organization" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@example.com" value={email}
                  onChange={(e) => setEmail(e.target.value)} required autoComplete="email"
                  readOnly={inviteStatus === "valid"} className={inviteStatus === "valid" ? "bg-muted text-muted-foreground" : ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" placeholder="At least 6 characters" value={password}
                  onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
              </div>
            </>
          )}

          {error && (
            <p className="text-sm text-destructive rounded-sm bg-destructive/10 px-3 py-2">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {mobileStep === "password" || !isMobile ? "Creating account…" : ""}
              </>
            ) : isMobile && mobileStep !== "password" ? (
              <>
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            ) : (
              "Create account"
            )}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
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
