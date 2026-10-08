// Starter themes and layouts: valid, round-trippable theme specs, theme references that resolve, placeholder
// geometry scaled to the deck size, and theme decor that validates and stays clear of the placeholders.
import { describe, expect, test } from "bun:test";

import { sanitizeTheme } from "@/lib/slides/model/sanitize-parts";
import type { NewElement, SlideElement } from "@/lib/slides/model/types";
import { sanitizeElement } from "@/lib/slides/model/validate";
import { elementBounds } from "@/lib/slides/geometry/arrange";
import { layoutPlaceholders, LAYOUT_LABEL_KEYS, LAYOUTS, placeholderTextDefaults } from "@/lib/slides/themes/layouts";
import {
  resolveColor, resolveFont, STARTER_THEME_IDS, STARTER_THEMES, THEME_LABEL_KEYS, themeCssVars, themeDecorElements,
} from "@/lib/slides/themes/themes";

const withId = (el: NewElement, i: number): SlideElement => ({ ...el, id: `p${i}`, z: "V" }) as SlideElement;

describe("starter themes", () => {
  test("six themes, each already canonical and ending its font stacks in an Android font", () => {
    expect(STARTER_THEME_IDS).toHaveLength(6);
    for (const id of STARTER_THEME_IDS) {
      const theme = STARTER_THEMES[id];
      expect(theme.id).toBe(id);
      expect(sanitizeTheme(theme, STARTER_THEMES["simple-light"])).toEqual(theme);
      for (const stack of [theme.fonts.heading, theme.fonts.body]) expect(stack).toMatch(/"?(Roboto|Noto Sans|Noto Serif|DejaVu Serif|Droid Sans Mono|Noto Sans Mono)"?, (sans-serif|serif|monospace)$/);
      expect(THEME_LABEL_KEYS[id]).toMatch(/^slides\.themes\.[a-zA-Z]+$/);
    }
  });

  test("theme references resolve to the theme's values", () => {
    const theme = STARTER_THEMES.paper;
    expect(resolveColor("theme:accent1", theme)).toBe("#b45309");
    expect(resolveColor("#123456", theme)).toBe("#123456");
    expect(resolveFont("theme:heading", theme)).toBe(theme.fonts.heading);
    expect(resolveFont("Arial, sans-serif", theme)).toBe("Arial, sans-serif");
    const vars = themeCssVars(theme);
    expect(vars["--slide-color-accent1"]).toBe("#b45309");
    expect(vars["--slide-font-body"]).toBe(theme.fonts.body);
    expect(Object.keys(vars)).toHaveLength(13);
  });

  test("decor validates, is locked and stays clear of the layout placeholders", () => {
    for (const id of STARTER_THEME_IDS) {
      for (const layout of LAYOUTS) {
        const size = { w: 960, h: 540 };
        const decor = themeDecorElements(STARTER_THEMES[id], size, layout);
        const placeholders = layoutPlaceholders(layout, size).map(withId);
        for (const el of decor) {
          expect(sanitizeElement(el)).toEqual(el);
          expect(el.locked).toBe(true);
          const d = elementBounds(el);
          for (const p of placeholders) {
            const b = elementBounds(p);
            const overlaps = d.x < b.x + b.w && b.x < d.x + d.w && d.y < b.y + b.h && b.y < d.y + d.h;
            expect(overlaps).toBe(false);
          }
        }
      }
    }
    expect(themeDecorElements(STARTER_THEMES["simple-light"], { w: 960, h: 540 }, "title")).toEqual([]);
  });
});

describe("layouts", () => {
  test("six layouts with label keys; placeholders validate", () => {
    expect(LAYOUTS).toEqual(["title", "titleBody", "section", "twoColumn", "titleOnly", "blank"]);
    for (const layout of LAYOUTS) {
      expect(LAYOUT_LABEL_KEYS[layout]).toBe(`slides.layouts.${layout}`);
      layoutPlaceholders(layout, { w: 960, h: 540 }).forEach((el, i) => {
        expect(sanitizeElement(withId(el, i))).toEqual(withId(el, i));
      });
    }
    expect(layoutPlaceholders("blank", { w: 960, h: 540 })).toEqual([]);
    expect(layoutPlaceholders("imported", { w: 960, h: 540 })).toEqual([]);
  });

  test("the spec geometry at 960×540 and scaling to 4:3", () => {
    const [title, subtitle] = layoutPlaceholders("title", { w: 960, h: 540 });
    expect(title).toMatchObject({ placeholder: "title", x: 80, y: 180, w: 800, h: 100, textStyle: { size: 44, align: "center" } });
    expect(subtitle).toMatchObject({ placeholder: "subtitle", x: 80, y: 290, w: 800, h: 60, textStyle: { size: 22 } });
    const two = layoutPlaceholders("twoColumn", { w: 960, h: 540 });
    expect(two.map((el) => el.placeholder)).toEqual(["title", "body", "body"]);
    const [scaledTitle] = layoutPlaceholders("title", { w: 720, h: 540 });
    expect(scaledTitle).toMatchObject({ x: 60, y: 180, w: 600, h: 100, textStyle: { size: 33 } });
    expect(placeholderTextDefaults("title", "titleBody")).toMatchObject({ font: "theme:heading", size: 32, align: "left" });
  });

  test("a body placeholder starts as one empty bullet", () => {
    const body = layoutPlaceholders("titleBody", { w: 960, h: 540 })[1];
    expect(body.type === "text" ? body.text : null).toEqual({
      type: "doc", content: [{ type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph" }] }] }],
    });
  });
});
