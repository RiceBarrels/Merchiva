"use client";

// The open-source licenses list in a panel: opened from Settings → About (manager) and from the store and personal
// device settings panels, so no surface has to navigate to /licenses.

import { useEffect } from "react";
import {
  DynamicUIElement,
  DynamicUIElementContent,
  DynamicUIElementDescription,
  DynamicUIElementHeader,
  DynamicUIElementTitle,
} from "@/components/ui/dynamic-ui-element";
import { useT } from "@/lib/i18n/context";
import { LicensesList } from "./licenses-list";

export function LicensesPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();

  // The device settings panels live inside MiniAppShell, whose bubble-phase window Escape handler closes the whole
  // device app. Catch Escape first (capture phase) so it closes only this panel.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, onOpenChange]);

  return (
    <DynamicUIElement open={open} onOpenChange={onOpenChange}>
      <DynamicUIElementContent className="max-w-md max-h-[85vh] overflow-y-auto lg:max-w-xl">
        <DynamicUIElementHeader>
          <DynamicUIElementTitle mobileTitle={t("licenses.title")}>{t("licenses.title")}</DynamicUIElementTitle>
          <DynamicUIElementDescription>{t("licenses.intro")}</DynamicUIElementDescription>
        </DynamicUIElementHeader>
        <p className="text-sm text-muted-foreground sm:hidden">{t("licenses.intro")}</p>
        <LicensesList enabled={open} />
      </DynamicUIElementContent>
    </DynamicUIElement>
  );
}
