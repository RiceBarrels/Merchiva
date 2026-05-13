"use client";

import { PageHeader } from "@/components/page-header";
import { DesktopMerchivaDashboard, MobileMerchivaDashboard } from "@/components/merchiva-chat-dashboard";

export default function DashboardPage() {
  const subtitle = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <>
      {/* Desktop: Mr. Merchiva chat-forward dashboard */}
      <div className="hidden lg:block">
        <PageHeader title="Dashboard" subtitle={subtitle} />
        <DesktopMerchivaDashboard />
      </div>

      {/* Mobile: Mr. Merchiva dashboard */}
      <div className="lg:hidden">
        <PageHeader title="Dashboard" subtitle={subtitle} />
        <MobileMerchivaDashboard />
      </div>
    </>
  );
}
