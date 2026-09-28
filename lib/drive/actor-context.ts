"use client";

// Who Drive and Docs act for inside a device panel. The Drive actor provider
// (components/drive/drive-actor.tsx) mounts it around a lite app: on /store the
// member is the PIN operator, and `actingMemberId` names them on every write and
// signed-URL request; on /personal `actingMemberId` is ''. Without a provider
// (the /manager pages) the hooks use the signed-in member.
//
// No imports beyond React, so hooks and write wrappers can read it without
// pulling in UI code.

import { createContext, useContext } from "react";

export interface DriveActorOverride {
  /** The member the panel evaluates rights and lists for; null while unknown. */
  memberId: string | null;
  /** The operator on /store, '' elsewhere. */
  actingMemberId: string;
}

export const DriveActorOverrideContext = createContext<DriveActorOverride | null>(null);
DriveActorOverrideContext.displayName = "DriveActorOverrideContext";

/** The mounted override, or null (the signed-in member acts for themself). */
export function useDriveActorOverride(): DriveActorOverride | null {
  return useContext(DriveActorOverrideContext);
}
