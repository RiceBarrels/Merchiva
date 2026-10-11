// NotificationDot (components/ui/notification-dot.tsx): an aria-hidden red dot
// in the top inline-end corner, two sizes, an inline variant, optional sr-only
// text, and nothing at all when `show` is false.

import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NotificationDot, type NotificationDotProps } from "@/components/ui/notification-dot";

const html = (props: NotificationDotProps) => renderToStaticMarkup(createElement(NotificationDot, props));

describe("NotificationDot", () => {
  test("defaults: small, pinned to the top inline-end corner, hidden from assistive tech", () => {
    const out = html({});
    expect(out).toContain('aria-hidden="true"');
    for (const cls of ["absolute", "-top-0.5", "-end-0.5", "size-2", "rounded-full", "bg-destructive", "ring-2", "ring-background", "pointer-events-none"]) {
      expect(out).toContain(cls);
    }
    expect(out).not.toMatch(/\b(left|right)-/);
    expect(out).not.toContain("sr-only");
  });

  test("md on device tiles, inline after a sub-row's text", () => {
    expect(html({ size: "md" })).toContain("size-3");
    const inline = html({ inline: true });
    expect(inline).toContain("inline-block");
    expect(inline).not.toContain("absolute");
  });

  test("an inverted row swaps the ring", () => {
    const out = html({ className: "ring-foreground" });
    expect(out).toContain("ring-foreground");
    expect(out).not.toContain("ring-background");
  });

  test("a label is screen-reader text beside the dot", () => {
    expect(html({ label: "New" })).toContain('<span class="sr-only">New</span>');
  });

  test("show={false} renders nothing", () => {
    expect(html({ show: false, label: "New" })).toBe("");
  });
});
