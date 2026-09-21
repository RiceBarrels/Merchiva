"use client";

import { PageHeader } from "@/components/page-header";
import { DesktopMerchivaDashboard, MobileMerchivaDashboard } from "@/components/merchiva-chat-dashboard";
import { useT } from "@/lib/i18n/context";
import { useDateFormat } from "@/lib/i18n/use-date-format";
import { useNow } from "@/lib/use-now";

export default function DashboardPage() {
  const t = useT();
  const formatDate = useDateFormat();
  // Reading the clock during render is impure, and the subtitle has to roll
  // over at midnight on a screen that stays open all day.
  const today = useNow(60_000);
  const subtitle = formatDate(today, { weekday: "long", month: "long", day: "numeric" });

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
