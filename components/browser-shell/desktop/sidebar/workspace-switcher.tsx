"use client";

import { useState } from "react";
import { ChevronsUpDown, LogOut, Plus, Settings, UserPlus } from "lucide-react";
import {
  AccountList,
  BackToDeviceLink,
  CreateStoreForm,
  MenuRow,
  StoreSwitchList,
  SwitchModeLink,
  useWorkspaceActions,
} from "@/components/browser-shell/shared/workspace-menu";
import { StoreLogo } from "@/components/store-picker";
import { Avatar } from "@/components/ui/avatar";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTabActions } from "@/lib/browser-shell";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { SIDEBAR_DRAWER_POPOVER_CLASS, SIDEBAR_DRAWER_SWITCHER_CLASS } from "../chrome-classes";
import { useOverlayBackHandler } from "../chrome-context";

/*
 * Combined store + account switcher at the top of the desktop sidebar (legacy sidebar.tsx
 * WorkspaceSwitcher / WorkspaceDropdown). It carries everything the toolbar profile menu had:
 * identity, the store list with create-store, accounts with add-account, Settings, back to the
 * store / personal device, switch mode, sign out and the version line. Every action closes the
 * popover first; store and account switches reload the page.
 *
 * Collapsed (icon rail) it shrinks to the store tile with a tooltip; the popover is identical.
 * In the phone drawer the trigger and the popover rows are touch-sized and the popover never
 * outgrows a 320px screen; Android back closes it like any other popup (lib/browser-shell/android-back.ts).
 */
export function SidebarWorkspaceSwitcher({ collapsed, drawer = false }: { collapsed: boolean; drawer?: boolean }) {
  const t = useT();
  const actions = useTabActions();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const close = () => {
    setOpen(false);
    setCreating(false);
  };
  const workspace = useWorkspaceActions({ onDone: close });

  useOverlayBackHandler(open, close);

  const user = workspace.user;
  const org = workspace.currentOrg;
  const displayName = user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email : "";
  const orgName = org?.name ?? t("nav.selectStore");
  const label = t("browserDesktop.toolbar.profile");
  const tooltip = user?.email ? `${orgName} · ${user.email}` : orgName;

  const trigger = collapsed ? (
    <Tooltip disabled={open}>
      <TooltipTrigger
        render={
          <PopoverTrigger
            render={
              <button
                type="button"
                aria-label={label}
                className="flex w-full items-center justify-center rounded px-2 py-1.5 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 data-popup-open:bg-muted dark:hover:bg-background dark:data-popup-open:bg-background"
              />
            }
          />
        }
      >
        <StoreLogo name={org?.name ?? ""} logoUrl={org?.logoUrl} className="h-6 w-6 text-[11px]" />
      </TooltipTrigger>
      <TooltipContent side="inline-end">{tooltip}</TooltipContent>
    </Tooltip>
  ) : (
    <PopoverTrigger
      render={
        <button
          type="button"
          aria-label={label}
          className={cn(
            "flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-start outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 data-popup-open:bg-muted dark:hover:bg-background dark:data-popup-open:bg-background",
            drawer && SIDEBAR_DRAWER_SWITCHER_CLASS,
          )}
        />
      }
    >
      <StoreLogo name={org?.name ?? ""} logoUrl={org?.logoUrl} className="h-7 w-7 text-[12px]" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 truncate text-[13px] font-medium text-foreground">{orgName}</span>
        </span>
        <span className="block truncate font-mono text-[11px] text-muted-foreground">{user?.email ?? ""}</span>
      </span>
      <ChevronsUpDown aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </PopoverTrigger>
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setCreating(false);
      }}
    >
      {trigger}
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        aria-label={label}
        className={cn("max-h-[min(640px,80vh)] w-[300px] overflow-y-auto p-0", drawer && SIDEBAR_DRAWER_POPOVER_CLASS)}
      >
        {user ? (
          <div className="flex items-center gap-3 border-b border-border px-3 py-3">
            <Avatar name={displayName} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-foreground">{displayName}</p>
              <p className="truncate font-mono text-[11px] text-muted-foreground">{user.email}</p>
            </div>
          </div>
        ) : null}

        <div className="pt-2">
          <Eyebrow size="xs" className="px-3 pb-1">
            {t("nav.selectStore")}
          </Eyebrow>
          <StoreSwitchList
            stores={workspace.stores}
            currentOrgId={org?.id ?? null}
            onSelect={(orgId) => {
              workspace
                .switchOrg(orgId)
                .catch((error: unknown) => console.error("[sidebar-workspace] switchOrg failed", error));
            }}
          />
        </div>
        <div className="border-t border-border py-1">
          {creating ? (
            <CreateStoreForm
              onCreate={workspace.createStore}
              onCancel={() => setCreating(false)}
            />
          ) : (
            <MenuRow icon={Plus} onClick={() => setCreating(true)}>
              {t("nav.createNewStore")}
            </MenuRow>
          )}
        </div>

        <div className="border-t border-border pt-2">
          <Eyebrow size="xs" className="px-3 pb-1">
            {t("accounts.title")}
          </Eyebrow>
          <AccountList accounts={workspace.accounts} currentUserId={user?.id ?? null} onSelect={workspace.switchAccount} />
          <div className="pb-1">
            <MenuRow icon={UserPlus} onClick={workspace.addAccount}>
              {t("accounts.addAccount")}
            </MenuRow>
          </div>
        </div>

        <div className="border-t border-border py-1">
          <MenuRow
            icon={Settings}
            onClick={() => {
              close();
              actions.openUrl("/manager/settings", "current");
            }}
          >
            {t("nav.settings")}
          </MenuRow>
        </div>

        <div className="border-t border-border py-1">
          <BackToDeviceLink onClick={close} />
          <SwitchModeLink onClick={close} />
        </div>

        <div className="border-t border-border py-1">
          <MenuRow icon={LogOut} onClick={workspace.signOut}>
            {t("common.signOut")}
          </MenuRow>
        </div>

        <p className="border-t border-border px-3 py-2 font-mono text-[10px] text-muted-foreground">
          {t("components.sidebar.version")}
        </p>
      </PopoverContent>
    </Popover>
  );
}
