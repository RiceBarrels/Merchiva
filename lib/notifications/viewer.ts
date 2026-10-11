"use client";

// Who is looking at this screen, for notifications. A store tablet is ONE
// identity (the account it is signed in with, usually the owner's or a
// manager's) used by everyone who logs in with a PIN, so its notifications are
// that account's, never the operator's. On a shared-identity surface nothing
// alerts, nothing acknowledges a push, no preference is written, and the dots
// (and their clearing) show only when the operator IS the tablet's account.
//
// Shared-identity surfaces: /store, and /manager in store-machine mode unless
// the PIN operator is the account itself — with another operator punched in (the
// channel page's `me.operatorRole != null`), and equally with nobody (logged out,
// the lock screen up, or nobody punched in yet): that screen is the counter's,
// not the account holder's. A store tablet or kiosk never holds a push
// subscription, whoever is logged in.

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useSpacetimeDB } from "spacetimedb/react";
import { useAppMode, type AppMode } from "@/lib/app-mode";
import { useOrgMembers } from "@/lib/spacetimedb/hooks";
import { useCurrentOperator } from "@/lib/store-device-lock";
import { useStoreMachineMode } from "@/lib/store-machine-mode";
import type { DotSurface } from "./dots";

export type NotificationSurface = DotSurface | "other";

export interface NotificationViewer {
  /** `other` = /choose, /manager/setup and anything else outside the three surfaces. */
  readonly surface: NotificationSurface;
  /** One identity serves several people here. */
  readonly shared: boolean;
  /** Dots render and clear for this screen. */
  readonly dotsVisible: boolean;
  /** Alerts (toast / OS / Tauri) and delivered-acks run here. */
  readonly alerts: boolean;
  /** This browser is a person's own device: push subscription and the identity / locale sync run here. */
  readonly personalDevice: boolean;
  /** The connection identity (hex), or null before it is known. */
  readonly accountHex: string | null;
}

export interface NotificationViewerInput {
  readonly pathname: string;
  readonly appMode: AppMode | null;
  /** Legacy store-machine flag (/manager kiosk). */
  readonly storeMachine: boolean;
  /** The PIN operator's identity (hex), null when nobody is punched in or unknown. */
  readonly operatorHex: string | null;
  readonly accountHex: string | null;
}

function surfaceOf(pathname: string): NotificationSurface {
  const under = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
  if (under("/store")) return "store";
  if (under("/personal")) return "personal";
  if (under("/manager") && !under("/manager/setup")) return "manager";
  return "other";
}

function viewerFor(surface: NotificationSurface, input: Omit<NotificationViewerInput, "pathname">): NotificationViewer {
  const operatorIsAccount = input.operatorHex !== null && input.operatorHex === input.accountHex;
  const shared = surface === "store" || (surface === "manager" && input.storeMachine && !operatorIsAccount);
  const dotsVisible = input.accountHex !== null && (surface === "store" ? operatorIsAccount : !shared);
  const alerts = !shared && (surface === "manager" || surface === "personal");
  // A store tablet or kiosk never holds anyone's push subscription, whichever page it is on.
  const personalDevice = !shared && input.appMode !== "store" && !input.storeMachine;
  return { surface, shared, dotsVisible, alerts, personalDevice, accountHex: input.accountHex };
}

/** The viewer for a screen. Pure. */
export function notificationViewer(input: NotificationViewerInput): NotificationViewer {
  return viewerFor(surfaceOf(input.pathname), input);
}

/** notificationViewer for this screen. */
export function useNotificationViewer(): NotificationViewer {
  const pathname = usePathname() ?? "";
  const [appMode] = useAppMode();
  const [storeMachine] = useStoreMachineMode();
  const operator = useCurrentOperator();
  const [members] = useOrgMembers();
  const stdb = useSpacetimeDB();
  const accountHex = stdb?.identity ? stdb.identity.toHexString() : null;
  const operatorMemberId = operator?.memberId ?? null;
  const operatorHex = useMemo(() => {
    if (!operatorMemberId) return null;
    const row = members.find((m) => m.id.toString() === operatorMemberId);
    return row ? row.userId.toHexString() : null;
  }, [members, operatorMemberId]);
  // Keyed on the surface, not the path: navigating inside /manager keeps the same viewer.
  const surface = surfaceOf(pathname);
  return useMemo(
    () => viewerFor(surface, { appMode, storeMachine, operatorHex, accountHex }),
    [surface, appMode, storeMachine, operatorHex, accountHex],
  );
}
