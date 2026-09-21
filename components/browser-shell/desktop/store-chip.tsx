"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import {
  CreateStoreForm,
  MenuRow,
  StoreSwitchList,
  useWorkspaceActions,
} from "@/components/browser-shell/shared/workspace-menu";
import { StoreLogo } from "@/components/store-picker";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { STORE_CHIP_CLASS } from "./chrome-classes";
import { useDesktopChrome, useOverlayBackHandler } from "./chrome-context";

/*
 * Current-store chip at the start of the omnibox (desktop spec §4.6): logo (plus the name at
 * xl), opening the store list and the create-store form. Switching stores hard-reloads into
 * the target org's tabs (core prepareOrgSwitch + permissions.switchOrg).
 */
export function StoreChip() {
  const t = useT();
  const { storeChipOpen: open, setStoreChipOpen: setOpen } = useDesktopChrome();
  const [creating, setCreating] = useState(false);
  const workspace = useWorkspaceActions({ onDone: () => setOpen(false) });

  useOverlayBackHandler(open, () => setOpen(false));

  const org = workspace.currentOrg;
  if (!org) return null;

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setCreating(false);
        }}
      >
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label={fmt(t("browserDesktop.omnibox.storeChip"), { name: org.name })}
              className={STORE_CHIP_CLASS}
            />
          }
        >
          <StoreLogo name={org.name} logoUrl={org.logoUrl} className="h-4 w-4 rounded-sm [&_span]:text-[8px]" />
          <span className="hidden truncate xl:inline">{org.name}</span>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={8}
          aria-label={t("nav.selectStore")}
          className="max-h-[min(560px,80vh)] w-[300px] overflow-y-auto p-0"
        >
          <Eyebrow size="xs" className="px-3 pt-2.5 pb-1">
            {t("nav.selectStore")}
          </Eyebrow>
          <StoreSwitchList
            stores={workspace.stores}
            currentOrgId={org.id}
            onSelect={(orgId) => {
              workspace.switchOrg(orgId).catch((error: unknown) => console.error("[store-chip] switchOrg failed", error));
            }}
          />
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
        </PopoverContent>
      </Popover>
      <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
    </>
  );
}
