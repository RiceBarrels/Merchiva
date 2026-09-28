"use client";

// "From other apps" in the Drive lite app (drive-ui §9, §14.4): the photos and files other Merchiva apps keep as
// links, read-only. First the apps with how many files each keeps, then one app's files, newest first; a file
// opens its preview. Which apps show is useVirtualSources' rule (the app's permission and install state, never
// chat on the shared store tablet, and the profile photo only on the person's own phone).

import { ChevronLeft, LayoutGrid } from "lucide-react";
import { LiteEmpty, LiteLoading, LiteRow, LiteScreen } from "@/components/device/apps/lite";
import { useMinuteClock } from "@/components/docs/home/format";
import { countKey } from "@/components/drive/model/plural";
import { SOURCE_ICONS } from "@/components/drive/nav/section-meta";
import { entryLabel } from "@/components/drive/preview/preview-mode";
import { useVirtualSources } from "@/components/drive/virtual/use-virtual-sources";
import { useI18n } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { useLiteDriveContext } from "./lite-context";
import { LiteEntryRow } from "./lite-entry-row";
import { liteEntrySub } from "./lite-labels";
import type { LiteDriveScreen } from "./lite-state";

export function LiteApps({ screen }: { screen: Extract<LiteDriveScreen, { kind: "apps" }> }) {
  const { t, locale } = useI18n();
  const { nav, panels, openEntry } = useLiteDriveContext();
  const now = useMinuteClock();
  const virtual = useVirtualSources({ enabledSource: screen.source === "" ? "summary" : screen.source });
  const meta = screen.source === "" ? null : (virtual.sources.find((s) => s.meta.id === screen.source)?.meta ?? null);

  const back = (
    <LiteRow
      icon={ChevronLeft}
      title={meta ? t(meta.labelKey) : t("device.lite.drive.fromApps")}
      onClick={nav.pop}
    />
  );

  if (!virtual.ready) {
    return (
      <LiteScreen>
        {back}
        <LiteLoading />
      </LiteScreen>
    );
  }

  if (screen.source === "") {
    return (
      <LiteScreen>
        {back}
        <p className="text-[13px] leading-snug text-muted-foreground">{t("drive.apps.readOnly")}</p>
        {virtual.sources.length === 0 ? (
          <LiteEmpty icon={LayoutGrid} title={t("drive.apps.empty")} />
        ) : (
          <div data-lite-list="apps" className="flex flex-col gap-2">
            {virtual.sources.map((source) => (
              <LiteRow
                key={source.meta.id}
                icon={SOURCE_ICONS[source.meta.icon]}
                title={t(source.meta.labelKey)}
                sub={fmt(t(countKey("drive.apps.count", source.count)), { count: source.count })}
                chevron
                onClick={() => nav.push({ kind: "apps", source: source.meta.id })}
              />
            ))}
          </div>
        )}
      </LiteScreen>
    );
  }

  return (
    <LiteScreen>
      {back}
      {!meta ? (
        <LiteEmpty icon={LayoutGrid} title={t("drive.apps.unavailable")} />
      ) : virtual.entries.length === 0 ? (
        <LiteEmpty icon={SOURCE_ICONS[meta.icon]} title={t("drive.apps.empty")} />
      ) : (
        <div data-lite-list="app-files" className="flex flex-col gap-2">
          {virtual.entries.map((entry) => (
            <LiteEntryRow
              key={entry.key}
              entry={entry}
              title={entryLabel(entry, t)}
              sub={liteEntrySub(entry, { t, locale, now })}
              onOpen={() => openEntry(entry)}
              onMore={() => panels.openActions(entry)}
              moreLabel={t("device.lite.drive.actions")}
            />
          ))}
        </div>
      )}
    </LiteScreen>
  );
}
