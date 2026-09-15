"use client";

import { PageHeader } from "@/components/page-header";
import { DesktopMerchivaDashboard, MobileMerchivaDashboard } from "@/components/merchiva-chat-dashboard";
import { useT } from "@/lib/i18n/context";

export default function DashboardPage() {
  const t = useT();
  const subtitle = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <>
      {/* Desktop: Mr. Merchiva chat-forward dashboard */}
      <div className="hidden lg:block">
        <PageHeader title={t("dashboard.title")} subtitle={subtitle} />
        <DesktopMerchivaDashboard />
      </div>

      {/* Mobile: Mr. Merchiva dashboard */}
      <div className="lg:hidden">
        <PageHeader title={t("dashboard.title")} subtitle={subtitle} />
        <div className="pt-4">
          <MobileMerchivaDashboard />
        </div>
      </div>
    </>
  );
}
