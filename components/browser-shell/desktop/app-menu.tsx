"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  Bookmark,
  EllipsisVertical,
  FilePlus,
  History,
  Languages,
  Plus,
  Settings,
  Star,
  SunMoon,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { clearManagerOverride, useAppMode } from "@/lib/app-mode";
import {
  getRouteAccess,
  useAccessContext,
  useActiveTab,
  useBookmarks,
  useShortcutLabel,
  useTabActions,
  useTabPresentation,
  useTabsSnapshot,
} from "@/lib/browser-shell";
import { DOCS_HOME_HREF, documentHref } from "@/lib/docs/hrefs";
import { LOCALES, LOCALE_LABELS, isLocale } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/context";
import { createDocument } from "@/lib/spacetimedb/actions";
import { useThemeMode, type ThemeMode } from "@/lib/theme";
import { useBookmarksBarVisible } from "./bookmarks-bar-state";
import { TOOLBAR_BUTTON_CLASS } from "./chrome-classes";
import { useDesktopChrome, useOverlayBackHandler } from "./chrome-context";
import { useAnnounce } from "./shell-live-region";
import { reportOpenResult } from "./tab-describe";

/*
 * App menu ⋮ (desktop spec §6.5): new tab / document, reopen closed tab, bookmarks,
 * settings, language, appearance, switch mode and back to the store / personal device.
 */

const THEME_MODES: readonly ThemeMode[] = ["system", "light", "dark"];

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

export function AppMenu() {
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();
  const chrome = useDesktopChrome();
  const actions = useTabActions();
  const announce = useAnnounce();
  const snapshot = useTabsSnapshot();
  const ctx = useAccessContext();
  const bookmarks = useBookmarks();
  const activeTab = useActiveTab();
  const presentation = useTabPresentation(activeTab);
  const [appMode] = useAppMode();
  const [themeMode, applyThemeMode] = useThemeMode();
  const [barVisible, setBarVisible] = useBookmarksBarVisible();
  const [open, setOpen] = useState(false);
  const newTabShortcut = useShortcutLabel("newTab");
  const reopenShortcut = useShortcutLabel("reopenClosedTab");
  const toggleBarShortcut = useShortcutLabel("toggleBookmarksBar");

  useOverlayBackHandler(open, () => setOpen(false));

  const docsAllowed = getRouteAccess(DOCS_HOME_HREF, ctx) === "allowed";
  const deviceMode = appMode === "store" || appMode === "personal" ? appMode : null;
  const label = t("browserDesktop.toolbar.menu");
  const toastMessage = (message: string) => toast(message);

  const newDocument = () => {
    // Seeded with one empty paragraph so concurrent first edits share it (lib/docs/blank-state.ts).
    import("@/lib/docs/blank-state")
      .then(({ blankDocumentInput }) => createDocument(blankDocumentInput()))
      .then((documentId) => actions.openUrl(documentHref(documentId, { isNew: true }), "new-foreground"))
      .catch((error: unknown) => {
        console.error("[app-menu] createDocument failed", error);
        toast.error(t("browserDesktop.errors.createDocument"));
      });
  };

  const bookmarkThisTab = () => {
    const existing = bookmarks.find(presentation.url);
    const bookmark = existing ?? bookmarks.add(presentation.url, presentation.title);
    // Open after the menu has closed and returned focus to its trigger.
    window.requestAnimationFrame(() => chrome.openBookmarkStar(existing === undefined, bookmark.id));
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip disabled={open}>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label={label} className={TOOLBAR_BUTTON_CLASS} />}
            />
          }
        >
          <EllipsisVertical className="h-4 w-4" />
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-64">
        <DropdownMenuItem onClick={() => reportOpenResult(actions.openNewTabPage(), t, toastMessage)}>
          <Plus />
          {t("browser.actions.newTab")}
          {newTabShortcut ? <DropdownMenuShortcut>{newTabShortcut}</DropdownMenuShortcut> : null}
        </DropdownMenuItem>
        {docsAllowed ? (
          <DropdownMenuItem onClick={newDocument}>
            <FilePlus />
            {t("browserDesktop.actions.newDocument")}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          disabled={snapshot.closed.length === 0}
          onClick={() => {
            if (reportOpenResult(actions.reopenClosedTab(), t, toastMessage)) announce(t("browserDesktop.tabs.reopened"));
          }}
        >
          <History />
          {t("browser.actions.reopenClosedTab")}
          {reopenShortcut ? <DropdownMenuShortcut>{reopenShortcut}</DropdownMenuShortcut> : null}
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Bookmark />
            {t("browserDesktop.menu.bookmarks")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-56">
            <DropdownMenuCheckboxItem checked={barVisible} onCheckedChange={(checked) => setBarVisible(checked)}>
              {t("browserDesktop.bookmarks.showBar")}
              {toggleBarShortcut ? <DropdownMenuShortcut>{toggleBarShortcut}</DropdownMenuShortcut> : null}
            </DropdownMenuCheckboxItem>
            <DropdownMenuItem disabled={presentation.isNewTab} onClick={bookmarkThisTab}>
              <Star />
              {t("browserDesktop.actions.bookmarkPage")}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => actions.openUrl("/manager/settings", "current")}>
          <Settings />
          {t("nav.settings")}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Languages />
            {t("common.language")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-48">
            <DropdownMenuRadioGroup
              value={locale}
              onValueChange={(value: unknown) => {
                if (typeof value === "string" && isLocale(value)) setLocale(value);
              }}
            >
              {LOCALES.map((code) => (
                <DropdownMenuRadioItem key={code} value={code}>
                  <span lang={code}>{LOCALE_LABELS[code]}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <SunMoon />
            {t("browserDesktop.menu.appearance")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-40">
            <DropdownMenuRadioGroup
              value={themeMode}
              onValueChange={(value: unknown) => {
                if (isThemeMode(value)) applyThemeMode(value);
              }}
            >
              {THEME_MODES.map((mode) => (
                <DropdownMenuRadioItem key={mode} value={mode}>
                  {mode === "system" ? t("settings.themeSystem") : mode === "light" ? t("settings.themeLight") : t("settings.themeDark")}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/choose?switch=1")}>
          <ArrowLeftRight />
          {t("chooseMode.switchMode")}
        </DropdownMenuItem>
        {deviceMode ? (
          <DropdownMenuItem
            onClick={() => {
              clearManagerOverride();
              router.push(deviceMode === "store" ? "/store" : "/personal");
            }}
          >
            <Undo2 />
            {deviceMode === "store" ? t("chooseMode.backToStore") : t("chooseMode.backToPersonal")}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
