"use client";

// Device Apps — an App Store for the org. A manager (or anyone with settings
// edit) turns optional Merchiva features on or off here; an installed app
// shows up in the manager back office, on the store tablet and on staff
// phones. Required apps are listed at the bottom and can't be removed.
//
// Screenshots live in public/app-shots/<id>-1.png … -3.png (captured from
// the running app). Missing shots fall back to a tinted icon frame.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Lock, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Spinner } from "@/components/ui/loaders/geometric";
import { TILE_COLORS } from "@/components/device/apps-grid";
import { useDeviceAppEntries, type DeviceAppEntry, type DeviceSurface } from "@/components/device/apps/app-store";
import { useDeviceApps } from "@/lib/spacetimedb/hooks/useDeviceApps";
import { canManageDeviceApps } from "@/lib/device-apps";
import { usePermissions } from "@/lib/context/permissions";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

const SHOTS = [1, 2, 3] as const;

const TILE_BASE = "bg-gradient-to-b shadow-[inset_0_0_0_.5px_rgb(0_0_0/.06)] dark:from-[rgb(48_48_48)] dark:to-[rgb(30_30_30)]";

function AppIconTile({ entry, size }: { entry: DeviceAppEntry; size: "lg" | "sm" }) {
  const Icon = entry.icon;
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center",
        size === "lg" ? "h-16 w-16 rounded-[14px]" : "h-10 w-10 rounded-[9px]",
        TILE_BASE,
        TILE_COLORS[entry.color],
      )}
    >
      <Icon className={size === "lg" ? "h-10 w-10" : "h-6 w-6"} />
    </span>
  );
}

/** One screenshot frame; falls back to the app glyph when the file is missing. */
function Shot({ entry, n }: { entry: DeviceAppEntry; n: number }) {
  const [missing, setMissing] = useState(false);
  const Icon = entry.icon;
  return (
    <div className="relative aspect-[16/10] w-[260px] shrink-0 snap-start overflow-hidden rounded-[0.5rem] border border-border bg-muted sm:w-[300px]">
      {missing ? (
        <div className={cn("grid h-full w-full place-items-center bg-gradient-to-b", TILE_COLORS[entry.color])}>
          <Icon className="h-14 w-14 opacity-70" />
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/app-shots/${entry.id}-${n}.png`}
          alt=""
          loading="lazy"
          onError={() => setMissing(true)}
          className="h-full w-full object-cover object-top"
        />
      )}
    </div>
  );
}

function SurfaceBadges({ surfaces }: { surfaces: DeviceSurface[] }) {
  const t = useT();
  return (
    <span className="flex flex-wrap gap-1">
      {surfaces.map((s) => (
        <span key={s} className="rounded-[0.2rem] bg-muted px-1.5 py-px font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {t(s === "manager" ? "deviceApps.surfaceManager" : s === "store" ? "deviceApps.surfaceStore" : "deviceApps.surfacePersonal")}
        </span>
      ))}
    </span>
  );
}

function GetButton({ on, busy, onClick }: { on: boolean; busy: boolean; onClick: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 min-w-[80px] items-center justify-center gap-1 rounded-full px-4 text-[12px] font-bold uppercase tracking-wide transition-colors disabled:opacity-60",
        on ? "bg-muted text-foreground hover:bg-muted/70" : "bg-foreground text-background hover:bg-foreground/90",
      )}
    >
      {busy ? <Spinner size={12} /> : on ? (<><Check className="h-3.5 w-3.5" />{t("device.appStore.remove")}</>) : t("device.appStore.add")}
    </button>
  );
}

function StoreCard({ entry, on, busy, onToggle }: { entry: DeviceAppEntry; on: boolean; busy: boolean; onToggle: () => void }) {
  return (
    <article className="rounded-[0.5rem] border border-border bg-card">
      <div className="flex items-center gap-4 p-4">
        <AppIconTile entry={entry} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[16px] font-semibold tracking-tight">{entry.name}</h3>
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted-foreground">{entry.description}</p>
          <div className="mt-1.5"><SurfaceBadges surfaces={entry.surfaces} /></div>
        </div>
        <GetButton on={on} busy={busy} onClick={onToggle} />
      </div>
      <div className="flex snap-x gap-2.5 overflow-x-auto px-4 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SHOTS.map((n) => <Shot key={n} entry={entry} n={n} />)}
      </div>
    </article>
  );
}

export default function DeviceAppsPage() {
  const t = useT();
  const router = useRouter();
  const { role, permissions } = usePermissions();
  const allowed = canManageDeviceApps(role, permissions);
  const entries = useDeviceAppEntries();
  const { isInstalled, setInstalled, savingId, isReady } = useDeviceApps();

  useEffect(() => {
    if (!allowed) router.replace("/manager/");
  }, [allowed, router]);

  if (!allowed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <ShieldAlert className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t("components.permissionGuard.noAccess")}</p>
      </div>
    );
  }

  const optional = entries.filter((e) => !e.required);
  const included = entries.filter((e) => e.required);
  const installedCount = optional.filter((e) => isInstalled(e.id)).length;

  const toggle = async (id: string, on: boolean) => {
    try {
      await setInstalled(id, on);
      toast.success(on ? t("device.appStore.added") : t("device.appStore.removed"));
    } catch {
      toast.error(t("device.appStore.failed"));
    }
  };

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
      ) : (
        <div className="mx-auto max-w-[900px] space-y-8 px-4 py-5 sm:px-6">
          <p className="text-[13px] leading-relaxed text-muted-foreground">{t("device.appStore.hint")}</p>

          <section className="space-y-3">
            <h2 className="text-[20px] font-bold tracking-tight">{t("device.appStore.available")}</h2>
            <div className="space-y-4">
              {optional.map((e) => (
                <StoreCard key={e.id} entry={e} on={isInstalled(e.id)} busy={savingId === e.id} onToggle={() => toggle(e.id, !isInstalled(e.id))} />
              ))}
              {optional.length === 0 && <p className="text-[13px] text-muted-foreground">{t("device.appStore.empty")}</p>}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-[20px] font-bold tracking-tight">{t("device.appStore.included")}</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {included.map((e) => (
                <div key={e.id} className="flex items-center gap-3 rounded-[0.5rem] border border-border bg-card p-3">
                  <AppIconTile entry={e} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold">{e.name}</p>
                    <p className="truncate text-[12px] text-muted-foreground">{e.description}</p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-muted-foreground">
                    <Lock className="h-3.5 w-3.5" />
                    {t("device.appStore.alwaysOn")}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
