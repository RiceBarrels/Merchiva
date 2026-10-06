"use client";

// The plugin store (/manager/apps). An owner, a manager or a member with
// settings edit turns optional Merchiva features on or off here; an installed
// plugin shows up in the manager back office, on the store tablet and on staff
// phones. Built-in plugins are listed too and can't be removed.
//
// Screenshots live in public/app-shots/<id>-1.png … -3.png (captured from the
// running app). Missing shots fall back to a tinted icon frame.

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/loaders/geometric";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useDeviceAppEntries, type DeviceAppEntry } from "@/components/device/apps/app-store";
import { useDeviceApps } from "@/lib/spacetimedb/hooks/useDeviceApps";
import type { PluginCategory } from "@/lib/plugin-store";
import { useT } from "@/lib/i18n/context";
import { PluginDetail } from "./detail";
import { StoreHome } from "./home";
import { InstalledView } from "./installed";
import type { InstallControl } from "./parts";

type Tab = "discover" | "installed";

export function PluginStore() {
  const t = useT();
  const router = useRouter();
  const entries = useDeviceAppEntries();
  const { isInstalled, setInstalled, savingId, isReady } = useDeviceApps();
  const [tab, setTab] = useState<Tab>("discover");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const categoryLabel = useCallback((c: PluginCategory) => t(`device.pluginStore.categories.${c}`), [t]);

  const toggle = useCallback(async (entry: DeviceAppEntry, on: boolean) => {
    try {
      await setInstalled(entry.id, on);
      toast.success(on ? t("device.appStore.added") : t("device.appStore.removed"));
    } catch {
      toast.error(t("device.appStore.failed"));
    }
  }, [setInstalled, t]);

  const control = useMemo<InstallControl>(() => ({
    isInstalled,
    savingId,
    install: (entry) => { void toggle(entry, true); },
    open: (entry) => { if (entry.route) router.push(entry.route); },
  }), [isInstalled, savingId, toggle, router]);

  const select = useCallback((entry: DeviceAppEntry) => {
    setSelectedId(entry.id);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }, []);
  const remove = useCallback((entry: DeviceAppEntry) => { void toggle(entry, false); }, [toggle]);

  const optional = entries.filter((e) => !e.required);
  const installedCount = optional.filter((e) => isInstalled(e.id)).length;
  const selected = selectedId ? entries.find((e) => e.id === selectedId) ?? null : null;

  return (
    <div className="pb-24">
      <PageHeader
        title={t("deviceApps.title")}
        subtitle={t("deviceApps.subtitle").replace("{n}", String(installedCount)).replace("{total}", String(optional.length))}
      />
      {!isReady ? (
        <div className="flex h-[40vh] items-center justify-center">
          <Spinner size={20} className="text-muted-foreground" />
        </div>
      ) : selected ? (
        <div className="mx-auto max-w-[900px] px-4 py-4 sm:px-6">
          <PluginDetail
            entry={selected}
            categoryLabel={categoryLabel(selected.category)}
            control={control}
            onBack={() => setSelectedId(null)}
            onRemove={remove}
          />
        </div>
      ) : (
        <div className="mx-auto max-w-[900px] space-y-6 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <InputGroup className="h-10 flex-1 bg-background">
              <InputGroupAddon>
                <Search aria-hidden />
              </InputGroupAddon>
              <InputGroupInput
                enterKeyHint="search"
                value={query}
                onChange={(e) => { setQuery(e.target.value); if (e.target.value.trim()) setTab("discover"); }}
                onKeyDown={(e) => { if (e.key === "Escape") setQuery(""); }}
                placeholder={t("device.pluginStore.searchPlaceholder")}
                aria-label={t("device.pluginStore.searchPlaceholder")}
              />
              {query && (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton size="icon-xs" onClick={() => setQuery("")} aria-label={t("device.pluginStore.clearSearch")}>
                    <X />
                  </InputGroupButton>
                </InputGroupAddon>
              )}
            </InputGroup>
            <SegmentedControl<Tab>
              value={tab}
              onChange={(v) => { setTab(v); setQuery(""); }}
              aria-label={t("deviceApps.title")}
              options={[
                { value: "discover", label: t("device.pluginStore.tabDiscover") },
                { value: "installed", label: t("device.pluginStore.tabInstalled"), count: installedCount },
              ]}
            />
          </div>

          {tab === "installed" && !query.trim() ? (
            <InstalledView
              entries={entries}
              categoryLabel={categoryLabel}
              control={control}
              onSelect={select}
              onRemove={remove}
              onBrowse={() => setTab("discover")}
            />
          ) : (
            <StoreHome entries={entries} query={query} categoryLabel={categoryLabel} control={control} onSelect={select} />
          )}
        </div>
      )}
    </div>
  );
}
