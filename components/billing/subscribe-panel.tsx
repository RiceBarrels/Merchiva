"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Lock, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { IconTile } from "@/components/ui/icon-tile";
import { Num } from "@/components/ui/num";
import { OptionRow } from "@/components/ui/option-row";
import { Spinner } from "@/components/ui/loaders/geometric";
import { StoreLogo, StorePlanBadge, StoreList } from "@/components/store-picker";
import { useOrganizations, useOrgMembers } from "@/lib/spacetimedb/hooks";
import { useSpacetimeDB } from "spacetimedb/react";
import { updateOrgSubscription } from "@/lib/spacetimedb/actions";
import { usePermissions } from "@/lib/context/permissions";
import { useAuth } from "@/lib/auth/context";
import { evaluateSubscription, type SubscriptionRow } from "@/lib/billing/subscription";
import { useT } from "@/lib/i18n/context";
import { toast } from "sonner";

interface OrgRow extends SubscriptionRow {
  id: { toString(): string };
  stripeCustomerId?: string | null;
}

export interface SubscribePanelProps {
  /** Path Stripe returns to (`?session_id=…&status=success|canceled` is
   *  appended by the checkout route, so pass a path without a query). */
  returnPath: string;
  /** Path to `router.replace` after the Stripe status params were handled. */
  cleanupPath?: string;
  /** Embedded inside /choose: no full-screen wrapper, no store list or
   *  sign-out links (the chooser has its own), no redirect once subscribed. */
  embedded?: boolean;
  className?: string;
}

/**
 * The Merchiva Pro paywall: plan rows → Stripe Checkout, sync on return.
 * Used full-screen by /manager/subscribe and embedded on /choose so the
 * subscription is sorted out on the same screen as the store/mode choice.
 */
export function SubscribePanel({ returnPath, cleanupPath, embedded = false, className }: SubscribePanelProps) {
  const t = useT();
  const router = useRouter();
  const sp = useSearchParams();
  const { organizationId, currentOrg, isOwner, organizations, switchOrg } = usePermissions();
  const { user, signOut } = useAuth();
  const [rawOrgs] = useOrganizations() as [unknown[], boolean];
  const stdb = useSpacetimeDB();
  const [orgMembers] = useOrgMembers();
  const [busy, setBusy] = useState<null | "monthly" | "yearly">(null);
  const [syncing, setSyncing] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [checkedAt] = useState(() => Date.now());

  // Subscription lives on the root (top-level) org. Sub-stores inherit it.
  const billingOrgId = organizationId;

  const org = useMemo<OrgRow | null>(() => {
    if (!billingOrgId) return null;
    for (const r of rawOrgs as OrgRow[]) {
      if (r.id.toString() === billingOrgId) return r;
    }
    return null;
  }, [rawOrgs, billingOrgId]);

  const customerId = org?.stripeCustomerId ?? null;
  const access = useMemo(() => evaluateSubscription(org, checkedAt), [org, checkedAt]);

  // Stores this user is an active member of — lets a user locked out of one
  // store switch to another that still has an active plan/trial.
  const identityStr = stdb?.identity?.toString() ?? null;
  const myStores = useMemo(() => {
    if (!identityStr) return [];
    const memberOrgIds = new Set(
      orgMembers
        .filter((m) => m.status === "active" && m.userId.toString() === identityStr)
        .map((m) => m.organizationId.toString()),
    );
    return organizations.filter((o) => memberOrgIds.has(o.id));
  }, [orgMembers, organizations, identityStr]);

  const handleSwitchStore = useCallback(
    async (id: string) => {
      if (id === organizationId) return;
      setSwitchingId(id);
      try {
        await switchOrg(id);
      } catch {
        setSwitchingId(null);
      }
    },
    [organizationId, switchOrg],
  );

  // Refresh subscription state from Stripe (used after returning from checkout).
  const sync = useCallback(
    async ({ sessionId, custId }: { sessionId?: string; custId?: string | null } = {}) => {
      if (!billingOrgId) return;
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
          organizationId: billingOrgId,
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
    [billingOrgId],
  );

  // Returning from Stripe checkout — sync, then strip the status params.
  const sessionIdParam = sp.get("session_id");
  const statusParam = sp.get("status");
  const afterReturn = cleanupPath ?? returnPath;
  useEffect(() => {
    if (statusParam === "success" && sessionIdParam) {
      void sync({ sessionId: sessionIdParam });
      toast.success(t("subscribe.toastActivated"));
      router.replace(afterReturn);
    } else if (statusParam === "canceled") {
      toast.info(t("subscribe.toastCanceled"));
      router.replace(afterReturn);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionIdParam, statusParam]);

  // Full-screen paywall: once the org is paid there's no reason to sit here.
  // Embedded on /choose the chooser simply stops showing the panel.
  useEffect(() => {
    if (!embedded && access.isSubscribed) router.replace("/manager/");
  }, [embedded, access.isSubscribed, router]);

  const handleSubscribe = useCallback(
    async (cycle: "monthly" | "yearly") => {
      if (!billingOrgId) return;
      setBusy(cycle);
      try {
        const res = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orgId: billingOrgId,
            interval: cycle === "yearly" ? "year" : "month",
            stripeCustomerId: customerId ?? undefined,
            customerEmail: user?.email,
            returnPath,
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
    [billingOrgId, customerId, user?.email, returnPath, t],
  );

  const trialLine = access.inTrial
    ? (access.trialDaysLeft === 1
        ? t("subscribe.trialDaysLeftOne")
        : t("subscribe.trialDaysLeftOther").replace("{count}", String(access.trialDaysLeft)))
    : t("subscribe.trialEnded");

  return (
    <div className={className ?? "w-full max-w-md space-y-6"}>
      <div className={embedded ? "space-y-2" : "space-y-2 text-center"}>
        {!embedded && (
          <IconTile size="lg" className="mx-auto text-foreground" icon={access.inTrial ? Sparkles : Lock} />
        )}
        <h2 className={embedded ? "flex items-center gap-2 text-[15px] font-semibold" : "text-xl font-bold"}>
          {embedded && <Lock className="h-4 w-4 text-muted-foreground" />}
          {access.inTrial ? t("subscribe.titleTrial") : t("subscribe.titleSubscribe")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {access.inTrial
            ? t("subscribe.trialDescription").replace("{trialLine}", trialLine)
            : isOwner
              ? t("subscribe.ownerDescription")
              : t("subscribe.memberDescription")}
        </p>
        {!embedded && (
          <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 text-left">
            <StoreLogo name={currentOrg?.name ?? ""} logoUrl={currentOrg?.logoUrl} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{currentOrg?.name}</span>
            <StorePlanBadge
              store={{ id: organizationId ?? "" }}
              className="shrink-0"
            />
          </div>
        )}
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
        <div className="rounded-lg border bg-muted/40 p-4 text-center text-[13px] text-muted-foreground">
          {t("subscribe.memberOwnerOnly").replace("{org}", currentOrg?.name ?? t("subscribe.yourOrganization"))}
        </div>
      )}

      {!embedded && myStores.length > 1 && (
        <div className="space-y-2">
          <Eyebrow>{t("subscribe.yourStores")}</Eyebrow>
          <p className="text-[12px] text-muted-foreground">{t("subscribe.switchStoreHint")}</p>
          <StoreList
            stores={myStores}
            currentOrgId={organizationId}
            busyOrgId={switchingId}
            onSelect={handleSwitchStore}
          />
        </div>
      )}

      {embedded ? (
        syncing && (
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <Spinner size={13} />
          </div>
        )
      ) : (
        <div className="flex items-center justify-center gap-4 pt-2 text-[12px] text-muted-foreground">
          {access.inTrial && (
            <Button
              variant="link"
              size="xs"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => router.replace("/manager/")}
            >
              {t("subscribe.continueInTrial")}
            </Button>
          )}
          {syncing && <Spinner size={13} />}
          <Button
            variant="link"
            size="xs"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => signOut()}
          >
            {t("common.signOut")}
          </Button>
        </div>
      )}
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
    <OptionRow
      selected={highlight}
      hideCheck
      onSelect={onClick}
      disabled={disabled}
      title={
        <span className="inline-flex items-center gap-2">
          {label}
          {highlight && <Badge variant="default" className="h-4 text-[9px]">{t("subscribe.recommended")}</Badge>}
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
