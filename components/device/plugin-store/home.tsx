"use client";

// The store's Discover view: a featured row, category chips, then one section
// per category. A search query replaces all of it with ranked results.

import { useMemo, useState } from "react";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { DeviceAppEntry } from "@/components/device/apps/app-store";
import { FEATURED_PLUGINS, PLUGIN_CATEGORIES, searchPlugins, type PluginCategory } from "@/lib/plugin-store";
import { useT } from "@/lib/i18n/context";
import { InstallButton, PluginIcon, PluginRow, Shot, type InstallControl } from "./parts";

type CategoryFilter = "all" | PluginCategory;

function FeaturedCard({ entry, categoryLabel, control, onSelect }: {
  entry: DeviceAppEntry;
  categoryLabel: string;
  control: InstallControl;
  onSelect: (entry: DeviceAppEntry) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(entry)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(entry); } }}
      className="w-[272px] shrink-0 cursor-pointer snap-start overflow-hidden rounded-[0.5rem] border border-border bg-card outline-none transition-colors hover:bg-muted/30 focus-visible:border-ring sm:w-[320px]"
    >
      <Shot entry={entry} n={1} className="w-full rounded-none border-0 border-b" />
      <div className="flex items-center gap-3 p-3">
        <PluginIcon entry={entry} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold tracking-tight">{entry.name}</p>
          <p className="truncate text-[12px] text-muted-foreground">{categoryLabel}</p>
        </div>
        <InstallButton entry={entry} control={control} />
      </div>
    </div>
  );
}

export function StoreHome({ entries, query, categoryLabel, control, onSelect }: {
  entries: DeviceAppEntry[];
  query: string;
  categoryLabel: (c: PluginCategory) => string;
  control: InstallControl;
  onSelect: (entry: DeviceAppEntry) => void;
}) {
  const t = useT();
  const [category, setCategory] = useState<CategoryFilter>("all");

  const results = useMemo(
    () => searchPlugins(entries.map((e) => ({ ...e, categoryLabel: categoryLabel(e.category) })), query),
    [entries, query, categoryLabel],
  );

  if (query.trim()) {
    if (results.length === 0) {
      return (
        <EmptyState
          icon={SearchX}
          title={t("device.pluginStore.noResults").replace("{q}", query.trim())}
          description={t("device.pluginStore.noResultsHint")}
        />
      );
    }
    return (
      <section className="space-y-2">
        <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground tabular-nums">
          {t("device.pluginStore.resultsCount").replace("{n}", String(results.length))}
        </p>
        <div>
          {results.map((e) => (
            <PluginRow key={e.id} entry={e} categoryLabel={e.categoryLabel} control={control} onSelect={onSelect} />
          ))}
        </div>
      </section>
    );
  }

  const optional = entries.filter((e) => !e.required);
  const featured = FEATURED_PLUGINS
    .map((id) => optional.find((e) => e.id === id))
    .filter((e): e is DeviceAppEntry => !!e);
  const present = PLUGIN_CATEGORIES.filter((c) => entries.some((e) => e.category === c));
  const shown = category === "all" ? present : present.filter((c) => c === category);

  return (
    <div className="space-y-8">
      {category === "all" && featured.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[20px] font-bold tracking-tight">{t("device.pluginStore.featured")}</h2>
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden">
            {featured.map((e) => (
              <FeaturedCard key={e.id} entry={e} categoryLabel={categoryLabel(e.category)} control={control} onSelect={onSelect} />
            ))}
          </div>
        </section>
      )}

      <SegmentedControl<CategoryFilter>
        variant="chips"
        size="sm"
        aria-label={t("device.pluginStore.categoriesLabel")}
        value={category}
        onChange={setCategory}
        options={[
          { value: "all", label: t("device.pluginStore.all") },
          ...present.map((c) => ({ value: c, label: categoryLabel(c) })),
        ]}
      />

      {shown.map((c) => {
        // Optional plugins first, built-in ones after: the store is for adding.
        const list = entries
          .filter((e) => e.category === c)
          .sort((a, b) => Number(a.required) - Number(b.required));
        return (
          <section key={c} className="space-y-1">
            <h2 className="text-[17px] font-bold tracking-tight">{categoryLabel(c)}</h2>
            <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
              {list.map((e) => (
                <PluginRow key={e.id} entry={e} categoryLabel={categoryLabel(e.category)} control={control} onSelect={onSelect} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
