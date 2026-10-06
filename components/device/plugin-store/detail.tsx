"use client";

// One plugin's page: header with the action, a facts strip (category, where it
// runs, who can use it), screenshots and the description.

import { ArrowLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/loaders/geometric";
import type { DeviceAppEntry } from "@/components/device/apps/app-store";
import type { Permissions } from "@/lib/types";
import { useT } from "@/lib/i18n/context";
import { InstallButton, PluginIcon, SHOTS, Shot, SurfaceBadges, surfaceLabelKey, type InstallControl } from "./parts";

/** personnel.team.permissionSection uses camelCase for the one snake_case section. */
function permissionLabelKey(section: keyof Permissions): string {
  return `personnel.team.permissionSection.${section === "training_grading" ? "trainingGrading" : section}`;
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 flex-1 px-3 py-2 text-center first:ps-0 last:pe-0">
      <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 truncate text-[13px] font-semibold">{value}</div>
    </div>
  );
}

export function PluginDetail({ entry, categoryLabel, control, onBack, onRemove }: {
  entry: DeviceAppEntry;
  categoryLabel: string;
  control: InstallControl;
  onBack: () => void;
  onRemove: (entry: DeviceAppEntry) => void;
}) {
  const t = useT();
  const on = control.isInstalled(entry.id);
  const busy = control.savingId === entry.id;
  const who = entry.managerOnly
    ? t("device.pluginStore.managersOnly")
    : entry.permissionKey
      ? t("device.pluginStore.needsAccess").replace("{section}", t(permissionLabelKey(entry.permissionKey)))
      : t("device.pluginStore.everyone");

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack} className="-ms-2 gap-1 text-muted-foreground">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        {t("device.pluginStore.back")}
      </Button>

      <header className="flex items-start gap-4">
        <PluginIcon entry={entry} size="xl" />
        <div className="min-w-0 flex-1 pt-1">
          <h2 className="text-[22px] font-bold leading-tight tracking-tight">{entry.name}</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{categoryLabel}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <InstallButton entry={entry} control={control} />
            {on && !entry.required && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => onRemove(entry)} className="text-destructive hover:bg-destructive/10 hover:text-destructive">
                {busy ? <Spinner size={12} /> : t("device.appStore.remove")}
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="flex divide-x divide-border border-y border-border rtl:divide-x-reverse">
        <Fact label={t("device.pluginStore.category")} value={categoryLabel} />
        <Fact label={t("device.pluginStore.runsOn")} value={entry.surfaces.map((s) => t(surfaceLabelKey(s))).join(" · ")} />
        <Fact label={t("device.pluginStore.whoCanUse")} value={who} />
      </div>

      {entry.required && (
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Lock className="h-4 w-4 shrink-0" />
          {t("device.pluginStore.builtInNote")}
        </p>
      )}

      <section className="space-y-2">
        <h3 className="text-[17px] font-bold tracking-tight">{t("device.pluginStore.preview")}</h3>
        <div className="-mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden">
          {SHOTS.map((n) => <Shot key={n} entry={entry} n={n} className="w-[260px] sm:w-[320px]" />)}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-[17px] font-bold tracking-tight">{t("device.pluginStore.about")}</h3>
        <p className="text-[14px] leading-relaxed">{entry.description}</p>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{t("device.appStore.hint")}</p>
      </section>

      <section className="space-y-2">
        <h3 className="text-[17px] font-bold tracking-tight">{t("device.pluginStore.runsOn")}</h3>
        <SurfaceBadges surfaces={entry.surfaces} />
      </section>
    </div>
  );
}
