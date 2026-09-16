// Foreign-overlay detection (mobile-safari spec §16.3, E3 item 30). Renders real vaul drawers with
// react-dom/server and runs the selector over the markup with Bun's HTMLRewriter, which speaks the
// same attribute / :not() selectors as document.querySelector.

import { describe, expect, test } from "bun:test";
import { createElement as h, type ComponentProps, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Drawer } from "vaul";
import {
  FOREIGN_OVERLAY_ATTRIBUTES,
  FOREIGN_OVERLAY_SELECTOR,
} from "../../../lib/browser-shell/mobile/use-foreign-overlay";

interface Match {
  readonly tag: string;
  readonly role: string | null;
  readonly slot: string | null;
}

/** vaul reads document.body during render; stub it for this synchronous render only. */
function render(element: ReactElement): string {
  const scope = globalThis as { document?: unknown };
  const hadDocument = "document" in scope;
  if (!hadDocument) scope.document = { body: { style: { backgroundColor: "" } } };
  try {
    return renderToStaticMarkup(element);
  } finally {
    if (!hadDocument) delete scope.document;
  }
}

async function matches(html: string, selector: string = FOREIGN_OVERLAY_SELECTOR): Promise<Match[]> {
  const found: Match[] = [];
  await new HTMLRewriter()
    .on(selector, {
      element(el: { readonly tagName: string; getAttribute(name: string): string | null }) {
        found.push({ tag: el.tagName, role: el.getAttribute("role"), slot: el.getAttribute("data-slot") });
      },
    })
    .transform(new Response(html))
    .text();
  return found;
}

type DataAttributes = Partial<Record<`data-${string}`, string>>;
type DrawerContentProps = ComponentProps<typeof Drawer.Content> & DataAttributes;

function drawer(open: boolean, dataAttributes: DataAttributes = {}): ReactElement {
  const contentProps: DrawerContentProps = { "data-slot": "drawer-content", ...dataAttributes };
  return h(
    Drawer.Root,
    { open },
    h(
      Drawer.Content,
      contentProps,
      h(Drawer.Title, null, "Mention"),
      // A handle is the only element vaul marks with data-vaul-drawer-visible.
      h(Drawer.Handle, null),
    ),
  );
}

describe("foreign overlay selector", () => {
  test("matches an open vaul drawer's content", async () => {
    const found = await matches(render(drawer(true)));
    expect(found).toEqual([{ tag: "div", role: "dialog", slot: "drawer-content" }]);
  });

  test("does not match a closed vaul drawer", async () => {
    expect(await matches(render(drawer(false)))).toEqual([]);
  });

  test("ignores the shell's own sheets", async () => {
    expect(await matches(render(drawer(true, { "data-shell-sheet": "" })))).toEqual([]);
  });

  test("regression: data-vaul-drawer-visible never sits on the drawer element", async () => {
    const html = render(drawer(true));
    expect(html).toContain('data-vaul-drawer-visible="true"');
    expect(await matches(html, '[data-vaul-drawer][data-vaul-drawer-visible="true"]')).toEqual([]);
  });

  test("matches open Base UI popups and the Combobox list, not closed ones", async () => {
    const open = [
      '<div data-slot="alert-dialog-content" data-open=""></div>',
      '<div data-slot="select-content" data-open=""></div>',
      '<div data-slot="context-menu-content" data-open=""></div>',
      '<div data-slot="dropdown-menu-content" data-open=""></div>',
      '<div data-slot="combobox-content" data-open=""></div>',
    ].join("");
    expect((await matches(open)).map((m) => m.slot)).toEqual([
      "alert-dialog-content",
      "select-content",
      "context-menu-content",
      "dropdown-menu-content",
      "combobox-content",
    ]);
    const closed = '<div data-slot="select-content" data-closed=""></div><div data-slot="combobox-content"></div>';
    expect(await matches(closed)).toEqual([]);
  });

  test("the observer watches the attributes that open and close these overlays", () => {
    expect(FOREIGN_OVERLAY_ATTRIBUTES).toContain("data-state");
    expect(FOREIGN_OVERLAY_ATTRIBUTES).toContain("data-open");
    expect(FOREIGN_OVERLAY_ATTRIBUTES).toContain("data-closed");
  });
});
