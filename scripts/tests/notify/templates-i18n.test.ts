// The copy for every module notification template (spacetimedb/src/notify/logic.ts)
// in all 8 locales: the in-app / push text `notify.event.<template>.title|body`
// and the email subject `notify.email.subject.<template>`, read the way the
// server reads them (lib/notifications/server/text.ts, email.ts).

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LOCALES } from "@/lib/i18n/config";
import { renderNotifyEmail, type NotifyEmailItem } from "@/lib/notifications/server/email";
import { notifyRowText, notifyTemplateOf, notifyTranslator } from "@/lib/notifications/server/text";
import { NOTIFY_TEMPLATES, NOTIFY_TEMPLATE_PARAMS, type NotifyTemplate } from "@/spacetimedb/src/notify/logic";

type Messages = Record<string, unknown>;
const ROOT = join(import.meta.dir, "..", "..", "..");
const messages = Object.fromEntries(
  LOCALES.map((locale) => [locale, JSON.parse(readFileSync(join(ROOT, "messages", `${locale}.json`), "utf8")) as Messages]),
);

function at(dict: Messages, path: string): unknown {
  return path.split(".").reduce<unknown>((cur, key) => (cur && typeof cur === "object" ? (cur as Messages)[key] : undefined), dict);
}

const placeholders = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
const COPY_TEMPLATES = NOTIFY_TEMPLATES.filter((template) => template !== "custom");
const FALLBACK = "\u0000fallback";

/** Every param the template's copy may use, each with a value that shows where it landed. */
function paramsOf(template: NotifyTemplate): Record<string, string> {
  return Object.fromEntries([...NOTIFY_TEMPLATE_PARAMS[template], "store"].map((name) => [name, `<${name}>`]));
}

function item(template: NotifyTemplate): NotifyEmailItem {
  const params = paramsOf(template);
  return {
    template, paramsJson: JSON.stringify(params), params,
    title: FALLBACK, body: FALLBACK, link: "/manager", createdAtMs: Date.UTC(2026, 9, 8),
  };
}

test("the locale list is the 8 message files", () => {
  expect([...LOCALES].sort()).toEqual(["ar", "en", "es", "fr", "hi", "zh-cn", "zh-hk", "zh-tw"]);
});

describe("notify.event.<template>.title|body", () => {
  for (const template of COPY_TEMPLATES) {
    test(`${template}: in all 8 locales with en's placeholders, which are its params or {store}`, () => {
      for (const part of ["title", "body"] as const) {
        const key = `notify.event.${template}.${part}`;
        const en = at(messages.en, key);
        expect({ key, en: typeof en }).toEqual({ key, en: "string" });
        const allowed = [...NOTIFY_TEMPLATE_PARAMS[template], "store"];
        expect({ key, unknown: placeholders(en as string).filter((name) => !allowed.includes(name)) }).toEqual({ key, unknown: [] });
        for (const locale of LOCALES) {
          const value = at(messages[locale], key);
          expect({ key, locale, ok: typeof value === "string" && value.trim() !== "" }).toEqual({ key, locale, ok: true });
          expect({ key, locale, names: placeholders(value as string) }).toEqual({ key, locale, names: placeholders(en as string) });
        }
      }
    });
  }

  test("custom has no copy: it shows the row's own title and body", () => {
    for (const locale of LOCALES) expect(at(messages[locale], "notify.event.custom")).toBeUndefined();
    const tr = notifyTranslator("fr");
    const text = notifyRowText(tr, { template: "custom", paramsJson: "{}", title: "T", body: "B" });
    expect(text).toEqual({ title: "T", body: "B" });
  });

  test("the server's row text uses the copy, fully filled, in every locale", () => {
    for (const locale of LOCALES) {
      const tr = notifyTranslator(locale);
      for (const template of COPY_TEMPLATES) {
        const text = notifyRowText(tr, { template, paramsJson: JSON.stringify(paramsOf(template)), title: FALLBACK, body: FALLBACK });
        expect({ locale, template, title: text.title === FALLBACK, body: text.body === FALLBACK }).toEqual({ locale, template, title: false, body: false });
        expect({ locale, template, left: [...placeholders(text.title), ...placeholders(text.body)] }).toEqual({ locale, template, left: [] });
      }
    }
  });
});

describe("notify.email.subject.<template>", () => {
  test("every template, custom included, has a subject in all 8 locales, without placeholders", () => {
    for (const template of NOTIFY_TEMPLATES) {
      const key = `notify.email.subject.${template}`;
      for (const locale of LOCALES) {
        const value = at(messages[locale], key);
        expect({ key, locale, ok: typeof value === "string" && value.trim() !== "" }).toEqual({ key, locale, ok: true });
        expect({ key, locale, names: placeholders(value as string) }).toEqual({ key, locale, names: [] });
      }
    }
  });

  test("the server reads each template's subject under the template's own key", () => {
    const misread = NOTIFY_TEMPLATES.filter((template) => notifyTemplateOf(template) !== template)
      .map((template) => `${template} -> ${notifyTemplateOf(template)}`);
    expect(misread).toEqual([]);
  });

  test("a one-item email's subject opens with that template's subject, in every locale", () => {
    for (const locale of LOCALES) {
      const tr = notifyTranslator(locale);
      for (const template of NOTIFY_TEMPLATES) {
        const email = renderNotifyEmail({ tr, items: [item(template)], appOrigin: "https://www.merchiva.com" });
        const subject = at(messages[locale], `notify.email.subject.${template}`) as string;
        expect({ locale, template, subject: email.subject.startsWith(subject) }).toEqual({ locale, template, subject: true });
        expect({ locale, template, raw: /notify\.(email|event)\./.test(email.html + email.text) }).toEqual({ locale, template, raw: false });
      }
    }
  });
});
