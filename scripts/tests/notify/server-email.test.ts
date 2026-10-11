// The notification email (lib/notifications/server/email.ts): member text is
// escaped after it is put into the copy, the subject comes from templates only
// (one line, ≤ 120 chars, never opening with member text), a button only for a
// safe /manager link, at most 20 items, rtl for Arabic, and a text/plain part.
// The last block checks the real copy in messages/*.json.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LOCALES } from "@/lib/i18n/config";
import {
  NOTIFY_EMAIL_ITEMS_MAX, NOTIFY_SUBJECT_MAX, notifyEmailLink, renderNotifyEmail, type NotifyEmailItem,
} from "@/lib/notifications/server/email";
import { notifyTranslator } from "@/lib/notifications/server/text";
import { NOTIFY_TEMPLATES } from "@/spacetimedb/src/notify/logic";
import { EN_EMAIL, NOW, fixedTranslator } from "./server-fixture";

const ORIGIN = "https://www.merchiva.com";

function item(over: Partial<NotifyEmailItem> & { params?: Record<string, string> } = {}): NotifyEmailItem {
  const params = over.params ?? { actor: "Ana", preview: "See you at 9", conversation: "general", store: "Corner Shop" };
  return {
    template: "chat.mention",
    title: "Ana",
    body: "See you at 9",
    link: "/manager/channel?c=c1",
    createdAtMs: NOW,
    ...over,
    params,
    paramsJson: JSON.stringify(params),
  };
}

function render(items: NotifyEmailItem[], tr = fixedTranslator()) {
  return renderNotifyEmail({ tr, items, appOrigin: ORIGIN });
}

describe("escaping", () => {
  test("member text is escaped after interpolation: names, previews, document titles, store names", () => {
    const email = render([item({
      template: "doc.comment",
      params: {
        actor: "<script>alert(1)</script>",
        doc: '<a href="https://evil.com">Plan</a>',
        preview: "<img src=x onerror=alert(1)>",
        store: "Joe's <b>Shop</b>",
      },
    })]);
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain('<a href="https://evil.com"');
    expect(email.html).not.toContain("<img src=x");
    expect(email.html).not.toContain("<b>Shop</b>");
    expect(email.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; commented on &lt;a href=&quot;https://evil.com&quot;&gt;Plan&lt;/a&gt;");
    expect(email.html).toContain("Store: Joe&#39;s &lt;b&gt;Shop&lt;/b&gt;");
    expect(email.html).toContain("From: &lt;script&gt;");
  });

  test("a custom row's stored title and body are escaped too", () => {
    const email = render([item({ template: "custom", title: "<i>Hi</i>", body: "a & b", params: { store: "S" } })]);
    expect(email.html).toContain("&lt;i&gt;Hi&lt;/i&gt;");
    expect(email.html).toContain("a &amp; b");
    expect(email.subject).toBe("New notification · S");
  });

  test("a CRLF in a display name never reaches a header or splits a line", () => {
    const email = render([item({ params: { actor: "Ana\r\nBcc: victim@example.com", preview: "x", store: "Shop\r\nX-Evil: 1" } })]);
    expect(email.subject).not.toMatch(/[\r\n]/);
    expect(email.subject).toBe("You were mentioned in a channel · Shop X-Evil: 1");
    expect(email.html).toContain("Ana Bcc: victim@example.com mentioned you");
    expect(email.text).toContain("- Ana Bcc: victim@example.com mentioned you\n");
  });
});

describe("subject", () => {
  test("from the template, with the store when every item shares one", () => {
    expect(render([item()]).subject).toBe("You were mentioned in a channel · Corner Shop");
    expect(render([item(), item({ template: "doc.comment" })]).subject).toBe("You have 2 new notifications · Corner Shop");
    const twoStores = render([item(), item({ params: { actor: "Bo", preview: "x", store: "Other" } })]);
    expect(twoStores.subject).toBe("You have 2 new notifications");
  });

  test("never opens with member text, even when a translation puts the store first", () => {
    const storeFirst = fixedTranslator({ ...EN_EMAIL, "notify.email.subjectWithStore": "{store}: {subject}" });
    expect(render([item()], storeFirst).subject).toBe("You were mentioned in a channel");
  });

  test("an unknown template falls back to the generic subject; at most 120 chars", () => {
    expect(render([item({ template: "weird" })]).subject).toBe("New notification · Corner Shop");
    const long = render([item({ params: { actor: "A", preview: "p", store: "S".repeat(300) } })]).subject;
    expect(long.length).toBeLessThanOrEqual(NOTIFY_SUBJECT_MAX);
    expect(long.startsWith("You were mentioned in a channel · SSS")).toBe(true);
  });
});

describe("links", () => {
  test("only a safe /manager path becomes a button, made absolute", () => {
    expect(notifyEmailLink("/manager/channel?c=c1", ORIGIN)).toBe(`${ORIGIN}/manager/channel?c=c1`);
    expect(notifyEmailLink('/manager/x?y="z', ORIGIN)).toBe(`${ORIGIN}/manager/x?y=%22z`);
    for (const bad of ["//evil.com", "/\\evil.com", "javascript:alert(1)", "https://evil.com", "/store", "", "/manager/../admin"]) {
      expect(notifyEmailLink(bad, ORIGIN)).toBeNull();
    }
  });

  test("a single item gets a button; an unsafe link gets none", () => {
    const ok = render([item({ link: '/manager/x?y="z' })]);
    expect(ok.html).toContain(`href="${ORIGIN}/manager/x?y=%22z"`);
    expect(ok.html).toContain("Open in Merchiva");
    expect(ok.text).toContain(`Open: ${ORIGIN}/manager/x?y=%22z`);
    const bad = render([item({ link: "https://evil.com" })]);
    expect(bad.html).not.toContain("evil.com");
    expect(bad.html).not.toContain("Open in Merchiva");
  });
});

describe("digest", () => {
  test("at most 20 items, then 'and N more'; emergencies first, then newest first", () => {
    const items = Array.from({ length: 23 }, (_, i) => item({
      createdAtMs: NOW - i * 1000,
      params: { actor: `Person ${i}`, preview: `msg ${i}`, store: "Shop" },
    }));
    items.push(item({ template: "alert.emergency", title: "Emergency at Front", body: "SOS", createdAtMs: NOW - 99_000, params: { device: "Front", store: "Shop" } }));
    const email = render(items);
    expect(email.subject).toBe("You have 24 new notifications · Shop");
    expect(email.html.match(/border-radius:14px;">/g)?.length).toBe(NOTIFY_EMAIL_ITEMS_MAX);
    expect(email.html).toContain("And 4 more in Merchiva.");
    expect(email.text).toContain("And 4 more in Merchiva.");
    expect(email.html.indexOf("Emergency at Front")).toBeLessThan(email.html.indexOf("Person 0 mentioned you"));
    expect(email.html.indexOf("Person 0 mentioned you")).toBeLessThan(email.html.indexOf("Person 1 mentioned you"));
    expect(email.html).not.toContain("Person 22 mentioned you");
    expect(email.html).toContain("Emergency alerts are emailed even when email is off.");
  });

  test("digest items link with a plain link, not a button each", () => {
    const email = render([item(), item({ template: "doc.comment", link: "/manager/drive" })]);
    expect(email.html).not.toContain("padding:10px 20px");
    expect(email.html).toContain(`href="${ORIGIN}/manager/drive"`);
  });
});

describe("layout", () => {
  test("rtl for Arabic, ltr otherwise", () => {
    expect(render([item()], fixedTranslator(EN_EMAIL, "rtl")).html).toContain('dir="rtl"');
    expect(render([item()]).html).toContain('dir="ltr"');
    expect(notifyTranslator("ar").dir).toBe("rtl");
    expect(notifyTranslator("zh-TW").locale).toBe("zh-tw");
    expect(notifyTranslator("").locale).toBe("en");
  });

  test("the footer says why and how to stop, with the settings link, in html and text", () => {
    const email = render([item()]);
    expect(email.html).toContain("You&#39;re receiving this email because");
    expect(email.html).toContain("Settings → Notifications");
    expect(email.html).toContain(`href="${ORIGIN}/manager/settings"`);
    expect(email.text).toContain(`Notification settings: ${ORIGIN}/manager/settings`);
    expect(email.html).not.toContain("Emergency alerts");
  });

  test("the text part has the heading, each item, its store and author", () => {
    const email = render([item()]);
    expect(email.text.split("\n").slice(0, 6)).toEqual([
      "You were mentioned in a channel",
      "",
      "- Ana mentioned you",
      "  See you at 9",
      "  Store: Corner Shop · From: Ana",
      `  Open: ${ORIGIN}/manager/channel?c=c1`,
    ]);
    expect(email.text).not.toMatch(/<[a-z]/i);
  });
});

// ─── The real copy (messages/*.json) ────────────────────────────────────────

type Messages = Record<string, unknown>;
const ROOT = join(import.meta.dir, "..", "..", "..");
const messages = Object.fromEntries(
  LOCALES.map((locale) => [locale, JSON.parse(readFileSync(join(ROOT, "messages", `${locale}.json`), "utf8")) as Messages]),
);
function at(dict: Messages, path: string): unknown {
  return path.split(".").reduce<unknown>((cur, key) => (cur && typeof cur === "object" ? (cur as Messages)[key] : undefined), dict);
}
const EMAIL_KEYS = [
  "digestSubject", "subjectWithStore", "storeLine", "authorLine", "open", "more", "footerWhy", "footerOff",
  "footerEmergency", "settings", "textOpen", "textSettings",
  ...NOTIFY_TEMPLATES.map((template) => `subject.${template}`),
].map((key) => `notify.email.${key}`);
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("notify.email copy in messages/*.json", () => {
  test("every key in all 8 locales with the same placeholders", () => {
    for (const key of EMAIL_KEYS) {
      const en = at(messages.en, key);
      expect(typeof en).toBe("string");
      for (const locale of LOCALES) {
        const value = at(messages[locale], key);
        expect(typeof value === "string" && value.trim() !== "").toBe(true);
        expect(placeholders(value as string)).toEqual(placeholders(en as string));
      }
    }
  });

  test("subjects carry no member text: no placeholders, and the store joins after the subject", () => {
    for (const locale of LOCALES) {
      for (const template of NOTIFY_TEMPLATES) {
        expect(placeholders(at(messages[locale], `notify.email.subject.${template}`) as string)).toEqual([]);
      }
      expect((at(messages[locale], "notify.email.subjectWithStore") as string).startsWith("{subject}")).toBe(true);
      expect((at(messages[locale], "notify.email.digestSubject") as string).startsWith("{store}")).toBe(false);
    }
  });

  test("a real render in every locale has a template subject and no raw keys", () => {
    for (const locale of LOCALES) {
      const email = renderNotifyEmail({ tr: notifyTranslator(locale), items: [item()], appOrigin: ORIGIN });
      expect(email.subject.startsWith(at(messages[locale], "notify.email.subject.chat.mention") as string)).toBe(true);
      expect(email.html).not.toContain("notify.email.");
      expect(email.text).not.toContain("notify.email.");
    }
  });
});
