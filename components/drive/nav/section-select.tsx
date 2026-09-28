"use client";

// The Drive section picker below lg, where the nav column is hidden: the same sections, in the
// same order and with the same icons (section-meta.ts). The "Stored in apps" section lists its
// sources itself, so they are not repeated here.

import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DriveSection } from "@/components/drive/model/types";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { SECTION_ICONS, sectionLabelKey, visibleSections } from "./section-meta";

export interface DriveSectionSelectProps {
  section: DriveSection;
  /** The "everyone's files" view power: Members' files. */
  canViewAll: boolean;
  /** Documents shared with the person: "Shared with me" shows when there are some. */
  sharedCount: number;
  onSection(section: DriveSection): void;
  className?: string;
}

export function DriveSectionSelect({ section, canViewAll, sharedCount, onSection, className }: DriveSectionSelectProps) {
  const t = useT();
  const items = useMemo(
    () => visibleSections({ canViewAll, sharedCount, current: section }).map((value) => ({ value, label: t(sectionLabelKey(value)) })),
    [canViewAll, sharedCount, section, t],
  );
  const Icon = SECTION_ICONS[section];

  return (
    <Select
      items={items}
      value={section}
      onValueChange={(value) => {
        if (value && value !== section) onSection(value as DriveSection);
      }}
    >
      <SelectTrigger aria-label={t("drive.nav.label")} className={cn("min-w-0 text-[13px] font-medium", className)}>
        <Icon aria-hidden className="h-4 w-4 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => {
          const ItemIcon = SECTION_ICONS[item.value];
          return (
            <SelectItem key={item.value} value={item.value} className="text-[13px]">
              <ItemIcon aria-hidden className="h-4 w-4 text-muted-foreground" />
              {item.label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
