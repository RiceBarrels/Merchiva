// The nav presence badge (components/presence/nav-presence.tsx): the same "two avatars, then n+"
// rule on a full-width sidebar row and on the collapsed icon rail.

import { describe, expect, test } from "bun:test";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NavPresenceBadge } from "@/components/presence/nav-presence";
import type { NavViewer } from "@/lib/presence/rows";

function viewer(name: string, self = false): NavViewer {
  return {
    key: self ? "self" : `member:${name}`,
    self,
    name,
    avatarUrl: "",
    memberId: `m-${name}`,
    sectionHref: "/manager/inventory",
    childHref: null,
  };
}

const PEOPLE = [viewer("Ana Diaz"), viewer("Ben Okafor"), viewer("Zoe Li"), viewer("Mia Chen", true)];

function badge(count: number, collapsed: boolean) {
  const html = renderToStaticMarkup(
    h(NavPresenceBadge, { people: PEOPLE.slice(0, count), title: "On this page", collapsed }),
  );
  return {
    html,
    avatars: html.split('data-slot="avatar"').length - 1,
    chip: /(\d+)\+</.exec(html)?.[1] ?? null,
  };
}

describe("NavPresenceBadge", () => {
  for (const collapsed of [false, true]) {
    const where = collapsed ? "icon rail" : "full row";

    test(`${where}: one or two people are shown as avatars, with no count`, () => {
      expect(badge(1, collapsed)).toMatchObject({ avatars: 1, chip: null });
      expect(badge(2, collapsed)).toMatchObject({ avatars: 2, chip: null });
    });

    test(`${where}: more than two people are two avatars and an "n+" chip for the rest`, () => {
      expect(badge(3, collapsed)).toMatchObject({ avatars: 2, chip: "1" });
      expect(badge(4, collapsed)).toMatchObject({ avatars: 2, chip: "2" });
    });
  }

  test("nobody on the row renders nothing", () => {
    expect(badge(0, false).html).toBe("");
    expect(badge(0, true).html).toBe("");
  });

  test("the badge stays out of the accessible name; the names are in its title", () => {
    const { html } = badge(3, true);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('title="On this page"');
  });
});
