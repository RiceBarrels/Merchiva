"use client";

import { useEffect, useMemo } from "react";
import { useReducedMotion } from "motion/react";
import { currentEntry, useNavSections, useTab, useTabPresentation, useTabsSnapshot } from "@/lib/browser-shell";
import { useAuth, type AuthUser } from "@/lib/auth/context";
import { usePermissions } from "@/lib/context/permissions";
import { useI18n } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { useAiFocus } from "@/lib/merchiva/ai-focus";
import { colorForMember } from "@/lib/presence/colors";
import { locateAgentCursor, locatePersonCursor } from "@/lib/presence/dom";
import { presencePageKeyOf, stripRecordKey } from "@/lib/presence/path";
import {
  cursorSpotKey,
  livePeers,
  placeViewers,
  presenceNavKey,
  stackIndexes,
  viewersFromPeers,
  viewersFromTabs,
  type PresencePeer,
} from "@/lib/presence/rows";
import { noteServerStamp, publishNavViewers, useServerClockOffset } from "@/lib/presence/store";
import type { PagePresence } from "@/lib/spacetimedb/generated/types";
import { useMyConnectionId, usePagePresenceRows, useSpacetimeDB } from "@/lib/spacetimedb/hooks";
import { useNow } from "@/lib/use-now";
import { PresenceCursor, useMeasureTick } from "./presence-cursor";
import { useAgentPresence, usePersonPresence } from "./presence-tracker";

/** Row ages are re-checked this often, so a window that went away drops out without any row changing. */
const STALE_CHECK_MS = 5000;

interface AgentCursor {
  readonly key: string;
  readonly name: string;
  readonly route: string;
  readonly anchor: string;
  readonly seq: number;
  readonly tool: string;
}

function toPeer(row: PagePresence, myIdentity: string | null): PresencePeer {
  return {
    id: row.id,
    connectionId: row.connectionId,
    self: myIdentity !== null && row.identity.toHexString() === myIdentity,
    memberId: row.memberId,
    kind: row.kind,
    slot: row.slot,
    name: row.name,
    avatarUrl: row.avatarUrl,
    pagePath: row.pagePath,
    anchor: row.anchor,
    anchorX: row.anchorX,
    anchorY: row.anchorY,
    pointX: row.pointX,
    pointY: row.pointY,
    clickSeq: row.clickSeq,
    activity: row.activity,
    updatedAtMs: Number(row.updatedAt.toMillis()),
  };
}

/** This user as presence shows them: the server-derived name / avatar of their own rows, else the login. */
function selfProfile(peers: readonly PresencePeer[], myConnectionId: string | null, user: AuthUser | null) {
  const own = peers.find((p) => p.connectionId === myConnectionId) ?? peers.find((p) => p.self);
  if (own) return { name: own.name, avatarUrl: own.avatarUrl, memberId: own.memberId };
  const name = user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email : "";
  return { name, avatarUrl: "", memberId: "" };
}

/** "Checking inventory…" for a tool with a step label (merchiva.tools.*), else nothing. */
function activityLabel(t: (key: string) => string, tool: string): string {
  if (!tool) return "";
  const key = `merchiva.tools.${tool}.running`;
  const label = t(key);
  return label === key ? "" : label;
}

/**
 * Live presence on /manager, mounted once next to ShellContextMenu (app/manager/layout.tsx) — the
 * manager shell only, never the /store or /personal device surfaces. It
 *   - publishes this window: the tab on screen and its clicks, and its Mr. Merchiva cursors;
 *   - draws other people's cursors on the page this window shows, plus every Mr. Merchiva in the
 *     org — on the page when he works on it, otherwise on that page's sidebar row;
 *   - tells the nav badges (NavPresence) who is on which page, including this user's other tabs.
 *
 * The overlay is fixed at z-35: above the page and the sidebar (page chrome is 10/20, the mobile
 * page region 20), below the mobile Merchiva panel (40), the mobile chrome (46/48) and every dialog,
 * tooltip and popover (50+), so a cursor never covers something the user is working in. It is
 * pointer-events-none and aria-hidden: cursors are ambient, not controls.
 */
export function PresenceLayer() {
  const { organizationId } = usePermissions();
  const { user } = useAuth();
  const { t, dir } = useI18n();
  const rtl = dir === "rtl";
  const reducedMotion = useReducedMotion() ?? false;
  const [rows] = usePagePresenceRows(organizationId);
  const myConnectionId = useMyConnectionId();
  const { identity } = useSpacetimeDB();
  const myIdentity = identity ? identity.toHexString() : null;
  const snapshot = useTabsSnapshot();
  // The rendered tab: its page is the one in the DOM (the highlighted one may still be loading).
  const renderedTab = useTab(snapshot.activeTabId);
  const { url } = useTabPresentation(renderedTab);
  // With the record segment (/manager/docs/edit/~<hash>): cursors only mix within one document.
  const pagePath = useMemo(() => presencePageKeyOf(url), [url]);
  const pageKey = pagePath ? presenceNavKey(pagePath) : null;
  const focus = useAiFocus();
  const sections = useNavSections();
  const offsetMs = useServerClockOffset();
  const now = useNow(STALE_CHECK_MS);

  usePersonPresence(organizationId, pagePath, myConnectionId, rtl);
  useAgentPresence(focus, organizationId, myConnectionId);

  const peers = useMemo(() => rows.map((row) => toPeer(row, myIdentity)), [rows, myIdentity]);

  // Clock skew: the server just stamped this window's own row, so its age is ~0 on the server clock.
  const ownStamp = peers.find((p) => p.connectionId === myConnectionId && p.kind === "user")?.updatedAtMs ?? null;
  useEffect(() => {
    if (ownStamp !== null) noteServerStamp(ownStamp);
  }, [ownStamp]);

  const serverNow = now.getTime() + offsetMs;
  const live = useMemo(() => livePeers(peers, myConnectionId, serverNow), [peers, myConnectionId, serverNow]);
  const me = useMemo(() => selfProfile(peers, myConnectionId, user), [peers, myConnectionId, user]);

  // ── Nav badges: other people, this user's other windows, and this window's other tabs ──
  const highlightedId = snapshot.requestedTabId ?? snapshot.activeTabId;
  const otherTabUrls = useMemo(
    () => snapshot.tabs.filter((tab) => tab.id !== highlightedId).map((tab) => currentEntry(tab).url),
    [snapshot.tabs, highlightedId],
  );
  const viewers = useMemo(
    () => placeViewers([...viewersFromPeers(live), ...viewersFromTabs(otherTabUrls, me)], sections),
    [live, otherTabUrls, me, sections],
  );
  useEffect(() => {
    publishNavViewers(viewers);
  }, [viewers]);
  useEffect(() => () => publishNavViewers([]), []);

  // ── Cursors ──
  const people = useMemo(
    () => (pagePath ? live.filter((p) => p.kind === "user" && p.pagePath === pagePath) : []),
    [live, pagePath],
  );
  const agents = useMemo<AgentCursor[]>(
    () => [
      ...focus.map((f) => ({ key: `local:${f.scope}`, name: me.name, route: f.route, anchor: f.anchor, seq: f.seq, tool: f.tool })),
      ...live
        .filter((p) => p.kind === "agent")
        .map((p) => ({
          key: p.id,
          name: p.name,
          route: stripRecordKey(p.pagePath),
          anchor: p.anchor,
          seq: p.clickSeq,
          tool: p.activity,
        })),
    ],
    [focus, live, me.name],
  );
  const onPage = (route: string) => pageKey !== null && presenceNavKey(route) === pageKey;
  const stacks = stackIndexes([
    ...people.map(cursorSpotKey),
    ...agents.map((a) =>
      onPage(a.route) ? (a.anchor.startsWith("nav:") ? "page" : `agent|${a.anchor}`) : `nav|${presenceNavKey(a.route)}`,
    ),
  ]);

  const active = people.length > 0 || agents.length > 0;
  const tick = useMeasureTick(active, pagePath);
  if (!active) return null;

  return (
    <div aria-hidden dir={dir} data-presence="off" className="pointer-events-none fixed inset-0 z-[35] overflow-hidden">
      {people.map((peer, i) => (
        <PresenceCursor
          key={peer.id}
          tick={tick}
          locate={(cache) => locatePersonCursor(peer, rtl, cache)}
          stack={stacks[i]}
          label={peer.name}
          color={colorForMember(peer.memberId)}
          clickSeq={peer.clickSeq}
          reducedMotion={reducedMotion}
        />
      ))}
      {agents.map((agent, i) => (
        <PresenceCursor
          key={agent.key}
          tick={tick}
          locate={(cache) => locateAgentCursor(agent, onPage(agent.route), sections, rtl, cache)}
          stack={stacks[people.length + i]}
          label={fmt(t("merchiva.presence.cursorLabel"), { name: agent.name })}
          detail={activityLabel(t, agent.tool)}
          color={null}
          clickSeq={agent.seq}
          reducedMotion={reducedMotion}
        />
      ))}
    </div>
  );
}
