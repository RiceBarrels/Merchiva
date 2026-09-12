"use client";

import { useMemo } from "react";
import { Check, ChevronRight, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/loaders/geometric";
import { Button } from "@/components/ui/button";
import { IconTile } from "@/components/ui/icon-tile";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { useOrganizations } from "@/lib/spacetimedb/hooks";
import { evaluateSubscription } from "@/lib/billing/subscription";
import type { OrgSummary } from "@/lib/types";

// ─── StoreLogo ────────────────────────────────────────────────────────────────
// Square store tile: the store image when set, otherwise a letter tile built
// from the first character of the store name.

export function StoreLogo({
  name,
  logoUrl,
  className,
}: {
  name: string;
  logoUrl?: string | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted",
        className,
      )}
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span className="text-sm font-semibold text-muted-foreground">
          {(name.charAt(0) || "?").toUpperCase()}
        </span>
      )}
    </div>
  );
}

// ─── StorePlanBadge ───────────────────────────────────────────────────────────
// Plan chip for a store. Subscriptions live on the ROOT org — sub-stores
// inherit the parent's plan, so we resolve parentOrgId ?? id before looking up
// the org row.

export function StorePlanBadge({
  store,
  className,
}: {
  store: Pick<OrgSummary, "id" | "parentOrgId">;
  className?: string;
}) {
  const t = useT();
  const [orgRows] = useOrganizations();

  const rootId = store.parentOrgId ?? store.id;
  const row = useMemo(
    () => orgRows.find((o) => o.id.toString() === rootId) ?? null,
    [orgRows, rootId],
  );

  if (!row) return null;

  const access = evaluateSubscription(row, Date.now());

  let label: string;
  let tone: StatusTone;
  if (access.isSubscribed) {
    label =
      row.subscriptionInterval === "year"
        ? t("storePicker.planProYearly")
        : row.subscriptionInterval === "month"
          ? t("storePicker.planProMonthly")
          : t("storePicker.planPro");
    tone = "success";
  } else if (access.inTrial) {
    label =
      access.trialDaysLeft === 1
        ? t("storePicker.planTrialOne")
        : t("storePicker.planTrialOther").replace(
            "{count}",
            String(access.trialDaysLeft),
          );
    tone = "warning";
  } else {
    label = t("storePicker.planExpired");
    tone = "danger";
  }

  return (
    <StatusBadge size="xs" tone={tone} className={className}>
      {label}
    </StatusBadge>
  );
}

// ─── StoreList ────────────────────────────────────────────────────────────────
// Flat list of stores rendered as a one-level tree: root stores sorted by
// name, each followed by its indented sub-stores.

export function StoreList({
  stores,
  currentOrgId,
  busyOrgId,
  onSelect,
}: {
  stores: OrgSummary[];
  currentOrgId?: string | null;
  busyOrgId?: string | null;
  onSelect: (orgId: string) => void;
}) {
  const t = useT();

  // Root stores (no parent, or parent not in the accessible list) sorted by
  // name, each immediately followed by its sub-stores.
  const ordered = useMemo(() => {
    const byId = new Map(stores.map((s) => [s.id, s] as const));
    const childrenOf = new Map<string, OrgSummary[]>();
    const roots: OrgSummary[] = [];
    for (const s of stores) {
      const parent = s.parentOrgId && byId.has(s.parentOrgId) ? s.parentOrgId : null;
      if (parent) {
        const arr = childrenOf.get(parent) ?? [];
        arr.push(s);
        childrenOf.set(parent, arr);
      } else {
        roots.push(s);
      }
    }
    roots.sort((a, b) => a.name.localeCompare(b.name));
    const out: { store: OrgSummary; isChild: boolean }[] = [];
    for (const root of roots) {
      out.push({ store: root, isChild: false });
      const children = (childrenOf.get(root.id) ?? []).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      for (const child of children) out.push({ store: child, isChild: true });
    }
    return out;
  }, [stores]);

  return (
    <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {ordered.map(({ store: s, isChild }) => {
        const isCurrent = currentOrgId != null && s.id === currentOrgId;
        const isBusy = busyOrgId === s.id;
        const disabled = isCurrent || busyOrgId != null;
        return (
          <button
            key={s.id}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (!disabled) onSelect(s.id);
            }}
            className={cn(
              "flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors",
              isChild && "pl-6",
              !disabled && "hover:bg-muted/50",
              disabled && !isCurrent && "opacity-50",
            )}
          >
            {isChild && <span className="shrink-0 text-muted-foreground/70">↳</span>}
            <StoreLogo name={s.name} logoUrl={s.logoUrl} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {s.name}
            </span>
            {s.parentOrgId && (
              <StatusBadge size="xs">{t("multiStore.subBadge")}</StatusBadge>
            )}
            <StorePlanBadge store={s} />
            {isCurrent ? (
              <span className="flex shrink-0 items-center gap-1.5">
                <StatusBadge size="xs">{t("storePicker.current")}</StatusBadge>
                <Check className="h-4 w-4 text-emerald-600" />
              </span>
            ) : isBusy ? (
              <Spinner size={14} />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── StorePickerScreen ────────────────────────────────────────────────────────
// Full-screen store chooser (used at /manager when no store is active).

export function StorePickerScreen({
  stores,
  busyOrgId,
  onSelect,
  onSignOut,
}: {
  stores: OrgSummary[];
  busyOrgId?: string | null;
  onSelect: (orgId: string) => void;
  onSignOut?: () => void;
}) {
  const t = useT();
  return (
    <div className="flex min-h-screen flex-col justify-center bg-background px-6 py-10">
      <div className="mx-auto w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <IconTile icon={Store} size="lg" className="mx-auto text-foreground" />
          <h1 className="text-xl font-bold">{t("storePicker.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("storePicker.description")}
          </p>
        </div>

        <StoreList
          stores={stores}
          currentOrgId={null}
          busyOrgId={busyOrgId}
          onSelect={onSelect}
        />

        {onSignOut && (
          <div className="flex justify-center">
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={onSignOut}
              className="text-[12px] text-muted-foreground underline hover:text-foreground"
            >
              {t("common.signOut")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
