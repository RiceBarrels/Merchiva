"use client";

import { LogOut, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useThemeMode, type ThemeMode } from "@/lib/theme";
import { useAuth } from "@/lib/auth/context";
import { useT } from "@/lib/i18n/context";
import { hapticLight } from "@/lib/haptics";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
      <span className="text-[13px] font-medium">{label}</span>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function SettingsPanel({ name, email, orgName }: { name: string; email?: string | null; orgName: string }) {
  const t = useT();
  const [theme, setTheme] = useThemeMode();
  const { signOut } = useAuth();

  return (
    <div>
      <div className="border-b border-border px-4 py-3">
        <p className="text-[14px] font-semibold">{name}</p>
        <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{email ?? orgName}</p>
      </div>
      <Row label={t("personalDevice.settings.language")}>
        <LanguageSwitcher variant="inline" />
      </Row>
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
      <div className="space-y-2 p-4">
        <Button
          variant="outline"
          className="h-11 w-full justify-start gap-2"
          onClick={() => { hapticLight(); window.location.href = "/choose?switch=1"; }}
        >
          <MonitorSmartphone className="h-4 w-4" />{t("personalDevice.settings.switchMode")}
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
