// Icons and labels of the Drive sections and of the "Stored in apps" sources, shared by the
// nav column (drive-nav.tsx) and the phone section picker (section-select.tsx), so both list
// the same places in the same order with the same glyphs.

import {
  Bug,
  Clock,
  GraduationCap,
  HardDrive,
  LayoutGrid,
  ListChecks,
  MessageSquare,
  Package,
  Star,
  Store,
  Tag,
  Trash2,
  UserCircle,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { VirtualSourceMeta } from "@/components/drive/model/virtual-sources";
import type { DriveSection } from "@/components/drive/model/types";

export const SECTION_ICONS: Readonly<Record<DriveSection, LucideIcon>> = {
  my: HardDrive,
  store: Store,
  shared: Users,
  recent: Clock,
  starred: Star,
  trash: Trash2,
  apps: LayoutGrid,
  members: UsersRound,
};

export const SOURCE_ICONS: Readonly<Record<VirtualSourceMeta["icon"], LucideIcon>> = {
  MessageSquare,
  ListChecks,
  Package,
  GraduationCap,
  Tag,
  Bug,
  UserCircle,
};

/** i18n key of a section's name. */
export function sectionLabelKey(section: DriveSection): string {
  return `drive.nav.${section}`;
}

export interface SectionVisibility {
  /** The "everyone's files" view power: Members' files. */
  canViewAll: boolean;
  /** Documents shared with the person; "Shared with me" shows when there are some. */
  sharedCount: number;
  /** The section on screen always shows. */
  current: DriveSection;
}

/** The sections a person sees, in nav order. */
export function visibleSections({ canViewAll, sharedCount, current }: SectionVisibility): DriveSection[] {
  const out: DriveSection[] = ["my", "store"];
  if (sharedCount > 0 || current === "shared") out.push("shared");
  out.push("recent", "starred", "trash", "apps");
  if (canViewAll) out.push("members");
  return out;
}
