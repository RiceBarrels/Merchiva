"use client";

// Settings → Data: export and activity log entry points.
// Split out of app/manager/settings/page.tsx; it reads nothing from the page.

import { Activity, Download } from "lucide-react";
import {
  DynamicUIElement,
  DynamicUIElementContent,
  DynamicUIElementDescription,
  DynamicUIElementHeader,
  DynamicUIElementTitle,
} from "@/components/ui/dynamic-ui-element";
import { SRow } from "@/components/settings/rows";
import { useT } from "@/lib/i18n/context";

export function DataPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  return (
    <DynamicUIElement open={open} onOpenChange={onOpenChange}>
      <DynamicUIElementContent className="max-w-md lg:max-w-xl" noPadding>
        <DynamicUIElementHeader>
          <DynamicUIElementTitle mobileTitle={t("settings.groupData")}>{t("settings.groupData")}</DynamicUIElementTitle>
          <DynamicUIElementDescription className="hidden">{t("settings.groupData")}</DynamicUIElementDescription>
        </DynamicUIElementHeader>
        <div>
          <SRow
            icon={<Download className="h-4 w-4 text-foreground" />}
            title={t("settings.exportData")}
            meta={t("settings.downloadCSV")}
            isFirst
          />
          <SRow
            icon={<Activity className="h-4 w-4 text-foreground" />}
            title={t("settings.activityLog")}
            meta={t("settings.recentActivity")}
          />
        </div>
      </DynamicUIElementContent>
    </DynamicUIElement>
  );
}
