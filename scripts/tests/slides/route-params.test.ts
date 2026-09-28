// The Slides route reads back exactly what slidesHref writes (slides.md §12.1, S13 "round-trip slidesHref(…)").
import { describe, expect, test } from "bun:test";

import { readSlidesLinkParams } from "@/components/slides/editor/slides-editor-route";
import { parseEditorHref, slidesHref } from "@/lib/drive/hrefs";

const ID = "d1d1d1d1-0000-4000-8000-000000000001";
const VERSION = "22222222-2222-4222-8222-222222222222";
const read = (href: string) => readSlidesLinkParams(new URLSearchParams(href.slice(href.indexOf("?") + 1)));

describe("slides link parameters", () => {
  test("every combination slidesHref writes is read back", () => {
    for (const slide of [undefined, "slideC", "Ab_09"]) {
      for (const version of [undefined, VERSION]) {
        for (const present of [undefined, false, true]) {
          for (const isNew of [undefined, false, true]) {
            const href = slidesHref(ID, { slide, version, present, isNew });
            expect(parseEditorHref(href)).toEqual({ kind: "slides", id: ID });
            expect(read(href)).toEqual({ slide: slide ?? null, version: version ?? null, present: present === true, isNew: isNew === true });
          }
        }
      }
    }
  });

  test("a bare link asks for nothing", () => {
    expect(read(slidesHref(ID))).toEqual({ slide: null, version: null, present: false, isNew: false });
  });

  test("malformed values are ignored, not passed on", () => {
    expect(read("/x?id=1&slide=%3Cimg%3E&present=true&new=yes")).toEqual({ slide: null, version: null, present: false, isNew: false });
    expect(read(`/x?id=1&slide=${"a".repeat(41)}`).slide).toBeNull();
    expect(read(`/x?id=1&version=${"v".repeat(65)}`).version).toBeNull();
    expect(read("/x?id=1&version=%20%20").version).toBeNull();
  });
});
