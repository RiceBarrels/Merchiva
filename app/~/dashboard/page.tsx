"use client";

import { PageHeader } from "@/components/page-header";
import { DesktopMerchivaDashboard, MobileMerchivaDashboard } from "@/components/merchiva-chat-dashboard";
import { MorningBriefingCard } from "@/components/morning-briefing-card";

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
        <div className="px-4 lg:px-6 pt-3">
          <MorningBriefingCard />
        </div>
        <DesktopMerchivaDashboard />
      </div>

      {/* Mobile: Mr. Merchiva dashboard */}
      <div className="lg:hidden">
        <PageHeader title="Dashboard" subtitle={subtitle} />
        <div className="px-4 pt-3">
          <MorningBriefingCard />
        </div>
        <MobileMerchivaDashboard />
      </div>
    </>
  );
}
