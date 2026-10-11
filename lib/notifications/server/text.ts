// A delivery row's copy in its recipient's language, for the push and the
// email the cron sends. Pure.
//
// The row text is the same rule the in-app alert uses
// (lib/notifications/alert-text.ts): `notify.event.<template>.title|body` from
// messages/*.json filled with the row's params, or the English title / body
// the module stored for `custom` and for missing copy. Values are plain text
// here; the email renderer escapes them.

import { DEFAULT_LOCALE, RTL_LOCALES, normalizeLocale, type Locale } from "@/lib/i18n/config";
import { getDictionary, lookup } from "@/lib/i18n/dictionaries";
import { fmt } from "@/lib/i18n/fmt";
import { notificationAlertText } from "@/lib/notifications/alert-text";

export const NOTIFY_CUSTOM_TEMPLATE = "custom";
/** A module template key ('chat.mention', 'timeOff.requested'); anything else reads as `custom`. */
const TEMPLATE_RE = /^[a-z][A-Za-z]*\.[A-Za-z]+$/;

export interface NotifyTranslator {
  locale: Locale;
  dir: "ltr" | "rtl";
  /** useT()'s contract: the string at `key` (English when this locale lacks it), or `key` itself when none has it. */
  t(key: string): string;
  /** The string at `key` filled with `vars`, or null when no locale has it. */
  text(key: string, vars?: Readonly<Record<string, string | number>>): string | null;
}

/** The recipient's stored locale ('' or unknown → English). */
export function notifyTranslator(rawLocale: string): NotifyTranslator {
  const locale = normalizeLocale(rawLocale) ?? DEFAULT_LOCALE;
  const dict = getDictionary(locale);
  const t = (key: string) => lookup(dict, key);
  return {
    locale,
    dir: RTL_LOCALES.has(locale) ? "rtl" : "ltr",
    t,
    text(key, vars) {
      const found = t(key);
      if (found === key) return null;
      return vars ? fmt(found, vars) : found;
    },
  };
}

/** The template a row's subject and push type are read under: `custom` when it is not a template key. */
export function notifyTemplateOf(template: string): string {
  return TEMPLATE_RE.test(template) ? template : NOTIFY_CUSTOM_TEMPLATE;
}

export interface NotifyTextRow {
  template: string;
  /** The params column, a JSON object of plain strings. */
  paramsJson: string;
  title: string;
  body: string;
}

/** The row's title and body in the translator's language. */
export function notifyRowText(tr: NotifyTranslator, row: NotifyTextRow): { title: string; body: string } {
  return notificationAlertText(row, { template: row.template, params: row.paramsJson }, tr.t);
}

const CONTROL_RE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029]/g;
const LINE_BREAK_RE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g;

/** Text for a body: control characters out, line breaks kept, at most `max` chars. */
export function notifyPlainText(value: string, max: number): string {
  const clean = value.replace(/\r\n?/g, "\n").replace(CONTROL_RE, " ");
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** Text for one line (a subject, a title): every control character and line break becomes a space. */
export function notifyOneLine(value: string, max: number): string {
  const clean = value.replace(LINE_BREAK_RE, " ").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
