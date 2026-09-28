/*
 * Page-context builders for the workspace pages: Docs (home and editor), Channel, the New Tab page
 * and the dashboard. Same contract as data-page-context.ts: one short English sentence plus scalar
 * params for useMerchivaPageContext (lib/merchiva/page-context.ts), built only from what the page
 * shows. Pure; the hooks and components that call them sit next to each page.
 */

import type { MerchivaPageContext } from "@/lib/merchiva/page-context";
import { clip, count, pageContext, quoted, sentence, text } from "@/lib/merchiva/page-context-format";

// ── Docs ─────────────────────────────────────────────────────────────────────

const DOC_SCOPE: Record<string, string> = {
  recent: "recent documents",
  starred: "starred documents",
  trash: "trash",
};

const DOC_OWNER: Record<string, string> = {
  me: "owned by me",
  notMe: "owned by others",
};

export interface DocsHomePageState {
  scope: string;
  owner: string;
  sort: string;
  search: string;
}

export function docsHomePageContext(s: DocsHomePageState): MerchivaPageContext {
  const search = text(s.search);
  const owner = s.owner === "anyone" ? "" : s.owner;
  const sort = s.sort === "modified" ? "" : s.sort;
  return pageContext(
    sentence([
      `Docs home, ${DOC_SCOPE[s.scope] ?? s.scope}`,
      owner && (DOC_OWNER[owner] ?? `owner: ${owner}`),
      sort && `sorted by ${sort}`,
      search && `search ${quoted(search)}`,
    ]),
    { scope: s.scope, owner, sort, search },
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
