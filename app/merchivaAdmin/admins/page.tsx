import { getAdminSession } from "@/lib/merchiva-admin/session";
import { AdminsPanel } from "@/components/merchiva-admin/admins-panel";

export const dynamic = "force-dynamic";

export default async function MerchivaAdminAdminsPage() {
  const session = await getAdminSession();
  return (
    <div>
      <div className="font-mono text-[11px] uppercase tracking-wider text-stone-500">/ admins</div>
      <h1 className="mt-1 mb-5 font-sans text-[24px] font-semibold tracking-tight">Platform admins</h1>
      <AdminsPanel me={session?.username ?? ""} />
    </div>
  );
}
