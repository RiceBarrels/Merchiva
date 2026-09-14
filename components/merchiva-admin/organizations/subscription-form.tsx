"use client";

import { useState } from "react";
import { formatTs } from "@/lib/merchiva-admin/client";
import { Badge, ErrorBanner, Notice, Panel, btnCls, inputCls } from "@/components/merchiva-admin/ui";
import { SUBSCRIPTION_STATUSES, localInputToMs, msToLocalInput, subscriptionTone, type OrganizationRow } from "./types";
import { fieldCls, labelCls, useAction } from "./use-action";

export function SubscriptionForm({ org, onChanged }: { org: OrganizationRow; onChanged: () => void }) {
  const { run, busy, error, notice } = useAction(onChanged);
  const [stripeCustomerId, setStripeCustomerId] = useState(org.stripeCustomerId ?? "");
  const [status, setStatus] = useState(org.subscriptionStatus ?? "none");
  const [priceId, setPriceId] = useState(org.subscriptionPriceId ?? "");
  const [interval, setIntervalValue] = useState(org.subscriptionInterval ?? "");
  const [periodEnd, setPeriodEnd] = useState(msToLocalInput(org.currentPeriodEnd));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    // The reducer leaves a field unchanged when it is null; "" writes an empty
    // value (the module stores it as-is). Only send fields that differ.
    const nextStatus = status === "none" ? "" : status;
    const args: Record<string, unknown> = {
      organizationId: org.id,
      stripeCustomerId: stripeCustomerId.trim() !== (org.stripeCustomerId ?? "") ? stripeCustomerId.trim() : null,
      subscriptionStatus: nextStatus !== (org.subscriptionStatus ?? "") ? nextStatus : null,
      subscriptionPriceId: priceId.trim() !== (org.subscriptionPriceId ?? "") ? priceId.trim() : null,
      subscriptionInterval: interval.trim() !== (org.subscriptionInterval ?? "") ? interval.trim() : null,
      currentPeriodEnd: null,
    };
    const nextEnd = localInputToMs(periodEnd);
    if (nextEnd !== null && nextEnd !== org.currentPeriodEnd) args.currentPeriodEnd = nextEnd;
    await run("updateOrgSubscription", args, "Subscription updated");
  }

  return (
    <Panel
      title="Subscription"
      actions={
        <span className="text-[11px] text-stone-500">
          Stripe is canonical; this row is a cache. Stripe customer: <span className="font-mono">{org.stripeCustomerId || "—"}</span>
        </span>
      }
    >
      <ErrorBanner message={error} />
      <Notice message={notice} />
      <div className="flex flex-wrap items-center gap-3 border-b border-stone-200 px-4 py-2 text-[12px] text-stone-600">
        <span>
          Status <Badge tone={subscriptionTone(org.subscriptionStatus)}>{org.subscriptionStatus || "none"}</Badge>
        </span>
        <span>
          Interval <span className="font-mono">{org.subscriptionInterval || "—"}</span>
        </span>
        <span>
          Price <span className="font-mono">{org.subscriptionPriceId || "—"}</span>
        </span>
        <span>Period end {formatTs(org.currentPeriodEnd)}</span>
      </div>
      <form onSubmit={save} className="grid gap-3 p-4 md:grid-cols-5">
        <div className={fieldCls}>
          <label className={labelCls}>Stripe customer id</label>
          <input className={`${inputCls} font-mono`} value={stripeCustomerId} onChange={(e) => setStripeCustomerId(e.target.value)} placeholder="cus_…" />
        </div>
        <div className={fieldCls}>
          <label className={labelCls}>Status</label>
          <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
            {SUBSCRIPTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            {!SUBSCRIPTION_STATUSES.includes(status as (typeof SUBSCRIPTION_STATUSES)[number]) && <option value={status}>{status}</option>}
          </select>
        </div>
        <div className={fieldCls}>
          <label className={labelCls}>Price id</label>
          <input className={`${inputCls} font-mono`} value={priceId} onChange={(e) => setPriceId(e.target.value)} placeholder="price_…" />
        </div>
        <div className={fieldCls}>
          <label className={labelCls}>Interval</label>
          <select className={inputCls} value={interval} onChange={(e) => setIntervalValue(e.target.value)}>
            <option value="">—</option>
            <option value="month">month</option>
            <option value="year">year</option>
            {interval && interval !== "month" && interval !== "year" && <option value={interval}>{interval}</option>}
          </select>
        </div>
        <div className={fieldCls}>
          <label className={labelCls}>Current period end</label>
          <input type="datetime-local" className={inputCls} value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        </div>
        <div className="md:col-span-5 flex items-center gap-3">
          <button type="submit" className={btnCls} disabled={busy}>
            {busy ? "Saving…" : "Save subscription"}
          </button>
          <span className="text-[11px] text-stone-500">Unchanged fields are left as-is. Clearing period end is not supported by the reducer.</span>
        </div>
      </form>
    </Panel>
  );
}
