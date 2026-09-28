"use client";

// Drive's data glue: the actor (drive-actor.tsx), their rows (useDrive), the store's members and
// this device's "last opened" times, built into the one entry tree every Drive screen — the
// manager page and the lite app — lists from (components/drive/model/entries.ts).
//
// Everything is the ACTOR's: rights, stars and pending uploads are evaluated for the person
// using Drive (the PIN operator on /store), with the tablet account's ceiling applied. The
// upload queue is not read here; screens pass the item ids this tab is uploading.

import { useMemo } from "react";
import { usePermissions } from "@/lib/context/permissions";
import { useLastOpenedMap } from "@/lib/docs/recent";
import { useOrgMembers } from "@/lib/spacetimedb/hooks";
import { useDrive, type UseDriveResult } from "@/lib/spacetimedb/hooks/useDrive";
import { useDriveActor, type DriveActor } from "./drive-actor";
import { buildDriveEntries, buildDriveTree, type BuildDriveEntriesInput, type DriveTree } from "./model/entries";
import type { ListingActor } from "./model/listing";

/** One store member, for owner names and the admins' "Members' files" list (summarizeMembers). */
export interface DriveMemberRef {
  id: string;
  name: string;
  role: string;
  active: boolean;
}

export interface UseDriveDataOptions {
  /** Items this tab is uploading right now (the upload queue's entries with an item id and a non-final state). */
  localUploadIds?: ReadonlySet<string>;
}

export interface DriveData {
  actor: DriveActor;
  drive: UseDriveResult;
  /** Every folder, file and document the actor can see, with the actor's access. */
  tree: DriveTree;
  /** The store's members, disabled ones included. */
  members: readonly DriveMemberRef[];
  memberNames: ReadonlyMap<string, string>;
  /** What listDriveEntries needs to know about the actor. */
  listingActor: ListingActor;
  /** Rows, the actor and the members have all arrived. */
  isReady: boolean;
}

const NO_UPLOADS: ReadonlySet<string> = new Set<string>();

/**
 * org_member.id as the module writes it into every reference (ownerMemberId, …): Uuid.toString(), hyphenated.
 * Not idString, which reads a Uuid through toHexString (no dashes).
 */
function memberRowId(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function useDriveData(opts: UseDriveDataOptions = {}): DriveData {
  const actor = useDriveActor();
  const drive = useDrive({ actorMemberId: actor.memberId });
  const { organizationId } = usePermissions();
  const [memberRows, membersReady] = useOrgMembers();
  const openedMap = useLastOpenedMap();

  // Callers usually rebuild the set every render: key it on its content.
  const uploadIdsKey = opts.localUploadIds ? [...opts.localUploadIds].sort().join(",") : "";
  const localUploadIds = useMemo(
    () => (uploadIdsKey === "" ? NO_UPLOADS : new Set(uploadIdsKey.split(","))),
    [uploadIdsKey],
  );

  const members = useMemo(() => {
    const out: DriveMemberRef[] = [];
    for (const row of memberRows) {
      if (row.organizationId !== organizationId) continue;
      out.push({
        id: memberRowId(row.id),
        name: row.displayName.trim() || row.email,
        role: row.role,
        active: row.status === "active",
      });
    }
    return out;
  }, [memberRows, organizationId]);

  const memberNames = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);

  // The actor's effective "everyone's files" power: on /store it already includes the tablet account's.
  const { canViewAll, canEditAll } = actor;
  const rows = useMemo(
    (): BuildDriveEntriesInput["drive"] => ({ ...drive, admin: { view: canViewAll, edit: canEditAll } }),
    [drive, canViewAll, canEditAll],
  );

  const { memberId, surface, acting, ceiling } = actor;
  const tree = useMemo(() => {
    const entries = buildDriveEntries({
      drive: rows,
      ceiling,
      actor: { memberId, surface, acting },
      memberNames,
      openedMap,
      localUploadIds,
    });
    return buildDriveTree(entries);
  }, [rows, ceiling, memberId, surface, acting, memberNames, openedMap, localUploadIds]);

  const listingActor = useMemo((): ListingActor => ({ memberId, canViewAll, canEditAll }), [memberId, canViewAll, canEditAll]);
  const isReady = drive.isReady && actor.ready && membersReady;

  return useMemo(
    () => ({ actor, drive, tree, members, memberNames, listingActor, isReady }),
    [actor, drive, tree, members, memberNames, listingActor, isReady],
  );
}
