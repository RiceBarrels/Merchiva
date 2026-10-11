"use client";

import { useState } from "react";
import { ChevronRight, LogOut } from "lucide-react";
import { StoreModeIcon } from "@/components/device/app-icons";
import { LicensesPanel } from "@/components/licenses/licenses-panel";
import { notificationEmailMeta, useNotificationEmailSwitch } from "@/components/settings/notification-email";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import { useThemeMode, type ThemeMode } from "@/lib/theme";
import { useAuth } from "@/lib/auth/context";
import { useI18n } from "@/lib/i18n/context";
import { LOCALE_LABELS } from "@/lib/i18n/config";
import { hapticLight } from "@/lib/haptics";
import { clearAppMode } from "@/lib/app-mode";
import { LanguagePage } from "./language-page";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
      <span className="text-[13px] font-medium">{label}</span>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function SettingsPanel({ name, email, orgName }: { name: string; email?: string | null; orgName: string }) {
  const { t, locale } = useI18n();
  const [theme, setTheme] = useThemeMode();
  const { signOut } = useAuth();
  const [licensesOpen, setLicensesOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const emailSwitch = useNotificationEmailSwitch();

  return (
    <div>
      <div className="border-b border-border px-4 py-3">
        <p className="text-[14px] font-semibold">{name}</p>
        <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{email ?? orgName}</p>
      </div>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 border-b border-border px-4 py-3 text-start transition-colors active:bg-muted/50"
        onClick={() => { hapticLight(); setLanguageOpen(true); }}
      >
        <span className="text-[13px] font-medium">{t("personalDevice.settings.language")}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
          <span className="truncate">{LOCALE_LABELS[locale]}</span>
          <ChevronRight className="h-4 w-4 shrink-0 rtl:rotate-180" />
        </span>
      </button>
      <LanguagePage open={languageOpen} onClose={() => setLanguageOpen(false)} />
      <Row label={t("personalDevice.settings.theme")}>
        <SegmentedControl<ThemeMode>
          value={theme}
          onChange={(v) => { hapticLight(); setTheme(v); }}
          options={[
            { value: "system", label: t("personalDevice.settings.themeSystem") },
            { value: "light", label: t("personalDevice.settings.themeLight") },
            { value: "dark", label: t("personalDevice.settings.themeDark") },
          ]}
        />
      </Row>
      {/* The account's own switch: /personal is one person's phone, never a shared screen. */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-medium">{t("notify.settings.email")}</p>
            <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{notificationEmailMeta(emailSwitch.checked, email, t)}</p>
          </div>
          <Switch
            checked={emailSwitch.checked}
            disabled={emailSwitch.disabled}
            aria-label={t("notify.settings.email")}
            onCheckedChange={() => { hapticLight(); emailSwitch.toggle(); }}
          />
        </div>
        <p className="mt-2 text-[12px] leading-snug text-muted-foreground">{t("notify.settings.liteSummary")}</p>
      </div>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 border-b border-border px-4 py-3 text-start transition-colors active:bg-muted/50"
        onClick={() => { hapticLight(); setLicensesOpen(true); }}
      >
        <span className="text-[13px] font-medium">{t("licenses.title")}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" />
      </button>
      <LicensesPanel open={licensesOpen} onOpenChange={setLicensesOpen} />
      <div className="space-y-2 p-4">
        <Button
          variant="outline"
          className="h-11 w-full justify-start gap-2"
          onClick={() => { hapticLight(); clearAppMode(); window.location.href = "/choose?switch=1"; }}
        >
          <StoreModeIcon className="h-5 w-5" />{t("personalDevice.settings.switchMode")}
        </Button>
        <Button
          variant="destructive"
          className="h-11 w-full justify-start gap-2"
          onClick={() => { hapticLight(); signOut(); }}
        >
          <LogOut className="h-4 w-4" />{t("common.signOut")}
        </Button>
      </div>
    </div>
  );
}
