// The notification email: one recipient's rows of one cron run as a single
// message (a digest when there are several), in the recipient's language.
// Pure: the cron sends what this returns.
//
// Everything a member can type (names, previews, document and item titles,
// store names, a custom row's stored text) is HTML-escaped AFTER it is put
// into the copy, so a `{placeholder}` value can never carry markup. The
// subject comes only from `notify.email.subject.<template>` /
// `notify.email.digestSubject` (never starting with member text), on one line,
// at most 120 chars. A link becomes a button only when it is a safe /manager
// path (safeAppPath), made absolute against the app origin, then escaped.

import { BORDER, FAINT, INK, MUTED, PRIMARY, RADIUS_INNER, emailButton, emailHeading, emailLayout, emailNote, esc } from "@/lib/email/resend";
import { safeAppPath } from "@/lib/notifications/safe-link";
import { notifyOneLine, notifyPlainText, notifyRowText, notifyTemplateOf, type NotifyTranslator } from "./text";

export const NOTIFY_EMAIL_FROM = "Merchiva <notifications@merchiva.com>";
/** Items shown in one email; the rest are counted ("and N more"). */
export const NOTIFY_EMAIL_ITEMS_MAX = 20;
export const NOTIFY_SUBJECT_MAX = 120;
const NOTIFY_EMERGENCY_TEMPLATE = "alert.emergency";
const TITLE_MAX = 200;
const BODY_MAX = 1_000;

export interface NotifyEmailItem {
  template: string;
  /** The params column (JSON), and the same parsed: `store` and `actor` are shown with the item. */
  paramsJson: string;
  params: Readonly<Record<string, string>>;
  /** English fallback copy (shown verbatim for `custom`). */
  title: string;
  body: string;
  link: string;
  createdAtMs: number;
}

export interface NotifyRenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** The absolute URL of a safe in-app link at `origin`, else null (no button). */
export function notifyEmailLink(link: string, origin: string): string | null {
  const path = safeAppPath(link);
  if (!path) return null;
  try {
    const url = new URL(path, origin);
    return url.origin === origin ? url.href : null;
  } catch {
    return null;
  }
}

/** Emergencies first, then newest first. */
function ordered(items: readonly NotifyEmailItem[]): NotifyEmailItem[] {
  const rank = (item: NotifyEmailItem) => (item.template === NOTIFY_EMERGENCY_TEMPLATE ? 0 : 1);
  return [...items].sort((a, b) => rank(a) - rank(b) || b.createdAtMs - a.createdAtMs);
}

/** The subject text without the store: the template's own subject, or the digest's. */
function subjectLead(tr: NotifyTranslator, items: readonly NotifyEmailItem[]): string {
  if (items.length > 1) return tr.text("notify.email.digestSubject", { count: items.length }) ?? "Merchiva";
  const template = notifyTemplateOf(items[0]?.template ?? "");
  return tr.text(`notify.email.subject.${template}`) ?? tr.text("notify.email.subject.custom") ?? "Merchiva";
}

/**
 * The subject: the lead, plus the store when every item is from one store, on
 * one line. The store joins only through a pattern that starts with the lead,
 * so member text never opens the subject.
 */
function subjectLine(tr: NotifyTranslator, lead: string, items: readonly NotifyEmailItem[]): string {
  const stores = new Set(items.map((item) => item.params.store ?? ""));
  const store = stores.size === 1 ? notifyOneLine([...stores][0], NOTIFY_SUBJECT_MAX) : "";
  const pattern = tr.text("notify.email.subjectWithStore");
  const subject = store && pattern?.trimStart().startsWith("{subject}")
    ? (tr.text("notify.email.subjectWithStore", { subject: lead, store }) ?? lead)
    : lead;
  return notifyOneLine(subject, NOTIFY_SUBJECT_MAX);
}

interface ItemCopy {
  title: string;
  body: string;
  /** "Store: …" and "From: …", plain text. */
  meta: string[];
  href: string | null;
}

function itemCopy(tr: NotifyTranslator, item: NotifyEmailItem, origin: string): ItemCopy {
  const text = notifyRowText(tr, item);
  const meta: string[] = [];
  const store = notifyOneLine(item.params.store ?? "", TITLE_MAX);
  const actor = notifyOneLine(item.params.actor ?? "", TITLE_MAX);
  if (store) meta.push(tr.text("notify.email.storeLine", { store }) ?? store);
  if (actor) meta.push(tr.text("notify.email.authorLine", { author: actor }) ?? actor);
  return {
    title: notifyOneLine(text.title, TITLE_MAX),
    body: notifyPlainText(text.body, BODY_MAX).trim(),
    meta: meta.map((line) => notifyOneLine(line, TITLE_MAX * 2)),
    href: notifyEmailLink(item.link, origin),
  };
}

function itemHtml(copy: ItemCopy, openLabel: string, single: boolean): string {
  const body = copy.body
    ? `<p style="margin:0;font-size:14px;line-height:1.6;color:${INK};">${esc(copy.body).replace(/\n/g, "<br/>")}</p>`
    : "";
  const meta = copy.meta.length > 0
    ? `<p style="margin:8px 0 0;font-size:12px;line-height:1.5;color:${MUTED};">${copy.meta.map(esc).join(" · ")}</p>`
    : "";
  const open = !copy.href ? ""
    : single ? `<p style="margin:16px 0 0;">${emailButton(esc(copy.href), esc(openLabel))}</p>`
    : `<p style="margin:8px 0 0;font-size:13px;line-height:1.5;"><a href="${esc(copy.href)}" style="color:${PRIMARY};font-weight:500;text-decoration:none;">${esc(openLabel)}</a></p>`;
  return `
        <div style="margin:0 0 12px;padding:12px 14px;border:1px solid ${BORDER};border-radius:${RADIUS_INNER};">
          <p style="margin:0 0 4px;font-size:14px;font-weight:600;line-height:1.4;color:${INK};">${esc(copy.title)}</p>
          ${body}${meta}${open}
        </div>`;
}

function itemText(copy: ItemCopy, tr: NotifyTranslator): string {
  const lines = [copy.title];
  if (copy.body) lines.push(...copy.body.split("\n").map((line) => `  ${line}`));
  if (copy.meta.length > 0) lines.push(`  ${copy.meta.join(" · ")}`);
  if (copy.href) lines.push(`  ${tr.text("notify.email.textOpen", { url: copy.href }) ?? copy.href}`);
  return `- ${lines.join("\n")}`;
}

/**
 * One recipient's email in `tr`'s language (notifyTranslator of their stored
 * locale). `items` must not be empty; `appOrigin` is notifyAppOrigin() (safe-link.ts).
 */
export function renderNotifyEmail(input: {
  tr: NotifyTranslator;
  items: readonly NotifyEmailItem[];
  appOrigin: string;
}): NotifyRenderedEmail {
  const { tr } = input;
  const all = ordered(input.items);
  const shown = all.slice(0, NOTIFY_EMAIL_ITEMS_MAX);
  const more = all.length - shown.length;
  const lead = notifyOneLine(subjectLead(tr, all), NOTIFY_SUBJECT_MAX);
  const subject = subjectLine(tr, lead, all);
  const openLabel = tr.text("notify.email.open") ?? "Merchiva";
  const copies = shown.map((item) => itemCopy(tr, item, input.appOrigin));
  const moreText = more > 0 ? (tr.text("notify.email.more", { count: more }) ?? "") : "";

  const settingsUrl = `${input.appOrigin}/manager/settings`;
  const settingsLabel = tr.text("notify.email.settings") ?? settingsUrl;
  const footerLines = [tr.text("notify.email.footerWhy"), tr.text("notify.email.footerOff")];
  if (all.some((item) => item.template === NOTIFY_EMERGENCY_TEMPLATE)) footerLines.push(tr.text("notify.email.footerEmergency"));
  const footer = footerLines.filter((line): line is string => !!line);

  const html = emailLayout({
    dir: tr.dir,
    brand: "Merchiva",
    body: `
        ${emailHeading(esc(lead))}
        ${copies.map((copy) => itemHtml(copy, openLabel, copies.length === 1)).join("")}
        ${moreText ? emailNote(esc(moreText), "margin:4px 0 0;") : ""}
      `,
    footer: `${footer.map(esc).join("<br/>")}<br/><a href="${esc(settingsUrl)}" style="color:${FAINT};text-decoration:underline;">${esc(settingsLabel)}</a>`,
  });

  const text = [
    lead,
    "",
    copies.map((copy) => itemText(copy, tr)).join("\n\n"),
    ...(moreText ? ["", moreText] : []),
    "",
    "--",
    ...footer,
    tr.text("notify.email.textSettings", { url: settingsUrl }) ?? settingsUrl,
  ].join("\n");

  return { subject, html, text };
}
