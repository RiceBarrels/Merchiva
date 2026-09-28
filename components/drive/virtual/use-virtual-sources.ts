"use client";

// "Stored in apps" for the person using Drive (drive-ui §9): which app sources they may see, how
// many files each holds and, for the source being viewed, its read-only entries.
//
// Every row hook runs on every render (hooks can't be conditional); the entries are built only
// while `enabledSource` is set, so the hook costs nothing on the other Drive views. Which
// sources show is ./visible-sources.ts's gate (the app's permission, its install state, and
// never chat on the shared tablet); which rows of a source they see is
// components/drive/model/virtual-sources.ts's rule.

import { useMemo } from "react";
import { useDriveActor } from "@/components/drive/drive-actor";
import type { VirtualEntry, VirtualSourceId } from "@/components/drive/model/types";
import { VIRTUAL_SOURCES, buildVirtualEntries, type VirtualInput, type VirtualSourceMeta } from "@/components/drive/model/virtual-sources";
import { usePermissions } from "@/lib/context/permissions";
import { useI18n } from "@/lib/i18n/context";
import {
  useBugReports,
  useChatConversations,
  useChatMembers,
  useChatMessages,
  useInventoryItems,
  useInventoryTransactions,
  useOrganizations,
  useOrgMembers,
  useRoleTaskAssignments,
  useRoleTasks,
  useSpacetimeDB,
  useTrainingObjectives,
  useUsers,
} from "@/lib/spacetimedb/hooks";
import { useDeviceApps } from "@/lib/spacetimedb/hooks/useDeviceApps";
import { visibleVirtualSources } from "./visible-sources";

export interface VirtualSourceSummary {
  meta: VirtualSourceMeta;
  count: number;
  /** When the newest file was added (epoch ms); null when there is none. */
  latest: number | null;
}

export interface UseVirtualSourcesOptions {
  /** A source: its entries (and every visible source's summary). "" or "summary": the summaries only. null: nothing is built. */
  enabledSource: VirtualSourceId | "" | "summary" | null;
}

export interface UseVirtualSourcesResult {
  /** The sources this person may see, in VIRTUAL_SOURCES order; empty while `enabledSource` is null. */
  sources: VirtualSourceSummary[];
  /** The enabled source's entries, newest first; empty unless a visible source is enabled. */
  entries: VirtualEntry[];
  /** The rows of every visible source, the member list and the app install state have arrived. */
  ready: boolean;
}

/** org_member.id as the module writes it into references: the Uuid's hyphenated string. */
function rowId(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function identityHex(value: unknown): string {
  const toHex = (value as { toHexString?: unknown } | null)?.toHexString;
  return typeof toHex === "function" ? String(toHex.call(value)).toLowerCase() : "";
}

const NO_SOURCES: VirtualSourceSummary[] = [];
const NO_ENTRIES: VirtualEntry[] = [];

export function useVirtualSources({ enabledSource }: UseVirtualSourcesOptions): UseVirtualSourcesResult {
  const { t, locale } = useI18n();
  const { can, organizationId } = usePermissions();
  const actor = useDriveActor();
  const { installed, isReady: appsReady } = useDeviceApps();
  const { identity } = useSpacetimeDB();
  const [memberRows, membersReady] = useOrgMembers();
  const [chatConversations, conversationsReady] = useChatConversations();
  const [chatMessages, messagesReady] = useChatMessages();
  const [chatMembers, chatMembersReady] = useChatMembers();
  const [roleTasks, roleTasksReady] = useRoleTasks();
  const [taskAssignments, assignmentsReady] = useRoleTaskAssignments();
  const [inventoryTransactions, transactionsReady] = useInventoryTransactions();
  const [inventoryItems, itemsReady] = useInventoryItems();
  const [trainingObjectives, objectivesReady] = useTrainingObjectives();
  const [bugReports, bugsReady] = useBugReports();
  const [organizations, organizationsReady] = useOrganizations();
  const [users, usersReady] = useUsers();

  const onStore = actor.surface === "store";
  // `can` is a new function on every render, so the gate is keyed by its result.
  const visibleKey = visibleVirtualSources({ can, installed, appsReady, onStore }).map((meta) => meta.id).join(",");
  const visible = useMemo(() => {
    const ids = new Set(visibleKey.split(","));
    return VIRTUAL_SOURCES.filter((meta) => ids.has(meta.id));
  }, [visibleKey]);

  const rowsReady: Readonly<Record<VirtualSourceId, boolean>> = {
    chat: conversationsReady && messagesReady && chatMembersReady,
    tasks: roleTasksReady && assignmentsReady,
    inventory: transactionsReady,
    training: objectivesReady,
    products: itemsReady,
    bugs: bugsReady,
    profile: organizationsReady && usersReady,
  };
  const ready = organizationId !== null && actor.ready && appsReady && membersReady && visible.every((meta) => rowsReady[meta.id]);

  const members = useMemo(
    () => memberRows
      .filter((row) => row.organizationId === organizationId)
      .map((row) => ({ id: rowId(row.id), userIdHex: identityHex(row.userId), name: row.displayName.trim() || row.email })),
    [memberRows, organizationId],
  );
  const labels = useMemo(
    () => ({
      untitledAttachment: t("drive.apps.untitledAttachment"),
      storeLogo: t("drive.apps.storeLogo"),
      profilePhoto: t("drive.apps.profilePhoto"),
      photoN: t("drive.apps.photoN"),
    }),
    [t],
  );
  const myIdentityHex = identity ? identity.toHexString().toLowerCase() : null;
  const enabled = enabledSource !== null && organizationId !== null;

  const bySource = useMemo(() => {
    const out = new Map<VirtualSourceId, VirtualEntry[]>();
    if (!enabled || organizationId === null) return out;
    const input: VirtualInput = {
      organizationId,
      actorMemberId: actor.memberId,
      canViewAll: actor.canViewAll,
      storeIdentity: onStore,
      identityHex: myIdentityHex,
      members,
      chatConversations,
      chatMessages,
      chatMembers,
      roleTasks,
      taskAssignments,
      inventoryTransactions,
      inventoryItems,
      trainingObjectives,
      bugReports,
      organizations,
      users,
      labels,
      locale,
    };
    for (const meta of visible) out.set(meta.id, buildVirtualEntries(meta.id, input));
    return out;
  }, [
    enabled, organizationId, actor.memberId, actor.canViewAll, onStore, myIdentityHex, members, visible, labels, locale,
    chatConversations, chatMessages, chatMembers, roleTasks, taskAssignments, inventoryTransactions, inventoryItems,
    trainingObjectives, bugReports, organizations, users,
  ]);

  const sources = useMemo((): VirtualSourceSummary[] => {
    if (!enabled) return NO_SOURCES;
    return visible.map((meta) => {
      const list = bySource.get(meta.id) ?? NO_ENTRIES;
      // Entries come newest first.
      const newest = list[0]?.updatedAt ?? 0;
      return { meta, count: list.length, latest: newest > 0 ? newest : null };
    });
  }, [enabled, visible, bySource]);

  const entries = enabledSource && enabledSource !== "summary" ? (bySource.get(enabledSource) ?? NO_ENTRIES) : NO_ENTRIES;
  return useMemo(() => ({ sources, entries, ready }), [sources, entries, ready]);
}
