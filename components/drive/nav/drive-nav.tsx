"use client";

// The Drive nav column (lg and up): My files, Store, Shared with me (once something is shared
// or while it is open), Recent, Starred, Trash; then the apps whose stored files Drive lists
// ("Stored in apps"); then, for people with the "everyone's files" power, Members' files; the
// storage meter at the bottom. Rows are links, so Mod/middle-click open a section in a new
// tab. My files and Store accept dragged entries: dropping moves them to that root, when the
// move is allowed (the page's canDrop).

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Num } from "@/components/ui/num";
import { VIRTUAL_SOURCES } from "@/components/drive/model/virtual-sources";
import type { DriveMoveTarget, DriveSection, VirtualSourceId } from "@/components/drive/model/types";
import { driveHref } from "@/lib/drive/hrefs";
import type { DriveUsageView } from "@/lib/drive/types";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { useDriveDropTarget, type DriveDropHandlers } from "@/components/drive/list/use-entry-dnd";
import { SECTION_ICONS, SOURCE_ICONS, sectionLabelKey, visibleSections } from "./section-meta";
import { StorageMeter } from "./storage-meter";

export interface DriveNavSource {
  id: VirtualSourceId;
  /** Files the person can see in that app. */
  count: number;
}

export interface DriveNavProps {
  section: DriveSection;
  source: VirtualSourceId | "";
  /** The acting member (My files is theirs); null while it loads. */
  memberId: string | null;
  /** The "everyone's files" view power. */
  canViewAll: boolean;
  counts: { shared: number; trash: number };
  /** The visible "Stored in apps" sources (useVirtualSources, gated by permission and install state). */
  sources: readonly DriveNavSource[];
  usage: DriveUsageView | null;
  /** Moves dropped on My files / Store; null = no drops (offline, read-only). */
  drop?: DriveDropHandlers | null;
  className?: string;
}

const ROW_CLASS =
  "flex min-w-0 items-center gap-2.5 rounded px-2.5 py-1.5 text-[13px] font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

interface NavRowProps {
  href: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
  count?: number;
  target?: DriveMoveTarget | null;
  drop?: DriveDropHandlers | null;
}

function NavRow({ href, icon: Icon, label, active, count, target = null, drop = null }: NavRowProps) {
  const { isOver, handlers } = useDriveDropTarget(target, drop);
  return (
    <Link
      href={href}
      prefetch={false}
      aria-current={active ? "page" : undefined}
      data-over={isOver || undefined}
      {...handlers}
      className={cn(
        ROW_CLASS,
        active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        "data-over:ring-2 data-over:ring-ring/60",
      )}
    >
      <Icon aria-hidden className="h-[15px] w-[15px] shrink-0" />
      <span dir="auto" className="min-w-0 flex-1 truncate">
        {label}
      </span>
      {typeof count === "number" && count > 0 && <Num value={count} size="xs" muted className="shrink-0" />}
    </Link>
  );
}

export function DriveNav({ section, source, memberId, canViewAll, counts, sources, usage, drop = null, className }: DriveNavProps) {
  const t = useT();
  const sections = visibleSections({ canViewAll, sharedCount: counts.shared, current: section });
  const roots: Partial<Record<DriveSection, DriveMoveTarget | null>> = {
    my: memberId ? { space: "my", parentId: "", ownerMemberId: memberId } : null,
    store: { space: "store", parentId: "", ownerMemberId: "" },
  };
  const shown = new Set(sources.map((s) => s.id));
  const countOf = new Map(sources.map((s) => [s.id, s.count]));
  const appSources = VIRTUAL_SOURCES.filter((meta) => shown.has(meta.id));
  const mainSections = sections.filter((s) => s !== "apps" && s !== "members");

  return (
    <nav aria-label={t("drive.nav.label")} className={cn("flex min-h-0 flex-col gap-4", className)}>
      <div className="space-y-0.5">
        {mainSections.map((s) => (
          <NavRow
            key={s}
            href={driveHref({ space: s })}
            icon={SECTION_ICONS[s]}
            label={t(sectionLabelKey(s))}
            active={section === s}
            count={s === "trash" ? counts.trash : undefined}
            target={roots[s] ?? null}
            drop={drop}
          />
        ))}
      </div>

      {appSources.length > 0 && (
        <div className="space-y-0.5">
          <Eyebrow as="h3" className="px-2.5 pb-1">
            <Link
              href={driveHref({ space: "apps" })}
              prefetch={false}
              aria-current={section === "apps" && source === "" ? "page" : undefined}
              className="rounded outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:text-foreground"
            >
              {t("drive.nav.apps")}
            </Link>
          </Eyebrow>
          {appSources.map((meta) => (
            <NavRow
              key={meta.id}
              href={driveHref({ space: "apps", source: meta.id })}
              icon={SOURCE_ICONS[meta.icon]}
              label={t(meta.labelKey)}
              active={section === "apps" && source === meta.id}
              count={countOf.get(meta.id)}
            />
          ))}
        </div>
      )}

      {sections.includes("members") && (
        <div className="space-y-0.5">
          <Eyebrow as="h3" className="px-2.5 pb-1">
            {t("drive.nav.management")}
          </Eyebrow>
          <NavRow href={driveHref({ space: "members" })} icon={SECTION_ICONS.members} label={t("drive.nav.members")} active={section === "members"} />
        </div>
      )}

      <StorageMeter usage={usage} className="mt-auto px-2.5 pt-2" />
    </nav>
  );
}
