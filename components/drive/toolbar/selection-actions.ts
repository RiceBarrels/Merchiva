// The actions a Drive selection offers, shared by the selection bar, the results keyboard and the
// right-click menu of a selected entry, so the three never disagree: every action each selected
// entry allows (driveBulkActions), and offline nothing that writes — those would only end in a
// "not connected" error.

import { driveBulkActions, type DriveBulkAction } from "@/components/drive/model/actions";
import type { DriveEntry, DriveSection } from "@/components/drive/model/types";

const WRITES: ReadonlySet<DriveBulkAction> = new Set<DriveBulkAction>(["move", "trash", "restore", "deleteForever"]);

/** The bulk actions to offer: offline, nothing that writes. */
export function selectionActions(entries: readonly DriveEntry[], section: DriveSection, offline: boolean): DriveBulkAction[] {
  return driveBulkActions(entries, section).filter((action) => !(offline && WRITES.has(action)));
}
