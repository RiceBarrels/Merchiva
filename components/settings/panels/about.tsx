"use client";

// Settings → About: app version and the static legal / support entries.
// Split out of app/manager/settings/page.tsx; it reads nothing from the page.

import { FileText, HelpCircle, Info, Shield } from "lucide-react";
import {
  DynamicUIElement,
  DynamicUIElementContent,
  DynamicUIElementDescription,
  DynamicUIElementHeader,
  DynamicUIElementTitle,
} from "@/components/ui/dynamic-ui-element";
import { SRow } from "@/components/settings/rows";
import { useT } from "@/lib/i18n/context";

export function AboutPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  return (
    <DynamicUIElement open={open} onOpenChange={onOpenChange}>
      <DynamicUIElementContent className="max-w-md lg:max-w-xl" noPadding>
        <DynamicUIElementHeader>
          <DynamicUIElementTitle mobileTitle={t("settings.groupAbout")}>{t("settings.groupAbout")}</DynamicUIElementTitle>
          <DynamicUIElementDescription className="hidden">{t("settings.groupAbout")}</DynamicUIElementDescription>
        </DynamicUIElementHeader>
        <div>
          <SRow
            icon={<Info className="h-4 w-4 text-foreground" />}
            title={t("settings.aboutAppName")}
            right={<span className="text-xs text-muted-foreground font-mono tabular-nums">{t("settings.appVersion")}</span>}
            isFirst
          />
          <SRow icon={<FileText className="h-4 w-4 text-foreground" />} title={t("settings.terms")} />
          <SRow icon={<Shield className="h-4 w-4 text-foreground" />} title={t("settings.privacy")} />
          <SRow icon={<HelpCircle className="h-4 w-4 text-foreground" />} title={t("settings.helpSupport")} />
        </div>
      </DynamicUIElementContent>
    </DynamicUIElement>
  );
}
