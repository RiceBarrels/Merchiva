// The words of an in-app alert (toast, OS notification). The module writes each
// row's title and body in English for old clients, and keeps the template and
// its params on the delivery row (notification_delivery) so a new client can
// say it in the reader's language: `notify.event.<template>.title|body`, filled
// with fmt. A missing key, a `custom` row or no delivery row falls back to the
// row's own text.

import { fmt } from "@/lib/i18n/fmt";

/** Delivery fields the text reads. */
export interface AlertTextDelivery {
  readonly template: string;
  readonly params: string;
}

export interface AlertText {
  readonly title: string;
  readonly body: string;
}

const TEMPLATE_RE = /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+$/;

/** A delivery row's params: a JSON object of plain strings; anything else is dropped. */
export function parseAlertParams(json: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return {};
  }
  const out: Record<string, string> = {};
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return out;
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

/** The alert's title and body, localized when the template has copy in `t`. */
export function notificationAlertText(
  row: { readonly title: string; readonly body: string },
  delivery: AlertTextDelivery | null | undefined,
  t: (key: string) => string,
): AlertText {
  const template = delivery?.template ?? "";
  if (!template || template === "custom" || !TEMPLATE_RE.test(template)) return { title: row.title, body: row.body };
  const params = parseAlertParams(delivery?.params ?? "{}");
  const say = (part: "title" | "body", fallback: string) => {
    const key = `notify.event.${template}.${part}`;
    const text = t(key);
    return text === key ? fallback : fmt(text, params);
  };
  return { title: say("title", row.title), body: say("body", row.body) };
}
