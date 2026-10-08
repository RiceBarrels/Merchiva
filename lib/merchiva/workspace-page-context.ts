/*
 * Page-context builders for the workspace pages: Drive (its file list), the Docs editor, Channel, the New Tab page
 * and the dashboard. Same contract as data-page-context.ts: one short English sentence plus scalar
 * params for useMerchivaPageContext (lib/merchiva/page-context.ts), built only from what the page
 * shows. Pure; the hooks and components that call them sit next to each page.
 */

import type { MerchivaPageContext } from "@/lib/merchiva/page-context";
import { clip, count, pageContext, quoted, sentence, text } from "@/lib/merchiva/page-context-format";

// ── Docs ─────────────────────────────────────────────────────────────────────

const DRIVE_SPACE: Record<string, string> = {
  my: "My files",
  store: "Store files",
  shared: "shared with me",
  recent: "recent",
  starred: "starred",
  trash: "trash",
  apps: "stored in apps",
  members: "members' files",
};

const DRIVE_TYPE: Record<string, string> = {
  folder: "folders",
  doc: "documents",
  sheet: "spreadsheets",
  slides: "presentations",
  image: "images",
  pdf: "PDFs",
  video: "videos",
  audio: "audio",
  other: "other files",
};

export interface DriveHomePageState {
  space: string;
  /** The type filter ("" = every type). */
  type: string;
  /** The open folder's name, or null at the top of the space. */
  folder: string | null;
  search: string;
  /** Items listed on screen. */
  shown: number;
}

/** Drive's file list, including its documents view (/manager/docs redirects to `type: "doc"`). */
export function driveHomePageContext(s: DriveHomePageState): MerchivaPageContext {
  const search = text(s.search);
  const folder = s.folder === null ? "" : clip(s.folder) || "Untitled folder";
  return pageContext(
    sentence([
      `Drive, ${DRIVE_SPACE[s.space] ?? s.space}`,
      folder && `in folder ${quoted(folder)}`,
      s.type && `only ${DRIVE_TYPE[s.type] ?? s.type}`,
      search && `search ${quoted(search)}`,
      count(s.shown, "item") + " shown",
    ]),
    { space: s.space, type: s.type, folder, search, shown: s.shown },
  );
}

export type DocAccessLevel = "edit" | "comment" | "view";

export interface DocEditorPageState {
  docId: string;
  /** Set once the document loaded and this member may open it. */
  doc: { title: string; access: DocAccessLevel } | null;
  /** A saved version being viewed instead of the live document. */
  versionId: string | null;
}

export function docEditorPageContext(s: DocEditorPageState): MerchivaPageContext {
  if (!s.doc) {
    return pageContext("Docs editor, the document is loading or this member cannot open it.", { docId: s.docId });
  }
  const title = clip(s.doc.title) || "Untitled document";
  return pageContext(
    sentence([
      `Docs editor, document open: ${quoted(title)} (can ${s.doc.access})`,
      s.versionId && "viewing a saved version",
    ]),
    { docId: s.docId, docTitle: title, access: s.doc.access, versionId: s.versionId },
  );
}

// ── Channel ──────────────────────────────────────────────────────────────────

export interface ChannelPageState {
  conversations: number;
  open: { id: string; name: string; type: "direct" | "group"; members: number } | null;
}

export function channelPageContext(s: ChannelPageState): MerchivaPageContext {
  const open = s.open;
  const name = open ? clip(open.name) : "";
  return pageContext(
    sentence([
      `Channel (team chat), ${count(s.conversations, "conversation")}`,
      open &&
        (open.type === "group"
          ? `open: group chat ${quoted(name)} (${count(open.members, "member")})`
          : `open: direct messages with ${name}`),
    ]),
    {
      conversations: s.conversations,
      conversationId: open?.id,
      conversationName: name,
      conversationType: open?.type,
      members: open?.members,
    },
  );
}

// ── New Tab & dashboard ──────────────────────────────────────────────────────

export function newTabPageContext(search: string): MerchivaPageContext {
  const query = text(search);
  return pageContext(
    sentence([
      "New Tab page: app launcher, recent documents and recently closed tabs",
      query && `search ${quoted(query)}`,
    ]),
    { search: query },
  );
}

export function dashboardPageContext(today: string): MerchivaPageContext {
  return pageContext(
    `Dashboard for today ${today}: key numbers (revenue, orders, staff on shift, stock at risk), today's schedule and notifications.`,
    { today },
  );
}

// ── Forms ────────────────────────────────────────────────────────────────────

export interface FormsPageState {
  /** The list filter: active | drafts | closed | archived | toFill | mine. */
  view: string;
  /** Forms listed on screen. */
  shown: number;
  /** The open form's title on the edit page, or null on the list. */
  form: string | null;
  /** The edit page's tab: build | preview | responses | share ("" on the list). */
  tab: string;
}

/** The Forms list, or one form's edit page. Never answers: only titles and counts the page shows. */
export function formsPageContext(s: FormsPageState): MerchivaPageContext {
  const form = s.form === null ? "" : clip(s.form) || "Untitled form";
  return pageContext(
    sentence([
      form ? `Forms, editing ${quoted(form)}` : `Forms, ${s.view}`,
      form && s.tab && `${s.tab} tab`,
      !form && count(s.shown, "form") + " shown",
    ]),
    { view: s.view, shown: s.shown, form, tab: s.tab },
  );
}
