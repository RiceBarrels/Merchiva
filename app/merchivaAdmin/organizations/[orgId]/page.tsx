import { Suspense } from "react";
import { OrganizationDetail } from "@/components/merchiva-admin/organizations/organization-detail";

export const dynamic = "force-dynamic";

export default async function MerchivaAdminOrganizationPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return (
    <Suspense fallback={<div className="text-[13px] text-stone-500">Loading…</div>}>
      <OrganizationDetail orgId={orgId} />
    </Suspense>
  );
}
