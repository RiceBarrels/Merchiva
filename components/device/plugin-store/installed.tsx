"use client";

// The store's Installed view: the optional plugins this store added (each
// removable) and the built-in ones every device has.

import { PackageOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/loaders/geometric";
import type { DeviceAppEntry } from "@/components/device/apps/app-store";
import type { PluginCategory } from "@/lib/plugin-store";
import { useT } from "@/lib/i18n/context";
import { InstallButton, PluginRow, type InstallControl } from "./parts";

export function InstalledView({ entries, categoryLabel, control, onSelect, onRemove, onBrowse }: {
  entries: DeviceAppEntry[];
  categoryLabel: (c: PluginCategory) => string;
  control: InstallControl;
  onSelect: (entry: DeviceAppEntry) => void;
  onRemove: (entry: DeviceAppEntry) => void;
  onBrowse: () => void;
}) {
  const t = useT();
  const added = entries.filter((e) => !e.required && control.isInstalled(e.id));
  const builtIn = entries.filter((e) => e.required);

  return (
    <div className="space-y-8">
      <section className="space-y-1">
        <h2 className="text-[17px] font-bold tracking-tight">{t("device.pluginStore.addedByStore")}</h2>
        {added.length === 0 ? (
          <EmptyState
            icon={PackageOpen}
            description={t("device.pluginStore.noneInstalled")}
            action={<Button variant="outline" size="sm" onClick={onBrowse}>{t("device.pluginStore.browse")}</Button>}
          />
        ) : (
          <div>
            {added.map((e) => (
              <PluginRow
                key={e.id}
                entry={e}
                categoryLabel={categoryLabel(e.category)}
                control={control}
                onSelect={onSelect}
                trailing={
                  <div className="flex shrink-0 items-center gap-1">
                    <InstallButton entry={e} control={control} />
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={control.savingId === e.id}
                      onClick={(ev) => { ev.stopPropagation(); onRemove(e); }}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      {control.savingId === e.id ? <Spinner size={12} /> : t("device.appStore.remove")}
                    </Button>
                  </div>
                }
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-1">
        <h2 className="text-[17px] font-bold tracking-tight">{t("device.appStore.included")}</h2>
        <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          {builtIn.map((e) => (
            <PluginRow key={e.id} entry={e} categoryLabel={categoryLabel(e.category)} control={control} onSelect={onSelect} />
          ))}
        </div>
      </section>
    </div>
  );
}
