// Drive UI model: "Stored in apps" — photos and files other Merchiva apps keep as links
// (chat attachments, task and inventory evidence, training media, product images, bug
// screenshots, the store logo and your profile photo), listed read-only beside Drive.
//
// Pure (no React). Rows arrive as the provider already subscribes them, untyped: every field
// is read through the local guards below, never `any`. The page hook
// (components/drive/virtual/use-virtual-sources.ts) gates each source by the source app's
// permission and install state (`requires`); these mappers apply who may see which row, keep
// chat messages of this store's conversations only (the message subscription is unfiltered),
// hide the tablet account's chat and profile photo on /store, and keep http(s) links only.

import { fileKindOf, type DriveFileKind } from "@/lib/drive/file-kinds";
import { mimeFromExtension, normalizeDriveMime } from "@/lib/drive/rules";
import { fmt } from "@/lib/i18n/fmt";
import type { Permissions } from "@/lib/types";
import type { DriveEntryAccess, VirtualEntry, VirtualSourceId } from "./types";

export interface VirtualSourceMeta {
  id: VirtualSourceId;
  labelKey: string;
  icon: "MessageSquare" | "ListChecks" | "Package" | "GraduationCap" | "Tag" | "Bug" | "UserCircle";
  originRoute: string;
  /** permission: `can(permission, "view")`; appRoute: its app is installed; hideOnStore: not on the shared tablet. */
  requires: { permission?: keyof Permissions; appRoute?: string; hideOnStore?: boolean };
}

export const VIRTUAL_SOURCES: readonly VirtualSourceMeta[] = [
  { id: "chat", labelKey: "drive.apps.sources.chat", icon: "MessageSquare", originRoute: "/manager/channel", requires: { permission: "staffing", hideOnStore: true } },
  { id: "tasks", labelKey: "drive.apps.sources.tasks", icon: "ListChecks", originRoute: "/manager/personnel/roles", requires: { appRoute: "/manager/personnel/roles" } },
  { id: "inventory", labelKey: "drive.apps.sources.inventory", icon: "Package", originRoute: "/manager/inventory", requires: { permission: "inventory" } },
  { id: "training", labelKey: "drive.apps.sources.training", icon: "GraduationCap", originRoute: "/manager/personnel/training", requires: { appRoute: "/manager/personnel/training" } },
  { id: "products", labelKey: "drive.apps.sources.products", icon: "Tag", originRoute: "/manager/products", requires: { permission: "products", appRoute: "/manager/products" } },
  { id: "bugs", labelKey: "drive.apps.sources.bugs", icon: "Bug", originRoute: "/manager/bugs", requires: {} },
  // The store logo shows everywhere; the profile photo (the signed-in account's) is left out on /store by the mapper.
  { id: "profile", labelKey: "drive.apps.sources.profile", icon: "UserCircle", originRoute: "/manager/settings", requires: {} },
];

export interface VirtualInput {
  organizationId: string;
  /** org_member id of the person (the operator on /store). */
  actorMemberId: string | null;
  canViewAll: boolean;
  /** The SpacetimeDB identity is the shared store tablet's account (/store), not the person. */
  storeIdentity: boolean;
  identityHex: string | null;
  members: readonly { id: string; userIdHex: string; name: string }[];
  chatConversations: readonly unknown[];
  chatMessages: readonly unknown[];
  /** chat_member rows, to name conversations without a name (else the senders seen in them). */
  chatMembers?: readonly unknown[];
  roleTasks: readonly unknown[];
  taskAssignments: readonly unknown[];
  inventoryTransactions: readonly unknown[];
  inventoryItems: readonly unknown[];
  trainingObjectives: readonly unknown[];
  bugReports: readonly unknown[];
  organizations: readonly unknown[];
  users: readonly unknown[];
  /** Resolved strings: drive.apps.untitledAttachment, storeLogo, profilePhoto, photoN ("{name} · photo {n}"). */
  labels: { untitledAttachment: string; storeLogo: string; profilePhoto: string; photoN: string };
  /** App locale, for joining participant names. */
  locale?: string;
}

// ── Row guards ───────────────────────────────────────────────────────────────

type Row = Readonly<Record<string, unknown>>;

function rowsOf(rows: readonly unknown[] | undefined): Row[] {
  return (rows ?? []).flatMap((row) => (row !== null && typeof row === "object" ? [row as Row] : []));
}

/** A string column ('' for a missing option or another type). */
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Uuid → hyphenated string, Identity → hex, strings as they are; lowercased; '' for anything else. A Uuid has a
 * toHexString too, but without the dashes the uuid string columns (conversationId, taskId, …) are written with.
 */
function idOf(value: unknown): string {
  if (typeof value === "string") return value.toLowerCase();
  if (value === null || typeof value !== "object") return "";
  if ("__uuid__" in value) return String(value).toLowerCase();
  const toHex = (value as { toHexString?: unknown }).toHexString;
  if ("__identity__" in value && typeof toHex === "function") return String(toHex.call(value)).toLowerCase();
  const s = String(value);
  return s.startsWith("[object") ? "" : s.toLowerCase();
}

/** Timestamp / Date / epoch ms → epoch ms; 0 when unknown. */
function timeOf(value: unknown): number {
  let ms = 0;
  if (value instanceof Date) ms = value.getTime();
  else if (typeof value === "number") ms = value;
  else if (value !== null && typeof value === "object") {
    const toDate = (value as { toDate?: unknown }).toDate;
    const micros = (value as { microsSinceUnixEpoch?: unknown }).microsSinceUnixEpoch;
    if (typeof toDate === "function") {
      const date: unknown = toDate.call(value);
      if (date instanceof Date) ms = date.getTime();
    } else if (typeof micros === "bigint") ms = Number(micros / BigInt(1000));
    else if (typeof micros === "number") ms = micros / 1000;
  }
  return Number.isFinite(ms) ? ms : 0;
}

/** Only http: / https: links are listed (the same rule as lib/docs/uploads.ts normalizeImageUrl). */
function httpUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The link's last path segment, decoded ('' when there is none). */
function lastSegment(url: string): string {
  const segment = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Evidence JSON (`[{ url, type }]`, written by the task and inventory apps): malformed JSON or rows are skipped,
 * bare strings are URLs, a missing type is "image", and only distinct http(s) links are kept.
 */
export function parseEvidenceJson(raw: string | null | undefined): { url: string; type: string }[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: { url: string; type: string }[] = [];
  for (const item of parsed as unknown[]) {
    const fields = item !== null && typeof item === "object" ? (item as Row) : null;
    const url = httpUrl(typeof item === "string" ? item : fields?.url);
    if (!url || out.some((e) => e.url === url)) continue;
    const type = text(fields?.type).trim();
    out.push({ url, type: type || "image" });
  }
  return out;
}

// ── Entries ──────────────────────────────────────────────────────────────────

const OCTET = "application/octet-stream";
const ROW_ID_RE = /^[A-Za-z0-9-]{1,80}$/;
const READ_ONLY: DriveEntryAccess = Object.freeze({
  canOpen: true, canDownload: true, canRename: false, canMove: false, canTrash: false, canRestore: false,
  canDeleteForever: false, canShare: false, canStar: false, canAddChildren: false,
});

/**
 * Kind and type of a link: a declared MIME type wins; a declared family ("image", "video", "audio", as the apps
 * store it) keeps its family even when the name has no extension (upload hosts drop them); else the extension of
 * the name or the link decides.
 */
function linkKind(declared: string, name: string, url: string): { fileKind: DriveFileKind; mimeType: string } {
  const mime = normalizeDriveMime(declared);
  if (mime && mime !== OCTET) return { fileKind: fileKindOf(mime, name), mimeType: mime };
  const byName = mimeFromExtension(name);
  const byExtension = byName !== OCTET ? byName : mimeFromExtension(lastSegment(url));
  const family = declared.trim().toLowerCase();
  if (family === "image" || family === "video" || family === "audio") {
    return byExtension.startsWith(`${family}/`)
      ? { fileKind: fileKindOf(byExtension, name), mimeType: byExtension }
      : { fileKind: family, mimeType: OCTET };
  }
  return { fileKind: fileKindOf(byExtension, name), mimeType: byExtension };
}

interface Link {
  rowId: string;
  /** 1-based position in a row holding several links; null for a row's only link. */
  n: number | null;
  url: string;
  name: string;
  declared: string;
  ownerMemberId: string;
  time: number;
  group: string;
  isMine?: boolean;
}

function toEntries(source: VirtualSourceId, input: VirtualInput, links: readonly Link[]): VirtualEntry[] {
  const meta = VIRTUAL_SOURCES.find((s) => s.id === source);
  const names = new Map(input.members.map((m) => [m.id, m.name]));
  const out: VirtualEntry[] = [];
  for (const link of links) {
    if (!ROW_ID_RE.test(link.rowId) || (link.n !== null && (link.n < 1 || link.n > 999))) continue;
    const id = link.n === null ? link.rowId : `${link.rowId}:${link.n}`;
    out.push({
      key: `v:${source}:${id}`,
      id,
      name: link.name,
      createdAt: link.time,
      updatedAt: link.time,
      ownerMemberId: link.ownerMemberId,
      ownerName: link.ownerMemberId ? (names.get(link.ownerMemberId) ?? null) : null,
      isMine: link.isMine ?? (!!input.actorMemberId && link.ownerMemberId === input.actorMemberId),
      starred: false,
      trashedAt: null,
      openedAt: null,
      location: null,
      access: READ_ONLY,
      type: "virtual",
      source,
      url: link.url,
      ...linkKind(link.declared, link.name, link.url),
      group: link.group,
      originRoute: meta?.originRoute ?? null,
    });
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

const inOrg = (row: Row, input: VirtualInput) => text(row.organizationId).toLowerCase() === input.organizationId.toLowerCase();

/** Chat attachments of this store's conversations; the group is the conversation name, else the people in it. */
export function chatAttachmentEntries(input: VirtualInput): VirtualEntry[] {
  if (input.storeIdentity) return [];
  const conversations = new Map(rowsOf(input.chatConversations).filter((c) => inOrg(c, input)).map((c) => [idOf(c.id), c]));
  const byIdentity = new Map(input.members.map((m) => [m.userIdHex.toLowerCase(), m]));
  const messages = rowsOf(input.chatMessages).filter((m) => conversations.has(idOf(m.conversationId)));
  const people = new Map<string, Set<string>>();
  const addPerson = (conversationId: string, identity: string) => {
    if (!identity) return;
    const set = people.get(conversationId) ?? new Set<string>();
    set.add(identity);
    people.set(conversationId, set);
  };
  if (input.chatMembers) for (const m of rowsOf(input.chatMembers)) addPerson(idOf(m.conversationId), idOf(m.userId));
  else for (const m of messages) addPerson(idOf(m.conversationId), idOf(m.senderId));

  const groupOf = (conversationId: string): string => {
    const name = text(conversations.get(conversationId)?.name).trim();
    if (name) return name;
    const everyone = [...(people.get(conversationId) ?? [])];
    const others = everyone.filter((identity) => identity !== input.identityHex?.toLowerCase());
    const named = (others.length ? others : everyone).flatMap((identity) => byIdentity.get(identity)?.name.trim() || []).sort();
    return joinNames(named, input.locale);
  };
  const links: Link[] = [];
  for (const m of messages) {
    const url = httpUrl(m.attachmentUrl);
    if (!url) continue;
    const conversationId = idOf(m.conversationId);
    links.push({
      rowId: idOf(m.id), n: null, url,
      name: text(m.attachmentName).trim() || lastSegment(url) || input.labels.untitledAttachment,
      declared: text(m.attachmentType),
      ownerMemberId: byIdentity.get(idOf(m.senderId))?.id ?? "",
      time: timeOf(m.createdAt),
      group: groupOf(conversationId),
    });
  }
  return toEntries("chat", input, links);
}

function joinNames(names: readonly string[], locale: string | undefined): string {
  try {
    return new Intl.ListFormat(locale, { type: "conjunction", style: "long" }).format(names);
  } catch {
    return names.join(", ");
  }
}

/** One link per evidence photo of a row, named "<title> · photo n" and grouped under the title. */
function evidenceLinks(input: VirtualInput, rowId: string, evidence: readonly { url: string; type: string }[], title: string, rest: Pick<Link, "ownerMemberId" | "time">): Link[] {
  const label = title.trim() || input.labels.untitledAttachment;
  return evidence.map((e, i) => ({
    rowId, n: i + 1, url: e.url, declared: e.type, group: title.trim(),
    name: fmt(input.labels.photoN, { name: label, n: i + 1 }), ...rest,
  }));
}

/**
 * Task evidence (the evidence JSON plus the legacy single link, de-duplicated): your own, or every assignment's
 * for someone with the Drive view power. "Own" compares the assignment's memberId with the org_member id, as the
 * tasks app does; rows holding a staff_member id match nobody and show to admins only.
 */
export function taskEvidenceEntries(input: VirtualInput): VirtualEntry[] {
  const titles = new Map(rowsOf(input.roleTasks).map((t) => [idOf(t.id), text(t.title)]));
  const links: Link[] = [];
  for (const a of rowsOf(input.taskAssignments)) {
    const memberId = text(a.memberId);
    const own = !!input.actorMemberId && memberId === input.actorMemberId;
    if (!inOrg(a, input) || (!own && !input.canViewAll)) continue;
    const evidence = parseEvidenceJson(text(a.evidenceUrls));
    const single = httpUrl(a.evidenceUrl);
    if (single && !evidence.some((e) => e.url === single)) evidence.push({ url: single, type: "image" });
    const time = timeOf(a.completedAt) || timeOf(a.createdAt);
    links.push(...evidenceLinks(input, idOf(a.id), evidence, titles.get(text(a.taskId).toLowerCase()) ?? "", { ownerMemberId: memberId, time }));
  }
  return toEntries("tasks", input, links);
}

/** Inventory evidence photos (the provider keeps 120 days of transactions). */
export function inventoryEvidenceEntries(input: VirtualInput): VirtualEntry[] {
  const links = rowsOf(input.inventoryTransactions).filter((r) => inOrg(r, input)).flatMap((r) =>
    evidenceLinks(input, idOf(r.id), parseEvidenceJson(text(r.evidenceUrls)), text(r.itemName), {
      ownerMemberId: text(r.operatorMemberId), time: timeOf(r.createdAt),
    }));
  return toEntries("inventory", input, links);
}

/** Training lesson media. */
export function trainingMediaEntries(input: VirtualInput): VirtualEntry[] {
  const links = rowsOf(input.trainingObjectives).filter((r) => inOrg(r, input)).flatMap((r): Link[] => {
    const url = httpUrl(r.mediaUrl);
    return url ? [{ rowId: idOf(r.id), n: null, url, name: text(r.text).trim() || input.labels.untitledAttachment,
      declared: text(r.mediaType), ownerMemberId: "", time: timeOf(r.updatedAt), group: "" }] : [];
  });
  return toEntries("training", input, links);
}

/** Product images (inventory items with a retail image). */
export function productImageEntries(input: VirtualInput): VirtualEntry[] {
  const links = rowsOf(input.inventoryItems).filter((r) => inOrg(r, input)).flatMap((r): Link[] => {
    const url = httpUrl(r.retailImageUrl);
    return url ? [{ rowId: idOf(r.id), n: null, url, name: text(r.name).trim() || input.labels.untitledAttachment,
      declared: "image", ownerMemberId: "", time: timeOf(r.updatedAt), group: "" }] : [];
  });
  return toEntries("products", input, links);
}

/** Bug report screenshots: your own, or all of them with the Drive view power. */
export function bugScreenshotEntries(input: VirtualInput): VirtualEntry[] {
  const links = rowsOf(input.bugReports).filter((r) => inOrg(r, input)).flatMap((r): Link[] => {
    const url = httpUrl(r.screenshotUrl);
    const reporter = text(r.reporterMemberId);
    const own = !!input.actorMemberId && reporter === input.actorMemberId;
    return url && (own || input.canViewAll) ? [{ rowId: idOf(r.id), n: null, url,
      name: text(r.title).trim() || input.labels.untitledAttachment, declared: "image", ownerMemberId: reporter,
      time: timeOf(r.createdAt), group: "" }] : [];
  });
  return toEntries("bugs", input, links);
}

/** The store logo, and your own profile photo (not on /store, where the account is the tablet's). */
export function profileImageEntries(input: VirtualInput): VirtualEntry[] {
  const links: Link[] = [];
  const org = input.organizationId.toLowerCase();
  const store = rowsOf(input.organizations).find((o) => idOf(o.id) === org);
  const logo = store ? httpUrl(store.logoUrl) : null;
  if (store && logo) {
    links.push({ rowId: org, n: null, url: logo, name: input.labels.storeLogo, declared: "image", ownerMemberId: "", time: timeOf(store.createdAt), group: "", isMine: false });
  }
  const me = input.identityHex?.toLowerCase();
  const user = !input.storeIdentity && me ? rowsOf(input.users).find((u) => idOf(u.identity) === me) : undefined;
  const avatar = user ? httpUrl(user.avatarUrl) : null;
  if (user && me && avatar) {
    links.push({ rowId: me, n: null, url: avatar, name: input.labels.profilePhoto, declared: "image", ownerMemberId: "", time: timeOf(user.createdAt), group: "", isMine: true });
  }
  return toEntries("profile", input, links);
}

const MAPPERS: Readonly<Record<VirtualSourceId, (input: VirtualInput) => VirtualEntry[]>> = {
  chat: chatAttachmentEntries,
  tasks: taskEvidenceEntries,
  inventory: inventoryEvidenceEntries,
  training: trainingMediaEntries,
  products: productImageEntries,
  bugs: bugScreenshotEntries,
  profile: profileImageEntries,
};

/** The read-only entries of one source, newest first. */
export function buildVirtualEntries(source: VirtualSourceId, input: VirtualInput): VirtualEntry[] {
  return MAPPERS[source](input);
}
