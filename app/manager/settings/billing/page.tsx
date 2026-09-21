"use client";

import { useEffect, useMemo, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, CreditCard, ExternalLink, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Num } from "@/components/ui/num";
import { OptionRow } from "@/components/ui/option-row";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/page-header";
import { PermissionGuard } from "@/components/permission-guard";
import { useOrganizations } from "@/lib/spacetimedb/hooks";
import { updateOrgSubscription } from "@/lib/spacetimedb/actions";
import { usePermissions } from "@/lib/context/permissions";
import { useAuth } from "@/lib/auth/context";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/loaders/geometric";
import { useT } from "@/lib/i18n/context";

interface OrgRow {
  id: { toString(): string };
  ownerId: { toString(): string };
  stripeCustomerId?: string | null;
  subscriptionStatus?: string | null;
  subscriptionPriceId?: string | null;
  subscriptionInterval?: string | null;
  currentPeriodEnd?: { microsSinceUnixEpoch: bigint } | null;
}

function periodEndToDate(p: OrgRow["currentPeriodEnd"]): Date | null {
  if (!p) return null;
  const micros = p.microsSinceUnixEpoch;
  if (typeof micros !== "bigint") return null;
  return new Date(Number(micros / BigInt(1000)));
}

const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

function BillingInner() {
  const t = useT();
  const router = useRouter();
  const sp = useSearchParams();
  const { organizationId, isOwner } = usePermissions();
  const { user, getToken } = useAuth();
  const [rawOrgs] = useOrganizations() as [unknown[], boolean];
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState<null | "monthly" | "yearly" | "portal">(null);

  const org = useMemo<OrgRow | null>(() => {
    if (!organizationId) return null;
    for (const r of rawOrgs as OrgRow[]) {
      if (r.id.toString() === organizationId) return r;
    }
    return null;
  }, [rawOrgs, organizationId]);

  const status = org?.subscriptionStatus ?? null;
  const interval = org?.subscriptionInterval ?? null;
  const customerId = org?.stripeCustomerId ?? null;
  const periodEnd = org ? periodEndToDate(org.currentPeriodEnd) : null;
  const isActive = !!(status && ACTIVE_STATUSES.has(status));

  // Sync subscription state from Stripe.
  const sync = useCallback(
    async ({ sessionId, custId }: { sessionId?: string; custId?: string | null } = {}) => {
      if (!organizationId) return;
      const params = new URLSearchParams();
      if (sessionId) params.set("sessionId", sessionId);
      if (custId) params.set("stripeCustomerId", custId);
      if (!params.toString()) return;
      setSyncing(true);
      try {
        const token = await getToken();
        const res = await fetch(`/api/billing/sync?${params.toString()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) {
          const errBody = await res.text();
          console.error("[billing] sync failed:", res.status, errBody);
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
          organizationId,
          stripeCustomerId: snap.stripeCustomerId,
          subscriptionStatus: snap.subscriptionStatus,
          subscriptionPriceId: snap.subscriptionPriceId,
          subscriptionInterval: snap.subscriptionInterval,
          currentPeriodEndUnix: snap.currentPeriodEnd,
        });
      } catch (err) {
        console.error("[billing] sync error:", err);
      } finally {
        setSyncing(false);
      }
    },
    [organizationId, getToken],
  );

  // On mount: if we just returned from checkout (has session_id), sync state.
  const sessionIdParam = sp.get("session_id");
  const statusParam = sp.get("status");
  useEffect(() => {
    if (statusParam === "success" && sessionIdParam) {
      void sync({ sessionId: sessionIdParam });
      toast.success(t("billing.toastSubscriptionActivated"));
      router.replace("/manager/settings/billing");
    } else if (statusParam === "canceled") {
      toast.info(t("billing.toastCheckoutCanceled"));
      router.replace("/manager/settings/billing");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionIdParam, statusParam]);

  // Also opportunistically refresh on first mount if we have a customer.
  useEffect(() => {
    if (!customerId) return;
    void sync({ custId: customerId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const handleSubscribe = useCallback(
    async (cycle: "monthly" | "yearly") => {
      if (!organizationId) return;
      setBusy(cycle);
      try {
        const res = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orgId: organizationId,
            interval: cycle === "yearly" ? "year" : "month",
            stripeCustomerId: customerId ?? undefined,
            customerEmail: user?.email,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(t("billing.toastCheckoutFailed"), { description: err.error });
          return;
        }
        const { url } = (await res.json()) as { url: string };
        window.location.href = url;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("billing.toastCheckoutFailed"));
      } finally {
        setBusy(null);
      }
    },
    [organizationId, customerId, user?.email, t],
  );

  const handlePortal = useCallback(async () => {
    if (!customerId) return;
    setBusy("portal");
    try {
      const token = await getToken();
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ stripeCustomerId: customerId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(t("billing.toastPortalOpenFailed"), { description: err.error });
        return;
      }
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("billing.toastPortalError"));
    } finally {
      setBusy(null);
    }
  }, [customerId, t, getToken]);

  if (!isOwner) {
    return (
      <PermissionGuard section="settings">
        <PageHeader title={t("billing.title")} subtitle={t("billing.subtitle")} />
        <div className="px-4 lg:px-6 py-4 max-w-2xl">
          <Card>
            <EmptyState description={t("billing.ownerOnly")} />
          </Card>
        </div>
      </PermissionGuard>
    );
  }

  return (
    <PermissionGuard section="settings">
      <PageHeader title={t("billing.title")} subtitle={t("billing.subtitle")} />
      <div className="px-4 lg:px-6 py-4 max-w-2xl space-y-4">
        {/* Current state */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">{t("billing.currentPlan")}</CardTitle>
              {syncing && <Spinner size={14} className="text-muted-foreground" />}
            </div>
          </CardHeader>
          <CardContent>
            {isActive ? (
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-emerald-600 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold">Merchiva Pro</span>
                    <StatusBadge tone="success">{status}</StatusBadge>
                    {interval && (
                      <Badge variant="outline" className="text-[10px]">
                        {interval === "year" ? t("billing.yearly") : t("billing.monthly")}
                      </Badge>
                    )}
                  </div>
                  {periodEnd && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {t("billing.nextRenewal").split("{date}").map((part, i) => (
                        <span key={i}>
                          {i > 0 && <Num size="xs" muted value={periodEnd.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })} />}
                          {part}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <CreditCard className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <div className="text-[15px] font-semibold">{t("billing.freePlan")}</div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {t("billing.upgradePrompt")}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Action: upgrade or manage */}
        {isActive ? (
          <Card>
            <CardContent className="py-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-[13px] font-medium">{t("billing.manageSubscription")}</div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {t("billing.manageSubscriptionDesc")}
                </p>
              </div>
              <Button onClick={handlePortal} disabled={busy === "portal"}>
                {busy === "portal" ? (
                  <Spinner size={16} />
                ) : (
                  <>
                    {t("billing.openPortal")}
                    <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t("billing.upgradeToPro")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <PlanRow
                label={t("billing.monthly")}
                price="$29"
                period={t("billing.perMonth")}
                onClick={() => handleSubscribe("monthly")}
                busy={busy === "monthly"}
                disabled={!!busy}
              />
              <PlanRow
                label={t("billing.yearly")}
                price="$290"
                period={t("billing.perYear")}
                hint={t("billing.yearlySaveHint")}
                highlight
                recommendedLabel={t("billing.recommended")}
                onClick={() => handleSubscribe("yearly")}
                busy={busy === "yearly"}
                disabled={!!busy}
              />
              <ul className="mt-3 space-y-1.5 text-[12px] text-muted-foreground">
                {[t("billing.featureAllFeatures"), t("billing.featureUnlimitedTeam"), t("billing.featurePrioritySupport")].map((b) => (
                  <li key={b} className="flex items-start gap-1.5">
                    <Check className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </PermissionGuard>
  );
}

function PlanRow({
  label, price, period, hint, highlight, recommendedLabel, onClick, busy, disabled,
}: {
  label: string;
  price: string;
  period: string;
  hint?: string;
  highlight?: boolean;
  recommendedLabel?: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <OptionRow
      selected={highlight}
      hideCheck
      onSelect={onClick}
      disabled={disabled}
      title={
        <span className="inline-flex items-center gap-2">
          {label}
          {highlight && recommendedLabel && <Badge variant="default" className="text-[9px] h-4">{recommendedLabel}</Badge>}
        </span>
      }
      description={hint}
      meta={
        <div className="flex items-center gap-2">
          <div className="text-right">
            <Num value={price} className="block text-[15px] font-bold" />
            <div className="text-[10px] text-muted-foreground">{period}</div>
          </div>
          {busy && <Spinner size={14} className="text-muted-foreground" />}
        </div>
      }
    />
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="p-6"><Spinner size={20} className="text-muted-foreground" /></div>}>
      <BillingInner />
    </Suspense>
  );
}
