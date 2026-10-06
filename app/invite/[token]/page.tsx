"use client";

// /invite/[token]: accept an org invitation.
//
// The page cannot look the invitation up first: org_invitation is readable only
// by members of the org that sent it, and the invitee is not one yet. It used
// to try anyway, find nothing, and call every invitation "invalid or already
// accepted". Now it offers Accept straight away and lets the module decide
// (token, expiry, address — lib/spacetimedb/actions/invite.ts). The store name
// comes from the email's link (`?org=`) and is display-only: the token alone
// decides which store is joined, at which role. The role is not shown before
// joining — a link can say anything, and "Your role: Owner" is the one claim
// worth faking.

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, AlertTriangle, Users } from "lucide-react";
import { MerchivaLogo } from "@/components/logo";
import { useAuth } from "@/lib/auth/context";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SpacetimeProvider, useSpacetimeStatus } from "@/lib/spacetimedb/provider";
import { acceptInvitationAs, InviteError, type InviteErrorCode } from "@/lib/spacetimedb/actions/invite";
import { useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { Spinner } from "@/components/ui/loaders/geometric";

/** Display-only hint from the invitation email's link. */
function useLinkHints(): { org: string } {
  const [hints] = useState(() => {
    if (typeof window === "undefined") return { org: "" };
    return { org: (new URLSearchParams(window.location.search).get("org") ?? "").trim().slice(0, 80) };
  });
  return hints;
}

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Spinner size={24} className="text-muted-foreground" />
      </div>
    );
  }
  if (!isSignedIn) return <SignInPrompt token={token} />;
  return (
    <SpacetimeProvider>
      <InviteInner token={token} />
    </SpacetimeProvider>
  );
}

function Brand() {
  const t = useT();
  return (
    <div className="flex items-center gap-2.5">
      <MerchivaLogo size={36} fg="var(--primary-foreground)" bg="var(--primary)" rounded />
      <div>
        <p className="font-bold text-base leading-none">Merchiva</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{t("invite.teamInvitation")}</p>
      </div>
    </div>
  );
}

function SignInPrompt({ token }: { token: string }) {
  const t = useT();
  const hints = useLinkHints();
  const returnTo = typeof window === "undefined" ? `/invite/${token}` : `${window.location.pathname}${window.location.search}`;
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-3 pb-4">
          <Brand />
          <div className="space-y-1">
            <CardTitle className="text-lg">
              {hints.org ? fmt(t("invite.joinOrg"), { org: hints.org }) : t("invite.signInTitle")}
            </CardTitle>
            <CardDescription>{t("invite.signInDesc")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <Link href={`/login?next=${encodeURIComponent(returnTo)}`} className="block">
            <Button className="w-full">{t("invite.signIn")}</Button>
          </Link>
          <Link href={`/signup?next=${encodeURIComponent(returnTo)}`} className="block">
            <Button variant="outline" className="w-full">{t("invite.createAccount")}</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

const ERROR_KEY: Record<InviteErrorCode, string> = {
  invalid: "invite.errInvalid",
  used: "invite.errUsed",
  expired: "invite.errExpired",
  wrongEmail: "invite.errWrongEmail",
  alreadyMember: "invite.errAlreadyMember",
  emailTaken: "invite.errEmailTaken",
  notConnected: "invite.errNotConnected",
  failed: "invite.errFailed",
};

/** These cannot be retried: show them in place of the invitation. */
const FINAL: ReadonlySet<InviteErrorCode> = new Set(["invalid", "used", "expired", "alreadyMember"]);

function InviteInner({ token }: { token: string }) {
  const t = useT();
  const router = useRouter();
  const { user } = useAuth();
  const { connected } = useSpacetimeStatus();
  const hints = useLinkHints();
  const [orgRows] = useTable(tables.organization);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<{ code: InviteErrorCode; detail: string } | null>(null);
  const [joinedOrgId, setJoinedOrgId] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const joinedName = joinedOrgId ? orgRows.find((o) => o.id.toString() === joinedOrgId)?.name ?? "" : "";
  const here = typeof window === "undefined" ? `/invite/${token}` : `${window.location.pathname}${window.location.search}`;
  const anotherAccount = `/login?addAccount=1&next=${encodeURIComponent(here)}`;

  const handleAccept = async () => {
    setAccepting(true);
    setError(null);
    try {
      const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
      const orgId = await acceptInvitationAs(token, user?.email ?? null, name);
      if (orgId) {
        // Land in the store just joined, not whichever one was open last.
        try { localStorage.setItem("active_org_id", orgId); } catch {}
      }
      setJoinedOrgId(orgId);
      setSuccess(true);
      setTimeout(() => router.push("/choose"), 1500);
    } catch (err) {
      const code = err instanceof InviteError ? err.code : "failed";
      setError({ code, detail: err instanceof Error ? err.message : String(err) });
    } finally {
      setAccepting(false);
    }
  };

  if (success) {
    const org = joinedName || hints.org;
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-sm text-center">
          <CardContent className="pt-8 pb-8 space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 mx-auto">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            </div>
            <h2 className="font-bold text-lg">{t("invite.welcome")}</h2>
            <p className="text-sm text-muted-foreground">
              {org ? fmt(t("invite.joined"), { org }) : t("invite.joinedTeam")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error && FINAL.has(error.code)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-8 pb-8 space-y-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 mx-auto">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <h2 className="font-bold text-lg">{t("invite.errorTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t(ERROR_KEY[error.code])}</p>
            <Link href="/choose" className="text-sm font-medium underline underline-offset-4 text-muted-foreground">
              {t("invite.goToDashboard")}
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
          <Brand />
          <div className="space-y-1">
            <CardTitle className="text-xl">{t("invite.invitedTitle")}</CardTitle>
            <CardDescription>
              {hints.org ? fmt(t("invite.joinOrg"), { org: hints.org }) : t("invite.joinTeam")}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-[0.3rem] bg-muted/50 border border-border p-4 space-y-2">
            {hints.org && (
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{hints.org}</span>
              </div>
            )}
            {user?.email && (
              <p className="text-sm text-muted-foreground">
                {fmt(t("invite.signedInAs"), { email: user.email })}
              </p>
            )}
          </div>

          {error && (
            <div className="space-y-2 rounded-[0.3rem] bg-destructive/10 px-3 py-2">
              <p className="text-sm text-destructive">{t(ERROR_KEY[error.code])}</p>
              {error.code === "failed" && error.detail && (
                <p className="font-mono text-[11px] text-destructive/80 break-words">{error.detail}</p>
              )}
            </div>
          )}

          <Button onClick={handleAccept} disabled={accepting || !connected} className="w-full gap-2">
            {accepting || !connected ? <Spinner size={16} /> : <CheckCircle2 className="h-4 w-4" />}
            {accepting ? t("invite.joining") : !connected ? t("invite.connecting") : t("invite.accept")}
          </Button>

          {(error?.code === "wrongEmail" || error?.code === "emailTaken") && (
            <Link href={anotherAccount} className="block">
              <Button variant="outline" className="w-full">{t("invite.useAnotherAccount")}</Button>
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
