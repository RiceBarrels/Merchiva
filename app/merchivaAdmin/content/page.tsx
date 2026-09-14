import { Suspense } from "react";
import { ContentConsole } from "@/components/merchiva-admin/content/content-console";

export const dynamic = "force-dynamic";

export default function MerchivaAdminContentPage() {
  return (
    <Suspense fallback={<div className="text-[13px] text-stone-500">Loading…</div>}>
      <ContentConsole />
    </Suspense>
  );
}
