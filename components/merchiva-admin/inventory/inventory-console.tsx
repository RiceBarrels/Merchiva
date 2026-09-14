"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/merchiva-admin/ui";
import { OrgPicker, useSelectedOrg } from "@/components/merchiva-admin/org-picker";
import { ItemsTab } from "./items-tab";
import { TransactionsTab } from "./transactions-tab";
import { WasteTab } from "./waste-tab";
import { SuppliersTab } from "./suppliers-tab";
import { PurchaseOrdersTab } from "./purchase-orders-tab";
import { SupplierMessagesTab } from "./supplier-messages-tab";

const TABS = [
  { id: "items", label: "Items" },
  { id: "transactions", label: "Transactions" },
  { id: "waste", label: "Waste" },
  { id: "suppliers", label: "Suppliers" },
  { id: "orders", label: "Purchase orders" },
  { id: "messages", label: "Supplier messages" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function isTab(v: string | null): v is TabId {
  return TABS.some((t) => t.id === v);
}

export function InventoryConsole() {
  const { orgId, setOrgId } = useSelectedOrg();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const rawTab = params.get("tab");
  const tab: TabId = isTab(rawTab) ? rawTab : "items";
  const supplierParam = params.get("supplier");

  const navigate = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      router.replace(`${pathname}${next.toString() ? `?${next}` : ""}`);
    },
    [params, pathname, router],
  );

  const setTab = (id: TabId) => navigate({ tab: id === "items" ? null : id, ...(id === "messages" ? {} : { supplier: null }) });
  const openMessages = (supplierId: string) => navigate({ tab: "messages", supplier: supplierId });
  const setSupplier = (id: string | null) => navigate({ supplier: id });

  return (
    <div>
      <PageHeader eyebrow="inventory" title="Inventory & suppliers">
        <OrgPicker orgId={orgId} onChange={setOrgId} />
      </PageHeader>

      <div className="mb-4 flex flex-wrap gap-1 border-b border-stone-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium ${tab === t.id ? "border-stone-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!orgId ? (
        <div className="rounded-[0.15rem] border border-dashed border-stone-300 bg-white px-4 py-12 text-center text-[13px] text-stone-500">
          Select an organization to view its inventory, suppliers and purchase orders.
        </div>
      ) : tab === "items" ? (
        <ItemsTab key={orgId} orgId={orgId} />
      ) : tab === "transactions" ? (
        <TransactionsTab key={orgId} orgId={orgId} />
      ) : tab === "waste" ? (
        <WasteTab key={orgId} orgId={orgId} />
      ) : tab === "suppliers" ? (
        <SuppliersTab key={orgId} orgId={orgId} onOpenMessages={openMessages} />
      ) : tab === "orders" ? (
        <PurchaseOrdersTab key={orgId} orgId={orgId} onOpenMessages={openMessages} />
      ) : (
        <SupplierMessagesTab key={orgId} orgId={orgId} supplierId={supplierParam} onSelectSupplier={setSupplier} />
      )}
    </div>
  );
}
