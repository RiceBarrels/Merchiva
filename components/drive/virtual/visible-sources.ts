// Which "Stored in apps" sources the person using Drive may see (drive-ui §9). A source shows
// when the person may view its app (`can(permission, "view")`, the PIN operator's permissions on
// /store), its app is installed for the store (known only once the install state has arrived),
// and it is not hidden on the shared tablet. Which rows of a visible source they see is
// components/drive/model/virtual-sources.ts's rule. Pure (no React).

import { VIRTUAL_SOURCES, type VirtualSourceMeta } from "@/components/drive/model/virtual-sources";
import { isManagerRouteEnabled } from "@/lib/device-apps";
import type { Permissions } from "@/lib/types";

export interface VirtualSourceGate {
  /** usePermissions().can. */
  can(section: keyof Permissions, action: "view"): boolean;
  /** The org's installed device apps (useDeviceApps().installed). */
  installed: ReadonlySet<string> | string[];
  /** The install state has arrived; until then every source that needs an app stays hidden. */
  appsReady: boolean;
  /** Drive is open on the shared store tablet (/store). */
  onStore: boolean;
}

/** The sources `gate` lets through, in VIRTUAL_SOURCES order. */
export function visibleVirtualSources({ can, installed, appsReady, onStore }: VirtualSourceGate): VirtualSourceMeta[] {
  return VIRTUAL_SOURCES.filter(({ requires }) =>
    (!requires.permission || can(requires.permission, "view"))
    && (!requires.appRoute || (appsReady && isManagerRouteEnabled(requires.appRoute, installed)))
    && !(requires.hideOnStore && onStore),
  );
}
