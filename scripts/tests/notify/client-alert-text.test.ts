// The words of an in-app alert (lib/notifications/alert-text.ts): the delivery
// row's template + params through `notify.event.<template>.*`, else the row's own
// English text.

import { describe, expect, test } from "bun:test";
import { notificationAlertText, parseAlertParams } from "@/lib/notifications/alert-text";

const ROW = { title: "Ann", body: "hello" };
const DICT: Record<string, string> = {
  "notify.event.chat.mention.title": "{actor} te mencionó",
  "notify.event.chat.mention.body": "{preview}",
  "notify.event.alert.emergency.title": "Emergencia en {device}",
};
const t = (key: string) => DICT[key] ?? key;

describe("notificationAlertText", () => {
  test("a localized template, filled with its params", () => {
    const text = notificationAlertText(ROW, { template: "chat.mention", params: JSON.stringify({ actor: "Ann", preview: "hola", store: "S" }) }, t);
    expect(text).toEqual({ title: "Ann te mencionó", body: "hola" });
  });

  test("a part with no copy falls back to the row's own text", () => {
    const text = notificationAlertText({ title: "Emergency at Till 1", body: "SOS pressed" }, { template: "alert.emergency", params: '{"device":"Till 1"}' }, t);
    expect(text).toEqual({ title: "Emergencia en Till 1", body: "SOS pressed" });
  });

  test("custom rows, no delivery row and unknown templates use the row's text", () => {
    expect(notificationAlertText(ROW, { template: "custom", params: "{}" }, t)).toEqual(ROW);
    expect(notificationAlertText(ROW, null, t)).toEqual(ROW);
    expect(notificationAlertText(ROW, undefined, t)).toEqual(ROW);
    expect(notificationAlertText(ROW, { template: "nope.missing", params: "{}" }, t)).toEqual(ROW);
    expect(notificationAlertText(ROW, { template: "../../x", params: "{}" }, t)).toEqual(ROW);
  });

  test("broken params leave the placeholders visible instead of throwing", () => {
    const text = notificationAlertText(ROW, { template: "chat.mention", params: "{not json" }, t);
    expect(text.title).toBe("{actor} te mencionó");
  });
});

describe("parseAlertParams", () => {
  test("keeps plain string values only", () => {
    expect(parseAlertParams('{"a":"1","b":2,"c":null,"d":"x"}')).toEqual({ a: "1", d: "x" });
    expect(parseAlertParams("[1,2]")).toEqual({});
    expect(parseAlertParams("null")).toEqual({});
    expect(parseAlertParams("")).toEqual({});
  });
});
