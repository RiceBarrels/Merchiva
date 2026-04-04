"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Zap, CheckCircle2, AlertTriangle, Users } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { getInvitationByToken } from "@/lib/db/team";
import type { OrgInvitation } from "@/lib/types";

export default function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();

  const [invitation, setInvitation] = useState<OrgInvitation | null>(null);
  const [orgName, setOrgName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    const supabase = createClient();

    Promise.all([
      supabase.auth.getUser(),
      getInvitationByToken(token),
    ]).then(async ([{ data: { user } }, inv]) => {
      if (user) {
        setUserId(user.id);
        setUserEmail(user.email ?? null);
        setDisplayName(user.user_metadata?.business_name || user.email?.split("@")[0] || "");
      }

      if (!inv) {
        setError("This invitation is invalid or has already been accepted.");
        setLoading(false);
        return;
      }

      if (new Date(inv.expiresAt) < new Date()) {
        setError("This invitation has expired. Please ask the owner to send a new one.");
        setLoading(false);
        return;
      }

      setInvitation(inv);

      // Fetch org name
      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", inv.organizationId)
        .single();
      setOrgName(org?.name ?? "");
      setLoading(false);
    });
  }, [token]);

  const handleAccept = async () => {
    if (!userId || !invitation) return;

    setAccepting(true);
    setError(null);
    try {
      const res = await fetch("/api/team/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, displayName }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to accept invitation");
        return;
      }
      setSuccess(true);
      setTimeout(() => router.push("/"), 2000);
    } catch {
      setError("Failed to accept invitation. Please try again.");
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-sm shadow-lg text-center">
          <CardContent className="pt-8 pb-8 space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 mx-auto">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            </div>
            <h2 className="font-bold text-lg">Welcome aboard!</h2>
            <p className="text-sm text-muted-foreground">
              You've joined <strong>{orgName}</strong>. Redirecting to dashboard…
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error && !invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-sm shadow-lg">
          <CardContent className="pt-8 pb-8 space-y-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 mx-auto">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <h2 className="font-bold text-lg">Invalid Invitation</h2>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Link href="/login" className="text-sm font-medium underline underline-offset-4 text-muted-foreground">
              Go to sign in
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="space-y-3 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold text-base leading-none">BizOps</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">AI Business Manager</p>
            </div>
          </div>
          <div className="space-y-1">
            <CardTitle className="text-xl">You&apos;re invited!</CardTitle>
            <CardDescription>
              Join <strong>{orgName || "a team"}</strong> on BizOps
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {invitation && (
            <div className="rounded-lg bg-muted/50 border border-border p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{orgName}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Your role:</span>
                <Badge variant="secondary" className="capitalize">{invitation.role}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Invited:</span>
                <span className="text-sm">{invitation.email}</span>
              </div>
            </div>
          )}

          {!userId ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                You need to be signed in to accept this invitation.
              </p>
              <Link href={`/login?next=/invite/${token}`}>
                <Button className="w-full">Sign in to accept</Button>
              </Link>
              <Link href={`/signup?next=/invite/${token}`}>
                <Button variant="outline" className="w-full">Create an account</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {userEmail && invitation && userEmail.toLowerCase() !== invitation.email.toLowerCase() && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  This invite was sent to <strong>{invitation.email}</strong> but you&apos;re signed in as <strong>{userEmail}</strong>.
                </p>
              )}

              {error && (
                <p className="text-sm text-destructive rounded-lg bg-destructive/10 px-3 py-2">
                  {error}
                </p>
              )}

              <Button
                onClick={handleAccept}
                disabled={accepting}
                className="w-full gap-2"
              >
                {accepting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {accepting ? "Joining…" : "Accept invitation"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
