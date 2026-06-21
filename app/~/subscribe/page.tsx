"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Lock, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/loaders/geometric";
import { useOrganizations } from "@/lib/spacetimedb/hooks";
import { updateOrgSubscription } from "@/lib/spacetimedb/actions";
import { usePermissions } from "@/lib/context/permissions";
import { useAuth } from "@/lib/auth/context";
import { evaluateSubscription, type SubscriptionRow } from "@/lib/billing/subscription";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { toast } from "sonner";

interface OrgRow extends SubscriptionRow {
  id: { toString(): string };
  stripeCustomerId?: string | null;
}

function SubscribeInner() {
  const t = useT();
  const router = useRouter();
  const sp = useSearchParams();
  const { organizationId, currentOrg, isOwner } = usePermissions();
  const { user, signOut } = useAuth();
  const [rawOrgs] = useOrganizations() as [unknown[], boolean];
  const [busy, setBusy] = useState<null | "monthly" | "yearly">(null);
  const [syncing, setSyncing] = useState(false);

  // Subscription lives on the root (top-level) org. Sub-stores inherit it.
  const rootOrgId = currentOrg?.parentOrgId ?? organizationId;

  const org = useMemo<OrgRow | null>(() => {
    if (!rootOrgId) return null;
    for (const r of rawOrgs as OrgRow[]) {
      if (r.id.toString() === rootOrgId) return r;
    }
    return null;
  }, [rawOrgs, rootOrgId]);

  const customerId = org?.stripeCustomerId ?? null;
  const access = useMemo(
    () => evaluateSubscription(org, Date.now()),
    [org],
  );

  // Refresh subscription state from Stripe (used after returning from checkout).
  const sync = useCallback(
    async ({ sessionId, custId }: { sessionId?: string; custId?: string | null } = {}) => {
      if (!rootOrgId) return;
      const params = new URLSearchParams();
      if (sessionId) params.set("sessionId", sessionId);
      if (custId) params.set("stripeCustomerId", custId);
      if (!params.toString()) return;
      setSyncing(true);
      try {
        const res = await fetch(`/api/billing/sync?${params.toString()}`);
        if (!res.ok) {
          console.error("[subscribe] sync failed:", res.status, await res.text());
          return;
        }
        const snap = (await res.json()) as {
          stripeCustomerId: string;
          subscriptionStatus: string | null;
          subscriptionPriceId: string | null;
          subscriptionInterval: "month" | "year" | null;
          currentPeriodEnd: number | null;
        };
        await updateOrgSubscription({
          organizationId: rootOrgId,
          stripeCustomerId: snap.stripeCustomerId,
          subscriptionStatus: snap.subscriptionStatus,
          subscriptionPriceId: snap.subscriptionPriceId,
          subscriptionInterval: snap.subscriptionInterval,
          currentPeriodEndUnix: snap.currentPeriodEnd,
        });
      } catch (err) {
        console.error("[subscribe] sync error:", err);
      } finally {
        setSyncing(false);
      }
    },
    [rootOrgId],
  );

  // Returning from Stripe checkout — sync, then the gate below sends them on.
  const sessionIdParam = sp.get("session_id");
  const statusParam = sp.get("status");
  useEffect(() => {
    if (statusParam === "success" && sessionIdParam) {
      void sync({ sessionId: sessionIdParam });
      toast.success(t("subscribe.toastActivated"));
      router.replace("/~/subscribe");
    } else if (statusParam === "canceled") {
      toast.info(t("subscribe.toastCanceled"));
      router.replace("/~/subscribe");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionIdParam, statusParam]);

  // Once the org has a paid/active subscription there's no reason to sit on the
  // paywall — send them into the app. (Trial users stay so they can upgrade.)
  useEffect(() => {
    if (access.isSubscribed) router.replace("/~/");
  }, [access.isSubscribed, router]);

  const handleSubscribe = useCallback(
    async (cycle: "monthly" | "yearly") => {
      if (!rootOrgId) return;
      setBusy(cycle);
      try {
        const res = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orgId: rootOrgId,
            interval: cycle === "yearly" ? "year" : "month",
            stripeCustomerId: customerId ?? undefined,
            customerEmail: user?.email,
            returnPath: "/~/subscribe",
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(t("subscribe.toastCheckoutFailed"), { description: err.error });
          return;
        }
        const { url } = (await res.json()) as { url: string };
        window.location.href = url;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("subscribe.toastCheckoutFailed"));
      } finally {
        setBusy(null);
      }
    },
    [rootOrgId, customerId, user?.email, t],
  );

  const trialLine = access.inTrial
    ? (access.trialDaysLeft === 1
        ? t("subscribe.trialDaysLeftOne")
        : t("subscribe.trialDaysLeftOther").replace("{count}", String(access.trialDaysLeft)))
    : t("subscribe.trialEnded");

  return (
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center overflow-auto bg-background px-6 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-[0.3rem] border bg-muted">
            {access.inTrial ? (
              <Sparkles className="h-5 w-5 text-foreground" />
            ) : (
              <Lock className="h-5 w-5 text-foreground" />
            )}
          </div>
          <h1 className="text-xl font-bold">
            {access.inTrial ? t("subscribe.titleTrial") : t("subscribe.titleSubscribe")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {access.inTrial
              ? t("subscribe.trialDescription").replace("{trialLine}", trialLine)
              : isOwner
                ? t("subscribe.ownerDescription")
                : t("subscribe.memberDescription")}
          </p>
        </div>

        {isOwner ? (
          <>
            <div className="space-y-2">
              <PlanRow
                label={t("subscribe.monthly")}
                price="$29"
                period={t("subscribe.perMonth")}
                onClick={() => handleSubscribe("monthly")}
                busy={busy === "monthly"}
                disabled={!!busy}
              />
              <PlanRow
                label={t("subscribe.yearly")}
                price="$290"
                period={t("subscribe.perYear")}
                hint={t("subscribe.yearlyHint")}
                highlight
                onClick={() => handleSubscribe("yearly")}
                busy={busy === "yearly"}
                disabled={!!busy}
              />
            </div>
            <ul className="space-y-1.5 text-[12px] text-muted-foreground">
              {[
                t("subscribe.featureAllFeatures"),
                t("subscribe.featureUnlimitedMembers"),
                t("subscribe.featurePrioritySupport"),
              ].map((b) => (
                <li key={b} className="flex items-start gap-1.5">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="rounded-[0.3rem] border bg-muted/40 p-4 text-center text-[13px] text-muted-foreground">
            {t("subscribe.memberOwnerOnly").replace(
              "{org}",
              currentOrg?.name ?? t("subscribe.yourOrganization"),
            )}
          </div>
        )}

        <div className="flex items-center justify-center gap-4 pt-2 text-[12px] text-muted-foreground">
          {access.inTrial && (
            <button
              onClick={() => router.replace("/~/")}
              className="underline underline-offset-4 hover:text-foreground"
            >
              {t("subscribe.continueInTrial")}
            </button>
          )}
          {syncing && <Spinner size={13} />}
          <button
            onClick={() => signOut()}
            className="underline underline-offset-4 hover:text-foreground"
          >
            {t("common.signOut")}
          </button>
        </div>
      </div>
    </div>
  );
}

function PlanRow({
  label, price, period, hint, highlight, onClick, busy, disabled,
}: {
  label: string;
  price: string;
  period: string;
  hint?: string;
  highlight?: boolean;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-[0.3rem] border px-3 py-3 text-left transition-colors",
        highlight
          ? "border-foreground bg-foreground/[0.03] hover:bg-foreground/[0.06]"
          : "border-border hover:bg-muted/50",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <div>
        <div className="flex items-center gap-2 text-[13px] font-medium">
          {label}
          {highlight && <Badge variant="default" className="h-4 text-[9px]">{t("subscribe.recommended")}</Badge>}
        </div>
        {hint && <p className="mt-0.5 text-[10.5px] text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex items-center gap-2">
        <div className="text-right">
          <div className="text-[15px] font-bold tabular-nums">{price}</div>
          <div className="text-[10px] text-muted-foreground">{period}</div>
        </div>
        {busy && <Spinner size={14} className="text-muted-foreground" />}
      </div>
    </button>
  );
}

export default function SubscribePage() {
  return (
    <Suspense fallback={<div className="p-6"><Spinner size={20} className="text-muted-foreground" /></div>}>
      <SubscribeInner />
    </Suspense>
  );
}
