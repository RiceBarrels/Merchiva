// The Drive lite app's screens (drive-ui §14.2): a stack of screens inside the device panel, the
// tabs of its home screen, and where a link the Docs, Sheets and Slides screens open lands in that
// stack. A panel has no URL of its own, so every "navigation" is a change of this stack.
//
// Pure (no React, no DOM). The router (lite-router.tsx) keeps the stack in state and renders its top.

import {
  VIRTUAL_SOURCE_IDS, type DriveDocKind, type DriveSection, type FolderEntry, type VirtualSourceId,
} from "@/components/drive/model/types";
import { parseEditorHref } from "@/lib/drive/hrefs";

/** The home screen's places: My files, Store, documents shared with me, and (admins) the team's files. */
export type LiteTab = "mine" | "store" | "shared" | "team";

export interface LiteHomeScreen {
  kind: "home";
  tab: LiteTab;
  /** The folder shown ('' = the tab's root). */
  folderId: string;
  /** Team: whose files ('' = the list of members). */
  memberId: string;
  /** The search typed on this screen (kept while a file or editor is on top of it). */
  q: string;
}

export type LiteDriveScreen =
  | LiteHomeScreen
  | { kind: "preview"; key: string }
  /** `isNew`: the document was just made here (its link carried `new=1`, which a panel has no URL to keep). */
  | { kind: "editor"; docKind: DriveDocKind; id: string; isNew?: boolean }
  | { kind: "apps"; source: VirtualSourceId | "" }
  | { kind: "trash" };

/** The Drive section each tab lists (components/drive/model/listing.ts). */
export const LITE_TAB_SECTION: Readonly<Record<LiteTab, DriveSection>> = {
  mine: "my",
  store: "store",
  shared: "shared",
  team: "members",
};

export const LITE_TAB_LABEL: Readonly<Record<LiteTab, string>> = {
  mine: "device.lite.drive.mine",
  store: "device.lite.drive.store",
  shared: "device.lite.drive.shared",
  team: "device.lite.drive.team",
};

export function homeScreen(tab: LiteTab, folderId = "", memberId = ""): LiteHomeScreen {
  return { kind: "home", tab, folderId, memberId, q: "" };
}

/** The home screen showing a folder's content, in the tab that holds it (another member's files are Team's). */
export function folderScreen(folder: Pick<FolderEntry, "id" | "location">, actorMemberId: string | null): LiteHomeScreen {
  const location = folder.location;
  if (location?.space === "store") return homeScreen("store", folder.id);
  if (location && location.ownerMemberId !== actorMemberId) return homeScreen("team", folder.id, location.ownerMemberId);
  return homeScreen("mine", folder.id);
}

export interface LiteTabInput {
  /** A store tablet signed in with an account that is neither owner nor manager (DriveActor.ceiling). */
  staffTablet: boolean;
  /** Documents shared with the person (Shared shows only when there are some). */
  sharedCount: number;
  /** The "everyone's files" power (Team). */
  canViewAll: boolean;
}

/**
 * The tabs of the home screen, at most four (LiteChoice). A staff-account tablet cannot reach anyone's My files, so
 * Mine and Team are left out there and Store comes first.
 */
export function liteTabs({ staffTablet, sharedCount, canViewAll }: LiteTabInput): LiteTab[] {
  const tabs: LiteTab[] = staffTablet ? ["store"] : ["mine", "store"];
  if (sharedCount > 0) tabs.push("shared");
  if (canViewAll && !staffTablet) tabs.push("team");
  return tabs;
}

/** The tab a home screen shows: its own when offered, else the first offered (Store on a staff-account tablet). */
export function effectiveTab(tab: LiteTab, tabs: readonly LiteTab[]): LiteTab {
  return tabs.includes(tab) ? tab : (tabs[0] ?? "store");
}

/** Identifies a screen for remounts and scroll resets; a typed search is not a new screen. */
export function screenKey(screen: LiteDriveScreen): string {
  switch (screen.kind) {
    case "home":
      return `home:${screen.tab}:${screen.folderId}:${screen.memberId}`;
    case "preview":
      return `preview:${screen.key}`;
    case "editor":
      return `editor:${screen.docKind}:${screen.id}`;
    case "apps":
      return `apps:${screen.source}`;
    case "trash":
      return "trash";
  }
}

/** The screen under the top one (where "Back" goes), or null on the first screen. */
export function screenBelow(stack: readonly LiteDriveScreen[]): LiteDriveScreen | null {
  return stack.length > 1 ? stack[stack.length - 2] : null;
}

/** `screen` on top; the stack as it is when that screen is on top already (so one Back always leaves it). */
export function pushScreen(stack: readonly LiteDriveScreen[], screen: LiteDriveScreen): LiteDriveScreen[] {
  const top = stack[stack.length - 1];
  return top && screenKey(top) === screenKey(screen) ? [...stack] : [...stack, screen];
}

/** The stack without its top screen; the first screen always stays. */
export function popScreen(stack: readonly LiteDriveScreen[]): LiteDriveScreen[] {
  return stack.length > 1 ? stack.slice(0, -1) : [...stack];
}

/**
 * Back from `screen` only while it is still on top: a write that resolves after the person has moved on never
 * takes away a screen they went to since.
 */
export function popScreenIfTop(stack: readonly LiteDriveScreen[], screen: LiteDriveScreen): LiteDriveScreen[] {
  const top = stack[stack.length - 1];
  return top && screenKey(top) === screenKey(screen) ? popScreen(stack) : [...stack];
}

/** Back to the last home screen (the one a file or editor was opened from); the first screen is one. */
export function popToHome(stack: readonly LiteDriveScreen[]): LiteDriveScreen[] {
  for (let index = stack.length - 1; index >= 0; index--) {
    if (stack[index].kind === "home") return stack.slice(0, index + 1);
  }
  return [homeScreen("mine")];
}

/** Replaces the top screen (a search typed, a tab kept). */
export function replaceTop(stack: readonly LiteDriveScreen[], screen: LiteDriveScreen): LiteDriveScreen[] {
  return stack.length > 0 ? [...stack.slice(0, -1), screen] : [screen];
}

/** Whether `url` opens a text document while the Docs app is not installed (the panel then says so and stays). */
export function blockedByDocs(url: string, docsInstalled: boolean): boolean {
  return !docsInstalled && parseEditorHref(url)?.kind === "doc";
}

/** Whether an editor link carries `new=1` (lib/drive/hrefs.ts documentFileHref with `isNew`). */
function linkIsNew(url: string): boolean {
  const query = url.split("#")[0].split("?")[1] ?? "";
  return new URLSearchParams(query).get("new") === "1";
}

/**
 * Where a link opened by a Docs, Sheets or Slides screen lands:
 * - an editor link opens that editor on top (the same document already on top stays; an editor on top that points
 *   elsewhere, such as a wrong-type notice's "Open", is replaced, so Back never returns to it); `new=1` marks the
 *   screen `isNew`, since a panel has no URL to keep it in;
 * - any other `/manager` link (Drive home, Docs home, the editors' Back) returns to the last home screen;
 * - anything else leaves the stack as it is (a device never leaves its panel).
 * The caller checks blockedByDocs first.
 */
export function openUrlInStack(stack: readonly LiteDriveScreen[], url: string): LiteDriveScreen[] {
  const target = parseEditorHref(url);
  if (target) {
    const top = stack[stack.length - 1];
    const editor: LiteDriveScreen = linkIsNew(url)
      ? { kind: "editor", docKind: target.kind, id: target.id, isNew: true }
      : { kind: "editor", docKind: target.kind, id: target.id };
    if (top?.kind === "editor") return top.id === target.id && top.docKind === target.kind ? [...stack] : replaceTop(stack, editor);
    return [...stack, editor];
  }
  if (typeof url === "string" && url.startsWith("/manager")) return popToHome(stack);
  return [...stack];
}

/** The virtual source a "v:<source>:<row>[:n]" preview key names; null for Drive rows. */
export function virtualSourceOfKey(key: string): VirtualSourceId | null {
  const source = /^v:([a-z]+):/.exec(key)?.[1];
  return VIRTUAL_SOURCE_IDS.find((id) => id === source) ?? null;
}
