"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, AlertTriangle, Users } from "lucide-react";
import { MerchivaLogo } from "@/components/logo";
import { useAuth } from "@/lib/auth/context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SpacetimeProvider } from "@/lib/spacetimedb/provider";
import { getInvitationByToken } from "@/lib/db/team";
import { acceptInvitation } from "@/lib/spacetimedb/actions";
import { useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import type { OrgInvitation } from "@/lib/types";
import { Spinner } from "@/components/ui/loaders/geometric";

export default function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Spinner size={24} className="text-muted-foreground" />
      </div>
    );
  }

  // Not signed in — show sign-in / sign-up prompt directly.
  // We can't fetch invitation details without an active SpacetimeDB connection.
  if (!isSignedIn) {
    return <SignInPrompt token={token} />;
  }

  // Signed in — mount SpacetimeProvider so useTable / getInvitationByToken work.
  return (
    <SpacetimeProvider>
      <InviteInner token={token} />
    </SpacetimeProvider>
  );
}

function SignInPrompt({ token }: { token: string }) {
  const returnTo = `/invite/${token}`;
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-3 pb-4">
          <div className="flex items-center gap-2.5">
            <MerchivaLogo size={36} fg="var(--primary-foreground)" bg="var(--primary)" rounded />
            <div>
              <p className="font-bold text-base leading-none">Merchiva</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Team invitation</p>
            </div>
          </div>
          <div className="space-y-1">
            <CardTitle className="text-lg">You&apos;re invited to join a team</CardTitle>
            <CardDescription>Sign in or create an account to view and accept this invitation.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <Link href={`/login?next=${encodeURIComponent(returnTo)}`} className="block">
            <Button className="w-full">Sign in to accept</Button>
          </Link>
          <Link href={`/signup?next=${encodeURIComponent(returnTo)}`} className="block">
            <Button variant="outline" className="w-full">Create an account</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function InviteInner({ token }: { token: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const userEmail = user?.email ?? null;

  const [invitation, setInvitation] = useState<OrgInvitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Subscribe to invitations so the table has rows by the time we look.
  const [invRows, invReady] = useTable(tables.orgInvitation);
  const [orgRows] = useTable(tables.organization);

  const orgName = invitation
    ? (orgRows || []).find((o) => o.id.toString() === invitation.organizationId)?.name ?? ""
    : "";

  useEffect(() => {
    if (!invReady) return;

    (async () => {
      const inv = await getInvitationByToken(token);
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
      setLoading(false);
    })().catch(() => {
      setError("Failed to load invitation.");
      setLoading(false);
    });
    // Re-run when subscription table contents change
  }, [token, invReady, invRows]);

  const handleAccept = async () => {
    if (!invitation) return;
    setAccepting(true);
    setError(null);
    try {
      await acceptInvitation(token);
      setSuccess(true);
      setTimeout(() => router.push("/choose"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept invitation. Please try again.");
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Spinner size={24} className="text-muted-foreground" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-sm text-center">
          <CardContent className="pt-8 pb-8 space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 mx-auto">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            </div>
            <h2 className="font-bold text-lg">Welcome aboard!</h2>
            <p className="text-sm text-muted-foreground">
              You&apos;ve joined <strong>{orgName}</strong>. Redirecting to dashboard…
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error && !invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-8 pb-8 space-y-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 mx-auto">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <h2 className="font-bold text-lg">Invalid Invitation</h2>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Link href="/choose" className="text-sm font-medium underline underline-offset-4 text-muted-foreground">
              Go to dashboard
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-3 pb-4">
          <div className="flex items-center gap-2.5">
            <MerchivaLogo size={36} fg="var(--primary-foreground)" bg="var(--primary)" rounded />
            <div>
              <p className="font-bold text-base leading-none">Merchiva</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Team invitation</p>
            </div>
          </div>
          <div className="space-y-1">
            <CardTitle className="text-xl">You&apos;re invited!</CardTitle>
            <CardDescription>
              Join <strong>{orgName || "a team"}</strong> on Merchiva
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {invitation && (
            <div className="rounded-[0.3rem] bg-muted/50 border border-border p-4 space-y-2">
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

          {userEmail && invitation && userEmail.toLowerCase() !== invitation.email.toLowerCase() && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-[0.3rem] px-3 py-2">
              This invite was sent to <strong>{invitation.email}</strong> but you&apos;re signed in as <strong>{userEmail}</strong>.
            </p>
          )}

          {error && (
            <p className="text-sm text-destructive rounded-[0.3rem] bg-destructive/10 px-3 py-2">
              {error}
            </p>
          )}

          <Button
            onClick={handleAccept}
            disabled={accepting}
            className="w-full gap-2"
          >
            {accepting ? (
              <Spinner size={16} />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {accepting ? "Joining…" : "Accept invitation"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
