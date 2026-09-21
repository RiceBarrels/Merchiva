"use client";

// Settings → Preferences: navigation mode, theme, language, week start.
//
// Split out of app/manager/settings/page.tsx. Every preference here is read and
// written through its own hook, so the panel owns all of its state; the
// bookmarks-bar and nav-mode rows only apply to the shell they belong to.

import { useState } from "react";
import { Calendar, Languages, Moon, PanelLeft, PanelTop } from "lucide-react";
import {
  DynamicUIElement,
  DynamicUIElementContent,
  DynamicUIElementDescription,
  DynamicUIElementHeader,
  DynamicUIElementTitle,
} from "@/components/ui/dynamic-ui-element";
import { OptionRow } from "@/components/ui/option-row";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import { SRow } from "@/components/settings/rows";
import { useBookmarksBarVisible } from "@/components/browser-shell/desktop/bookmarks-bar-state";
import { useShellInfo } from "@/lib/browser-shell/shell-context";
import { hapticSuccess } from "@/lib/haptics";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n/config";
import { useI18n, useT } from "@/lib/i18n/context";
import { useNavMode, type NavMode } from "@/lib/nav-mode";
import { useThemeMode, type ThemeMode } from "@/lib/theme";

export function PreferencesPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const { locale, setLocale } = useI18n();
  const [themeMode, applyThemeMode] = useThemeMode();
  const [navMode, setNavMode] = useNavMode();
  const shellInfo = useShellInfo();
  const [barVisible, setBarVisible] = useBookmarksBarVisible();
  const [langDialogOpen, setLangDialogOpen] = useState(false);

  const themeLabel =
    themeMode === "system" ? t("settings.themeSystem")
      : themeMode === "light" ? t("settings.themeLight")
        : t("settings.themeDark");

  return (
    <DynamicUIElement open={open} onOpenChange={onOpenChange}>
      <DynamicUIElementContent className="max-w-md lg:max-w-xl" noPadding>
        <DynamicUIElementHeader>
          <DynamicUIElementTitle mobileTitle={t("settings.groupPreferences")}>{t("settings.groupPreferences")}</DynamicUIElementTitle>
          <DynamicUIElementDescription className="hidden">{t("settings.groupPreferences")}</DynamicUIElementDescription>
        </DynamicUIElementHeader>
        <div>
          {shellInfo?.layout === "desktop" && (
            <SRow
              icon={<PanelTop className="h-4 w-4 text-foreground" />}
              title={t("browserDesktop.bookmarks.showBar")}
              right={
                <Switch
                  size="sm"
                  aria-label={t("browserDesktop.bookmarks.showBar")}
                  checked={barVisible}
                  onCheckedChange={(v) => { hapticSuccess(); setBarVisible(v); }}
                />
              }
              isFirst
            />
          )}
          {!shellInfo && (
            <SRow
              icon={<PanelLeft className="h-4 w-4 text-foreground" />}
              title={t("settings.navigationMode")}
              meta={navMode === "sidebar" ? t("settings.sidebar") : t("settings.bottomBar")}
              right={
                <SegmentedControl
                  size="sm"
                  className="shrink-0"
                  aria-label={t("settings.navigationMode")}
                  value={navMode}
                  onChange={(mode) => { hapticSuccess(); setNavMode(mode); }}
                  options={[
                    { value: "sidebar" as NavMode, label: t("settings.side") },
                    { value: "bottombar" as NavMode, label: t("settings.tab") },
                  ]}
                />
              }
              isFirst
            />
          )}
          <SRow
            isFirst={shellInfo?.layout === "mobile"}
            icon={<Moon className="h-4 w-4 text-foreground" />}
            title={t("settings.darkMode")}
            meta={themeLabel}
            right={
              <SegmentedControl
                size="sm"
                className="shrink-0"
                aria-label={t("settings.darkMode")}
                value={themeMode}
                onChange={(mode) => { hapticSuccess(); applyThemeMode(mode); }}
                options={[
                  { value: "system" as ThemeMode, label: t("settings.themeSystem") },
                  { value: "light" as ThemeMode, label: t("settings.themeLight") },
                  { value: "dark" as ThemeMode, label: t("settings.themeDark") },
                ]}
              />
            }
          />
          <SRow
            icon={<Languages className="h-4 w-4 text-foreground" />}
            title={t("settings.language")}
            meta={LOCALE_LABELS[locale]}
            onClick={() => setLangDialogOpen(true)}
          />
          <DynamicUIElement open={langDialogOpen} onOpenChange={setLangDialogOpen}>
            <DynamicUIElementContent className="max-w-sm">
              <DynamicUIElementHeader>
                <DynamicUIElementTitle>{t("settings.language")}</DynamicUIElementTitle>
              </DynamicUIElementHeader>
              <div className="space-y-1 py-2">
                {LOCALES.map((loc) => (
                  <OptionRow
                    key={loc}
                    selected={locale === loc}
                    onSelect={() => { setLocale(loc); setLangDialogOpen(false); }}
                    className="py-2.5"
                    title={LOCALE_LABELS[loc]}
                    meta={<span className="text-xs font-mono text-muted-foreground">{loc}</span>}
                  />
                ))}
              </div>
            </DynamicUIElementContent>
          </DynamicUIElement>
          <SRow
            icon={<Calendar className="h-4 w-4 text-foreground" />}
            title={t("settings.weekStartsOn")}
            meta={t("settings.monday")}
          />
        </div>
      </DynamicUIElementContent>
    </DynamicUIElement>
  );
}
