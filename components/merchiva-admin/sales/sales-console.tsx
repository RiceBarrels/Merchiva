"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/merchiva-admin/ui";
import { OrgPicker, useSelectedOrg } from "@/components/merchiva-admin/org-picker";
import { EmptyOrg, TabStrip } from "./shared";
import { SalesRecordsPanel } from "./sales-records-panel";
import { PaymentsPanel } from "./payments-panel";
import { ExpensesPanel } from "./expenses-panel";
import { CouponsPanel } from "./coupons-panel";
import { PointsPanel } from "./points-panel";
import { QueuePanel } from "./queue-panel";
import { BookingsPanel } from "./bookings-panel";

const TABS = [
  { id: "sales", label: "Sales records" },
  { id: "payments", label: "Payments" },
  { id: "expenses", label: "Expenses" },
  { id: "coupons", label: "Coupons" },
  { id: "points", label: "Customer points" },
  { id: "queue", label: "Queue" },
  { id: "bookings", label: "Bookings" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function isTab(v: string | null): v is TabId {
  return TABS.some((t) => t.id === v);
}

/** /merchivaAdmin/sales — per-org sales & finance console with `?tab=` sub-sections. */
export function SalesConsole() {
  const { orgId, setOrgId } = useSelectedOrg();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("tab");
  const tab: TabId = isTab(raw) ? raw : "sales";

  const setTab = useCallback(
    (next: TabId) => {
      const sp = new URLSearchParams(params.toString());
      if (next === "sales") sp.delete("tab");
      else sp.set("tab", next);
      router.replace(`${pathname}${sp.toString() ? `?${sp}` : ""}`);
    },
    [params, pathname, router],
  );

  return (
    <div>
      <PageHeader eyebrow="sales" title="Sales & finance">
        <OrgPicker orgId={orgId} onChange={setOrgId} />
      </PageHeader>
      <TabStrip tabs={[...TABS]} active={tab} onChange={setTab} />
      {!orgId ? (
        <EmptyOrg />
      ) : tab === "payments" ? (
        <PaymentsPanel key={orgId} orgId={orgId} />
      ) : tab === "expenses" ? (
        <ExpensesPanel key={orgId} orgId={orgId} />
      ) : tab === "coupons" ? (
        <CouponsPanel key={orgId} orgId={orgId} />
      ) : tab === "points" ? (
        <PointsPanel key={orgId} orgId={orgId} />
      ) : tab === "queue" ? (
        <QueuePanel key={orgId} orgId={orgId} />
      ) : tab === "bookings" ? (
        <BookingsPanel key={orgId} orgId={orgId} />
      ) : (
        <SalesRecordsPanel key={orgId} orgId={orgId} />
      )}
    </div>
  );
}
