import { Suspense } from "react";
import { OrganizationsList } from "@/components/merchiva-admin/organizations/organizations-list";

export const dynamic = "force-dynamic";

export default function MerchivaAdminOrganizationsPage() {
  return (
    <Suspense fallback={<div className="text-[13px] text-stone-500">Loading…</div>}>
      <OrganizationsList />
    </Suspense>
  );
}
