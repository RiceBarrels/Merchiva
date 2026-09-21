import { describe, expect, test } from "bun:test";
import { formatDate, intlLocaleTag } from "@/lib/i18n/dates";

describe("intlLocaleTag", () => {
  test("maps the app's locale ids to BCP-47 tags", () => {
    expect(intlLocaleTag("zh-cn")).toBe("zh-CN");
    expect(intlLocaleTag("zh-tw")).toBe("zh-TW");
    expect(intlLocaleTag("zh-hk")).toBe("zh-HK");
    expect(intlLocaleTag("en")).toBe("en");
  });

  test("passes an unknown tag through instead of throwing", () => {
    expect(intlLocaleTag("pt-BR")).toBe("pt-BR");
  });
});

describe("formatDate", () => {
  const date = new Date(2026, 8, 21, 14, 30, 0);

  test("renders a different string per locale", () => {
    const en = formatDate(date, "en", { month: "long", day: "numeric" });
    const zh = formatDate(date, "zh-cn", { month: "long", day: "numeric" });
    const fr = formatDate(date, "fr", { month: "long", day: "numeric" });
    expect(en).not.toBe(zh);
    expect(en).not.toBe(fr);
    expect(en).toContain("September");
    expect(zh).toContain("9");
  });

  test("accepts a Date, an epoch and a parseable string", () => {
    const opts: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit", day: "2-digit" };
    const fromDate = formatDate(date, "en", opts);
    expect(formatDate(date.getTime(), "en", opts)).toBe(fromDate);
    expect(formatDate("2026-09-21T14:30:00", "en", opts)).toBe(fromDate);
  });

  test("an invalid date renders empty rather than 'Invalid Date'", () => {
    expect(formatDate("nonsense", "en", { month: "short" })).toBe("");
    expect(formatDate(Number.NaN, "en", { month: "short" })).toBe("");
  });

  test("an unsupported locale falls back instead of throwing", () => {
    expect(() => formatDate(date, "!!not-a-locale!!", { month: "short" })).not.toThrow();
    expect(formatDate(date, "!!not-a-locale!!", { month: "short" }).length).toBeGreaterThan(0);
  });
});
