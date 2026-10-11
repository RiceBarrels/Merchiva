"use client";

import { useState } from "react";
import { Globe, Link2, LogOut, Plus, RefreshCw, Settings, Star, StarOff, UserPlus } from "lucide-react";
import {
  AccountList,
  BackToDeviceLink,
  CreateStoreForm,
  StoreSwitchList,
  SwitchModeLink,
  useWorkspaceActions,
} from "@/components/browser-shell/shared/workspace-menu";
import { StoreLogo } from "@/components/store-picker";
import { OptionRow } from "@/components/ui/option-row";
import { useBookmarks, usePageActions, useShellBackHandler, type TabUrl } from "@/lib/browser-shell";
import { buildShareUrl } from "@/lib/browser-shell/mobile/share";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/context";
import { copyLinkWithFeedback, toggleFavoriteWithFeedback } from "./share-drawer";
import { SheetRow, SheetSection, ShellDrawer } from "./shell-drawer";

export interface PageMenuSheetProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Canonical URL and title of the active tab. */
  pageUrl: TabUrl;
  pageTitle: string;
  isNewTab: boolean;
  /** Loads a URL in the active tab. */
  onNavigate(url: TabUrl): void;
}

type NestedSheet = "language";

/**
 * Store-logo page menu (mobile-safari spec §13): this page, store switcher and creation, accounts,
 * mode links, settings, language and reload. Full parity with the
 * legacy sidebar's workspace menu through the shared workspace-menu module (plan D24).
 */
export function PageMenuSheet({ open, onOpenChange, pageUrl, pageTitle, isNewTab, onNavigate }: PageMenuSheetProps) {
  const { t, locale, setLocale } = useI18n();
  const bookmarks = useBookmarks();
  const pageActions = usePageActions();
  const close = () => onOpenChange(false);
  const workspace = useWorkspaceActions({ onDone: close });

  const [creating, setCreating] = useState(false);
  const [nested, setNested] = useState<NestedSheet | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setCreating(false);
      setNested(null);
    }
  }

  useShellBackHandler(() => {
    setNested(null);
    return true;
  }, open && nested !== null);

  const bookmarked = !isNewTab && bookmarks.find(pageUrl) !== undefined;
  const currentOrg = workspace.currentOrg;

  return (
    <ShellDrawer open={open} onOpenChange={onOpenChange} title={t("browserMobile.pageMenu")}>
      <div className="flex items-center gap-3 px-4 pb-3">
        <StoreLogo name={currentOrg?.name ?? ""} logoUrl={currentOrg?.logoUrl} className="h-9 w-9" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-foreground">{currentOrg?.name ?? t("nav.selectStore")}</p>
          {workspace.user?.email && (
            <p className="truncate font-mono text-[11.5px] text-muted-foreground" dir="ltr">
              {workspace.user.email}
            </p>
          )}
        </div>
      </div>

      {(!isNewTab || pageActions.length > 0) && (
        <SheetSection label={t("browserMobile.thisPage")}>
          {!isNewTab && (
            <>
              <SheetRow
                icon={bookmarked ? StarOff : Star}
                onClick={() => {
                  close();
                  toggleFavoriteWithFeedback(bookmarks, pageUrl, pageTitle, t);
                }}
              >
                {t(bookmarked ? "browserMobile.removeFromFavorites" : "browserMobile.addToFavorites")}
              </SheetRow>
              <SheetRow
                icon={Link2}
                onClick={() => {
                  close();
                  copyLinkWithFeedback(buildShareUrl(pageUrl), t);
                }}
              >
                {t("browserMobile.copyLink")}
              </SheetRow>
            </>
          )}
          {pageActions.map((action) => (
            <SheetRow
              key={action.id}
              icon={action.icon}
              onClick={() => {
                close();
                action.onSelect();
              }}
            >
              {action.label}
            </SheetRow>
          ))}
        </SheetSection>
      )}

      <SheetSection label={t("browserMobile.store")}>
        <StoreSwitchList
          stores={workspace.stores}
          currentOrgId={currentOrg?.id ?? null}
          onSelect={(orgId) => {
            workspace.switchOrg(orgId).catch(() => undefined);
          }}
        />
        {creating ? (
          <CreateStoreForm
            onCreate={workspace.createStore}
            onCancel={() => setCreating(false)}
          />
        ) : (
          <SheetRow icon={Plus} onClick={() => setCreating(true)}>
            {t("nav.createNewStore")}
          </SheetRow>
        )}
      </SheetSection>

      <SheetSection label={t("accounts.title")}>
        <AccountList accounts={workspace.accounts} currentUserId={workspace.user?.id ?? null} onSelect={workspace.switchAccount} />
        <SheetRow icon={UserPlus} onClick={workspace.addAccount}>
          {t("accounts.addAccount")}
        </SheetRow>
        <SheetRow icon={LogOut} destructive onClick={workspace.signOut}>
          {t("common.signOut")}
        </SheetRow>
      </SheetSection>

      <SheetSection label={t("browserMobile.mode")}>
        <div className="py-1 [&_a]:min-h-[44px] [&_a]:px-4 [&_a]:text-[14px]">
          <BackToDeviceLink onClick={close} />
          <SwitchModeLink onClick={close} />
        </div>
      </SheetSection>

      <SheetSection label={t("browserMobile.app")}>
        <SheetRow
          icon={Settings}
          onClick={() => {
            close();
            onNavigate("/manager/settings");
          }}
        >
          {t("nav.settings")}
        </SheetRow>
        <SheetRow
          icon={Globe}
          onClick={() => setNested("language")}
          trailing={<span className="shrink-0 text-[12px] text-muted-foreground">{LOCALE_LABELS[locale]}</span>}
        >
          {t("common.language")}
        </SheetRow>
        <SheetRow icon={RefreshCw} onClick={() => window.location.reload()}>
          {t("browserMobile.reloadApp")}
        </SheetRow>
      </SheetSection>

      <p className="border-t border-border px-4 py-3 font-mono text-[10px] text-muted-foreground">{t("components.sidebar.version")}</p>

      <ShellDrawer
        nested
        open={open && nested === "language"}
        onOpenChange={(next) => {
          if (!next) setNested(null);
        }}
        title={t("common.language")}
      >
        <div role="radiogroup" aria-label={t("common.language")} className="space-y-1.5 px-3 pb-3">
          {LOCALES.map((option) => (
            <OptionRow
              key={option}
              selected={option === locale}
              title={LOCALE_LABELS[option]}
              onSelect={() => {
                setLocale(option);
                setNested(null);
              }}
            />
          ))}
        </div>
      </ShellDrawer>
    </ShellDrawer>
  );
}
