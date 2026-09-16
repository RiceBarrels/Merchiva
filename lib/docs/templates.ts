/**
 * Docs templates: ids, metadata, and the ProseMirror JSON each template seeds a new document with.
 *
 * Contract (plan §B7.3): this module imports NO Tiptap or Yjs code. The docs home and the New Tab
 * page import it for template tiles and thumbnails; `lib/docs/seed.ts` (editor core) turns
 * `buildDocTemplate(...).content` into a Yjs update through the editor schema.
 *
 * Templates are structure plus short localized headings/labels, resolved once at creation in the
 * creator's locale (docs-editor-ui spec §3.5). After that they're ordinary document text.
 *
 * Node, mark and attribute names match the editor schema built by `lib/docs/editor-extensions.ts`:
 * `doc`, `paragraph` (global attr `docStyle: "title" | "subtitle"` from ParagraphStyle), `heading`
 * (`level` 1–3), `text`, mark `bold`, `bulletList` / `orderedList` / `listItem`, `taskList` /
 * `taskItem` (`checked`), `table` / `tableRow` / `tableHeader` / `tableCell`.
 */
import { LOCALE_BCP47, isLocale } from "@/lib/i18n/config";

export type DocTemplateId =
  | "blank"
  | "meetingNotes"
  | "shiftHandover"
  | "storeSop"
  | "incidentReport"
  | "weeklyChecklist";

export interface DocTemplateMeta {
  readonly id: DocTemplateId;
  /** `"docs.templates.blank"` for blank, otherwise `` `docs.templates.${id}.title` ``. */
  readonly titleKey: string;
}

/** Display order: blank first, then the store templates. */
export const DOC_TEMPLATE_IDS: readonly DocTemplateId[] = [
  "blank",
  "meetingNotes",
  "shiftHandover",
  "storeSop",
  "incidentReport",
  "weeklyChecklist",
];

export function docTemplateTitleKey(id: DocTemplateId): string {
  return id === "blank" ? "docs.templates.blank" : `docs.templates.${id}.title`;
}

export const DOC_TEMPLATES: readonly DocTemplateMeta[] = DOC_TEMPLATE_IDS.map((id) => ({
  id,
  titleKey: docTemplateTitleKey(id),
}));

export function isDocTemplateId(value: string | null | undefined): value is DocTemplateId {
  return !!value && (DOC_TEMPLATE_IDS as readonly string[]).includes(value);
}

/**
 * ProseMirror JSON. Declared as type aliases (not interfaces) so values are structurally
 * assignable to Tiptap's `JSONContent` without importing `@tiptap/core` here.
 */
export type DocTemplateMark = { type: string; attrs?: Record<string, unknown> };
export type DocTemplateNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocTemplateNode[];
  marks?: DocTemplateMark[];
  text?: string;
};

export type DocTemplateContext = {
  /** App locale (`"en"`, `"zh-cn"`, …) or any BCP-47 tag. Drives dates, weekday names and label punctuation. */
  locale: string;
  /** Current store name; omitted from the template when null or blank. */
  storeName: string | null;
  /** Creator's display name; left blank for the reader to fill in when null. */
  authorName: string | null;
  /** Creation time. Defaults to `new Date()`. */
  now?: Date;
};

export type DocTemplateDocument = {
  /** Initial document title: `""` for blank (shown as "Untitled document"), else the localized template title. */
  title: string;
  /** Root `doc` node. */
  content: DocTemplateNode;
};

type Translate = (key: string) => string;

/* ─── Locale helpers ─────────────────────────────────────────────────────── */

function intlTag(locale: string): string {
  const tag = isLocale(locale) ? LOCALE_BCP47[locale] : locale;
  try {
    return Intl.DateTimeFormat.supportedLocalesOf(tag).length > 0 ? tag : "en";
  } catch {
    return "en";
  }
}

function formatDate(date: Date, tag: string): string {
  return new Intl.DateTimeFormat(tag, { dateStyle: "medium" }).format(date);
}

/** ISO weekday of the locale's first day of the week (1 = Monday … 7 = Sunday). Monday when unknown. */
function firstDayOfWeek(tag: string): number {
  try {
    const loc = new Intl.Locale(tag) as Intl.Locale & {
      getWeekInfo?: () => { firstDay?: number };
      weekInfo?: { firstDay?: number };
    };
    const firstDay = (typeof loc.getWeekInfo === "function" ? loc.getWeekInfo() : loc.weekInfo)?.firstDay;
    return typeof firstDay === "number" && firstDay >= 1 && firstDay <= 7 ? firstDay : 1;
  } catch {
    return 1;
  }
}

function startOfWeek(now: Date, tag: string): Date {
  const isoDay = now.getDay() === 0 ? 7 : now.getDay();
  const back = (isoDay - firstDayOfWeek(tag) + 7) % 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
}

function weekdayNames(weekStart: Date, tag: string): string[] {
  const format = new Intl.DateTimeFormat(tag, { weekday: "short" });
  return Array.from({ length: 7 }, (_, i) =>
    format.format(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)),
  );
}

/** Bold field label with locale-appropriate colon: "Date:" · "Date :" (fr) · "日期：" (zh). */
function fieldLabel(label: string, tag: string): { label: string; gap: string } {
  if (tag.startsWith("zh")) return { label: `${label}：`, gap: "" };
  if (tag.startsWith("fr")) return { label: `${label} :`, gap: " " };
  return { label: `${label}:`, gap: " " };
}

/* ─── Node builders ──────────────────────────────────────────────────────── */

function text(value: string, bold = false): DocTemplateNode {
  return bold ? { type: "text", text: value, marks: [{ type: "bold" }] } : { type: "text", text: value };
}

/** Paragraph; empty strings are dropped because ProseMirror rejects empty text nodes. */
function paragraph(...children: DocTemplateNode[]): DocTemplateNode {
  const content = children.filter((c) => c.type !== "text" || (c.text ?? "") !== "");
  return content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" };
}

function titleBlock(value: string): DocTemplateNode {
  return { type: "paragraph", attrs: { docStyle: "title" }, content: [text(value)] };
}

function heading2(value: string): DocTemplateNode {
  return { type: "heading", attrs: { level: 2 }, content: [text(value)] };
}

function bulletList(items: string[] = [""]): DocTemplateNode {
  return {
    type: "bulletList",
    content: items.map((item) => ({ type: "listItem", content: [paragraph(text(item))] })),
  };
}

function orderedList(items: string[] = [""]): DocTemplateNode {
  return {
    type: "orderedList",
    attrs: { start: 1 },
    content: items.map((item) => ({ type: "listItem", content: [paragraph(text(item))] })),
  };
}

function taskList(items: string[] = [""]): DocTemplateNode {
  return {
    type: "taskList",
    content: items.map((item) => ({
      type: "taskItem",
      attrs: { checked: false },
      content: [paragraph(text(item))],
    })),
  };
}

function cell(kind: "tableHeader" | "tableCell", children: DocTemplateNode[] = []): DocTemplateNode {
  return {
    type: kind,
    attrs: { colspan: 1, rowspan: 1, colwidth: null },
    content: [paragraph(...children)],
  };
}

function tableRow(cells: DocTemplateNode[]): DocTemplateNode {
  return { type: "tableRow", content: cells };
}

/** "**Date:** Sep 15, 2026 · **Store:** Downtown" — pairs with a null/blank value keep only the label. */
function fieldLine(fields: Array<[label: string, value: string | null]>, tag: string): DocTemplateNode {
  const children: DocTemplateNode[] = [];
  fields.forEach(([label, value], index) => {
    if (index > 0) children.push(text(" · "));
    const { label: withColon, gap } = fieldLabel(label, tag);
    children.push(text(withColon, true));
    const shown = value?.trim() ?? "";
    children.push(text(shown ? `${gap}${shown}` : gap));
  });
  return paragraph(...children);
}

/* ─── Templates ──────────────────────────────────────────────────────────── */

interface BuildArgs {
  t: Translate;
  tag: string;
  now: Date;
  date: string;
  storeName: string | null;
  authorName: string | null;
}

function k(id: Exclude<DocTemplateId, "blank">, key: string): string {
  return `docs.templates.${id}.${key}`;
}

function dateAndStoreLine({ t, tag, date, storeName }: BuildArgs): DocTemplateNode {
  const fields: Array<[string, string | null]> = [[t("docs.templates.field.date"), date]];
  if (storeName?.trim()) fields.push([t("docs.templates.field.store"), storeName]);
  return fieldLine(fields, tag);
}

const BUILDERS: Record<Exclude<DocTemplateId, "blank">, (a: BuildArgs) => DocTemplateNode[]> = {
  meetingNotes: (a) => [
    titleBlock(a.t(k("meetingNotes", "title"))),
    dateAndStoreLine(a),
    heading2(a.t(k("meetingNotes", "attendees"))),
    bulletList(),
    heading2(a.t(k("meetingNotes", "agenda"))),
    orderedList(),
    heading2(a.t(k("meetingNotes", "notes"))),
    paragraph(),
    heading2(a.t(k("meetingNotes", "actionItems"))),
    taskList(),
  ],

  shiftHandover: (a) => [
    titleBlock(a.t(k("shiftHandover", "title"))),
    dateAndStoreLine(a),
    heading2(a.t(k("shiftHandover", "outgoing"))),
    paragraph(),
    heading2(a.t(k("shiftHandover", "incoming"))),
    paragraph(),
    heading2(a.t(k("shiftHandover", "done"))),
    taskList([a.t(k("shiftHandover", "cashChecked")), a.t(k("shiftHandover", "keysHanded")), ""]),
    heading2(a.t(k("shiftHandover", "todo"))),
    taskList(),
    heading2(a.t(k("shiftHandover", "stock"))),
    bulletList(),
    heading2(a.t(k("shiftHandover", "customers"))),
    bulletList(),
  ],

  storeSop: (a) => [
    titleBlock(a.t(k("storeSop", "title"))),
    heading2(a.t(k("storeSop", "purpose"))),
    paragraph(),
    heading2(a.t(k("storeSop", "appliesTo"))),
    paragraph(),
    heading2(a.t(k("storeSop", "steps"))),
    orderedList(),
    heading2(a.t(k("storeSop", "safety"))),
    bulletList(),
    fieldLine(
      [
        [a.t(k("storeSop", "owner")), a.authorName],
        [a.t(k("storeSop", "reviewed")), a.date],
      ],
      a.tag,
    ),
  ],

  incidentReport: (a) => {
    const row = (label: string, value: string | null) =>
      tableRow([cell("tableCell", [text(label, true)]), cell("tableCell", value?.trim() ? [text(value.trim())] : [])]);
    return [
      titleBlock(a.t(k("incidentReport", "title"))),
      {
        type: "table",
        content: [
          row(a.t(k("incidentReport", "when")), null),
          row(a.t(k("incidentReport", "where")), a.storeName),
          row(a.t(k("incidentReport", "people")), null),
          row(a.t("docs.templates.field.author"), a.authorName),
        ],
      },
      heading2(a.t(k("incidentReport", "what"))),
      paragraph(),
      heading2(a.t(k("incidentReport", "actions"))),
      bulletList(),
      heading2(a.t(k("incidentReport", "followUp"))),
      taskList(),
    ];
  },

  weeklyChecklist: (a) => {
    const weekStart = startOfWeek(a.now, a.tag);
    const days = weekdayNames(weekStart, a.tag);
    const tasks = ["countCash", "checkDates", "cleanFloors", "restock"].map((key) => a.t(k("weeklyChecklist", key)));
    return [
      titleBlock(a.t(k("weeklyChecklist", "title"))),
      fieldLine([[a.t(k("weeklyChecklist", "weekOf")), formatDate(weekStart, a.tag)]], a.tag),
      {
        type: "table",
        content: [
          tableRow([
            cell("tableHeader", [text(a.t(k("weeklyChecklist", "task")))]),
            ...days.map((day) => cell("tableHeader", [text(day)])),
          ]),
          ...tasks.map((task) => tableRow([cell("tableCell", [text(task)]), ...days.map(() => cell("tableCell"))])),
        ],
      },
      paragraph(),
    ];
  },
};

/**
 * Builds the initial title and ProseMirror JSON for a template. Pure and synchronous; `t` must be the
 * creator's translator (`useT()`), so the seeded text is in their language.
 */
export function buildDocTemplate(id: DocTemplateId, t: Translate, ctx: DocTemplateContext): DocTemplateDocument {
  if (id === "blank") {
    return { title: "", content: { type: "doc", content: [paragraph()] } };
  }
  const tag = intlTag(ctx.locale);
  const now = ctx.now ?? new Date();
  const args: BuildArgs = {
    t,
    tag,
    now,
    date: formatDate(now, tag),
    storeName: ctx.storeName?.trim() || null,
    authorName: ctx.authorName?.trim() || null,
  };
  return { title: t(docTemplateTitleKey(id)), content: { type: "doc", content: BUILDERS[id](args) } };
}
