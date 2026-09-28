// Isolated fixture for scripts/tests/slides/render-smoke.test.ts — NOT auto-discovered by `bun test` (no .test. in
// the name). SlideView must render with no providers mounted (the PDF/PNG export mounts it in a bare React root),
// so every app hook it could reach is replaced with one that throws; mock.module would leak into other test files,
// hence the separate process.
import { expect, mock, test } from "bun:test";
import type { JSONContent } from "@tiptap/core";

const forbidden = (name: string) => () => {
  throw new Error(`SlideView must not call ${name}`);
};
mock.module("@/lib/i18n/context", () => ({ useT: forbidden("useT"), useI18n: forbidden("useI18n"), I18nProvider: forbidden("I18nProvider") }));
mock.module("next/navigation", () => ({
  useRouter: forbidden("useRouter"),
  usePathname: forbidden("usePathname"),
  useSearchParams: forbidden("useSearchParams"),
  useParams: forbidden("useParams"),
}));
mock.module("@/lib/auth/context", () => ({ useAuth: forbidden("useAuth") }));
mock.module("@/lib/context/permissions", () => ({ usePermissions: forbidden("usePermissions") }));

const { createElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { SlideView } = await import("@/components/slides/canvas/slide-view");
const { SLIDE_TEXT_CLASS } = await import("@/components/slides/canvas/slide-text-class");
const { GestureFrameStore, GestureFramesContext } = await import("@/components/slides/canvas/gesture-frames");
const { sampleDeck, sampleElements, canonical } = await import("./helpers/fixtures");

type Props = Parameters<typeof SlideView>[0];
type Slide = Props["slide"];

const LABELS: NonNullable<Props["labels"]> = {
  placeholders: { title: "Click to add title", subtitle: "Click to add subtitle", body: "Click to add text" },
  chart: "Chart",
  imageMissing: "Image unavailable",
};

const deckSnap = sampleDeck();
const deck: Props["deck"] = { meta: deckSnap.meta, masters: new Map(deckSnap.masters.map((m) => [m.id, m])) };
const slideA = deckSnap.slides[0];
const slideB = deckSnap.slides[1];

function render(props: Partial<Props> & { slide?: Slide } = {}): string {
  return renderToStaticMarkup(createElement(SlideView, { deck, slide: slideA, scale: 1, mode: "export", labels: LABELS, ...props }));
}

const common = { locked: false, name: "", link: "", placeholder: "", rot: 0 };
const emptyText: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

function withElements(elements: Slide["elements"]): Slide {
  return { ...slideA, masterId: "", elements };
}

test("export mode renders every element type with no providers mounted", () => {
  const html = render();
  expect(html).toContain('data-slide-view="slideA"');
  expect(html).toContain('data-mode="export"');
  // text (rich text with lists), shapes (preset + path + gradient + shadow), line, picture, table, chart.
  expect(html).toContain("colour");
  expect(html).toContain("<ul>");
  expect(html).toContain("nested");
  expect(html).toContain("<linearGradient");
  expect(html).toContain("<feDropShadow");
  expect(html).toContain("<line ");
  expect(html).toContain("photo.jpg");
  expect(html).toContain("<table");
  expect(html).toContain('colSpan="2"');
  expect(html).toContain("Sales");
  // Theme decor (coastal: a top band) sits behind the slide's elements and is not selectable.
  expect(html).toContain('data-decor="1"');
  expect(html).not.toContain("data-el-id");
  // Export draws an image fill as an HTML layer (html2canvas cannot load pictures inside an <svg>).
  expect(html).not.toContain("<pattern");
  expect(html).toMatch(/background-image:url\(&quot;https:\/\/cdn\.example\.com\/fill\.png&quot;\)/);
  // Vertical text is laid out vertically on screen.
  expect(html).toContain("writing-mode:vertical-rl");
});

test("edit mode marks elements for selection and shows placeholder prompts; other modes hide them", () => {
  const title = canonical({
    ...common, id: "ph", z: "a", type: "text", placeholder: "title", x: 10, y: 10, w: 400, h: 60,
    geom: { kind: "preset", preset: "rect" }, fill: { t: "none" }, stroke: null, shadow: null, box: {}, textStyle: {},
    flipH: false, flipV: false, text: emptyText,
  });
  const slide = withElements([...sampleElements(), title]);
  const edit = render({ slide, mode: "edit" });
  for (const id of ["txt1", "shp1", "path1", "ln1", "img1", "tbl1", "cht1", "ph"]) expect(edit).toContain(`data-el-id="${id}"`);
  expect(edit).toContain("Click to add title");
  expect(edit).toContain("<pattern");
  for (const mode of ["present", "thumb", "export"] as const) {
    expect(render({ slide, mode })).not.toContain("Click to add title");
  }
});

test("links: <a> only in present mode with a handler; unsafe hrefs never reach the markup", () => {
  const unsafe = canonical({
    ...common, id: "bad", z: "b", type: "text", x: 0, y: 0, w: 100, h: 40,
    geom: { kind: "preset", preset: "rect" }, fill: { t: "none" }, stroke: null, shadow: null, box: {}, textStyle: {},
    flipH: false, flipV: false, text: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "click" }] }] },
  });
  // Bypass the validator to hand the renderer hostile text and element links, as a newer or broken writer could.
  const hostile = {
    ...unsafe,
    link: "javascript:alert(1)",
    text: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "click", marks: [{ type: "link", attrs: { href: "javascript:alert(2)" } }] }] }] },
  } as Slide["elements"][number];
  const slide = withElements([...sampleElements(), hostile]);
  const onLinkClick = () => {};
  for (const mode of ["edit", "thumb", "present", "export"] as const) {
    const html = render({ slide, mode, onLinkClick });
    expect(html).not.toContain("javascript:");
    if (mode !== "present") expect(html).not.toContain("<a ");
  }
  const present = render({ slide, mode: "present", onLinkClick });
  expect(present).toContain('<a href="https://example.com/a"');
  // The element link of txt1 makes its wrapper a link; the hostile one does not.
  expect(present).toContain('role="link"');
  expect(present.match(/role="link"/g)).toHaveLength(1);
  expect(render({ slide, mode: "present" })).not.toContain("<a ");
});

test("two instances of one slide: unique ids, every url(#…) resolves inside its own <svg>", () => {
  const one = (mode: Props["mode"]) => createElement(SlideView, { deck, slide: slideA, scale: 0.5, mode, labels: LABELS });
  const html = renderToStaticMarkup(createElement("div", null, one("edit"), one("edit"), one("thumb")));
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  expect(ids.length).toBeGreaterThan(6);
  expect(new Set(ids).size).toBe(ids.length);
  const svgs = [...html.matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map((m) => m[0]);
  let refs = 0;
  for (const svg of svgs) {
    const local = new Set([...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    for (const [, target] of svg.matchAll(/url\(#([^)]+)\)/g)) {
      refs += 1;
      expect(local.has(target)).toBe(true);
    }
  }
  expect(refs).toBeGreaterThan(3);
  const outside = html.replace(/<svg\b[\s\S]*?<\/svg>/g, "");
  expect(outside).not.toContain("url(#");
});

test("no <svg> positions itself (html2canvas would serialize the offset into its picture); paint may overflow", () => {
  const html = render({ mode: "export" });
  const tags = [...html.matchAll(/<svg\b[^>]*>/g)].map((m) => m[0]);
  expect(tags.length).toBeGreaterThanOrEqual(4);
  for (const tag of tags) expect(tag).not.toMatch(/style="[^"]*(position|left|top):/);
  // The shadowed, stroked star gets room around its box: its wrapper is moved out, its drawing moved back in.
  expect(html).toMatch(/<div aria-hidden="true" style="position:absolute;left:-(\d+)px;top:-\1px[^"]*"><svg width="\d+" height="\d+"[^>]*><defs>[\s\S]*?<g transform="translate\(\1 \1\)">/);
});

test("only the export <img> asks for a CORS copy", () => {
  expect(render({ mode: "export" })).toContain('crossorigin="anonymous"');
  for (const mode of ["edit", "thumb", "present"] as const) expect(render({ mode })).not.toContain("crossorigin");
});

test("a picture without an allowed src shows the unavailable label, not an <img>", () => {
  const [, , , , img] = sampleElements();
  const broken = { ...img, src: "http://example.com/x.png" } as Slide["elements"][number];
  const html = render({ slide: withElements([broken]) });
  expect(html).toContain("Image unavailable");
  expect(html).not.toContain("<img");
});

test("a picture the export host found unavailable is the missing box at once, others stay pictures", () => {
  const html = render({ unavailableImages: new Set(["https://cdn.example.com/photo.jpg"]) });
  expect(html).toContain("Image unavailable");
  expect(html).not.toContain("photo.jpg");
  // The master's logo is another src: still an <img>.
  const other = render({ slide: slideB, unavailableImages: new Set(["https://cdn.example.com/photo.jpg"]) });
  expect(other).toContain("logo.png");
  expect(other).not.toContain("Image unavailable");
});

test("renderEditor draws the editor target only, for an element or a table cell", () => {
  const seen: Array<[string, string | undefined]> = [];
  const renderEditor = (el: Slide["elements"][number], cellKey?: string) => {
    seen.push([el.id, cellKey]);
    return createElement("div", { "data-test-editor": "1" }, "EDITOR");
  };
  const html = render({ mode: "edit", editorTargetId: "txt1", renderEditor });
  expect(html).toContain("EDITOR");
  expect(html).not.toContain("colour");
  expect(html).toContain("Sale");
  expect(seen).toEqual([["txt1", undefined]]);
  seen.length = 0;
  const cell = render({ mode: "edit", editorTargetId: "tbl1/r2:c1", renderEditor });
  expect(seen).toEqual([["tbl1", "r2:c1"]]);
  expect(cell).toContain('data-cell-key="r2:c1"');
  expect(cell).not.toContain(">Tea<");
});

test("a stored master supplies decor and background", () => {
  const html = render({ slide: slideB });
  expect(html).toContain('data-decor="1"');
  expect(html).toContain("logo.png");
  expect(html).toMatch(/background-image:url\(&quot;https:\/\/cdn\.example\.com\/bg\.png&quot;\)/);
});

test("a gesture frame moves and resizes an element; without a provider nothing moves", () => {
  const store = new GestureFrameStore();
  store.set(new Map([["txt1", { x: 11, y: 22, w: 33, h: 44, rot: 5 }], ["ln1", { x: 110, y: 20, w: 390, h: 0, rot: 0 }]]));
  const html = renderToStaticMarkup(
    createElement(GestureFramesContext.Provider, { value: store }, createElement(SlideView, { deck, slide: slideA, scale: 1, mode: "edit", labels: LABELS })),
  );
  expect(html).toMatch(/data-el-id="txt1"[^>]*transform:translate\(11px, 22px\) rotate\(5deg\)/);
  expect(html).toMatch(/data-el-id="txt1"[^>]*width:33px;height:44px/);
  // A moved line keeps its shape: +100 pt on x, wrapper padded by 6 pt.
  expect(html).toMatch(/data-el-id="ln1"[^>]*translate\(104px, 14px\)/);
  expect(render({ mode: "edit" })).toMatch(/data-el-id="txt1"[^>]*translate\(40px, 50px\) rotate\(15deg\)/);
});

test("the scale is a transform on the content box; the outer box takes the scaled size", () => {
  const html = render({ scale: 0.25, mode: "thumb" });
  expect(html).toContain("width:240px;height:135px");
  expect(html).toMatch(/dir="ltr" style="[^"]*transform:scale\(0\.25\)/);
  expect(render({ scale: 1 })).not.toMatch(/dir="ltr" style="[^"]*transform:scale\(/);
});

test("SLIDE_TEXT_CLASS is a class list, not CSS", () => {
  expect(SLIDE_TEXT_CLASS).not.toContain(";");
  expect(SLIDE_TEXT_CLASS).not.toContain("{");
  expect(render()).toContain(SLIDE_TEXT_CLASS.split(" ")[0]);
});
