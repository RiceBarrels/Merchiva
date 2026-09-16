import { describe, expect, test } from "bun:test";
import type { JSONContent } from "@tiptap/core";
import JSZip from "jszip";
import mammoth from "mammoth";

import { pmJsonToDocx } from "@/lib/docs/export/docx";
import { defaultPageSetup } from "@/lib/docs/page-setup";
import { buildStandaloneHtml } from "@/lib/docs/export/html";
import type { DocxImage } from "@/lib/docs/export/images";
import { sniffDocxImageType } from "@/lib/docs/export/images";
import { htmlToMarkdown } from "@/lib/docs/export/markdown";
import { escapeHtml, exportFilename } from "@/lib/docs/export/utils";

// 1×1 transparent PNG.
const PNG_1X1 = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);

describe("exportFilename", () => {
  test("keeps CJK and strips forbidden characters", () => {
    expect(exportFilename("店铺 交接/班:记录?", "docx", "Untitled document")).toBe("店铺 交接班记录.docx");
    expect(exportFilename("مستند <التقرير>", "md", "Untitled")).toBe("مستند التقرير.md");
  });

  test("falls back to the untitled label and trims trailing dots", () => {
    expect(exportFilename("   ", "txt", "Untitled document")).toBe("Untitled document.txt");
    expect(exportFilename("Report...", ".pdf", "Untitled")).toBe("Report.pdf");
    expect(exportFilename("", "html", "")).toBe("document.html");
  });

  test("caps the base name at 120 characters", () => {
    const name = exportFilename("x".repeat(300), "md", "Untitled");
    expect(name).toBe(`${"x".repeat(120)}.md`);
  });
});

describe("standalone HTML", () => {
  test("escapes the title and sets lang", () => {
    const html = buildStandaloneHtml({ title: `<b>"Q3" & more</b>`, html: "<p>Hi</p>", locale: "zh-cn", pageSetup: defaultPageSetup("zh-cn") });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>&lt;b&gt;&quot;Q3&quot; &amp; more&lt;/b&gt;</title>");
    expect(html).toMatch(/<html lang="zh-CN" dir="auto">/);
    expect(html).toContain('<article class="doc" dir="auto"><p>Hi</p></article>');
  });

  test("escapeHtml covers attribute quotes", () => {
    expect(escapeHtml(`a'b"c<d>&`)).toBe("a&#39;b&quot;c&lt;d&gt;&amp;");
  });
});

describe("htmlToMarkdown", () => {
  test("headings, marks and title paragraphs", () => {
    const md = htmlToMarkdown(
      '<p data-doc-style="title">Plan</p><h2>Heading</h2><p>Some <strong>bold</strong>, <em>italic</em> and <s>gone</s> text.</p>',
    );
    expect(md).toContain("# Plan");
    expect(md).toContain("## Heading");
    expect(md).toContain("**bold**");
    expect(md).toContain("*italic*");
    expect(md).toContain("~gone~");
  });

  test("tight nested lists", () => {
    const md = htmlToMarkdown(
      "<ul><li><p>One</p><ul><li><p>Nested</p></li></ul></li><li><p>Two</p></li></ul><ol><li><p>First</p></li><li><p>Second</p></li></ol>",
    );
    expect(md).toContain("- One\n  - Nested\n- Two");
    expect(md).toContain("1. First\n2. Second");
  });

  test("task lists from Tiptap markup, including nested lists", () => {
    const md = htmlToMarkdown(
      '<ul data-type="taskList">' +
        '<li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked="checked"><span></span></label><div><p>Done</p></div></li>' +
        '<li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>Todo</p>' +
        '<ul data-type="taskList"><li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>Sub</p></div></li></ul>' +
        "</div></li></ul>",
    );
    expect(md).toContain("- [x] Done\n- [ ] Todo\n  - [ ] Sub");
  });

  test("GFM table with header row; pipes escaped", () => {
    const md = htmlToMarkdown(
      '<table><colgroup><col style="min-width: 48px"><col style="min-width: 48px"></colgroup><tbody>' +
        '<tr><th colspan="1" rowspan="1"><p>Task</p></th><th colspan="1" rowspan="1"><p>Mon</p></th></tr>' +
        '<tr><td colspan="1" rowspan="1"><p>Count | cash</p></td><td colspan="1" rowspan="1"><p>Yes</p></td></tr>' +
        "</tbody></table>",
    );
    expect(md).toContain("| Task | Mon |");
    expect(md).toMatch(/\| -+ \| -+ \|/);
    expect(md).toContain("| Count \\| cash | Yes |");
  });

  test("page breaks and comment spans", () => {
    const md = htmlToMarkdown(
      '<p>A</p><div data-page-break="" class="doc-page-break"></div><p><span data-comment-thread="t1">quoted</span> text</p>',
    );
    expect(md).toBe("A\n\nquoted text\n");
  });
});

const IMAGE_OK = "https://cdn.example/ok.png";
const IMAGE_BROKEN = "https://cdn.example/broken.png";

const FIXTURE: JSONContent = {
  type: "doc",
  content: [
    { type: "paragraph", attrs: { docStyle: "title" }, content: [{ type: "text", text: "Shift handover" }] },
    { type: "paragraph", attrs: { docStyle: "subtitle" }, content: [{ type: "text", text: "Evening" }] },
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Done this shift" }] },
    {
      type: "paragraph",
      attrs: { textAlign: "center", indent: 2, lineSpacing: "1.5" },
      content: [
        { type: "text", text: "Bold", marks: [{ type: "bold" }] },
        { type: "text", text: " link", marks: [{ type: "link", attrs: { href: "https://merchiva.com/docs" } }] },
        { type: "hardBreak" },
        {
          type: "text",
          text: "red",
          marks: [
            { type: "textStyle", attrs: { color: "#dc2626", fontSize: "14pt", fontFamily: "Georgia, serif" } },
            { type: "highlight", attrs: { color: "#fef3c7" } },
            { type: "comment", attrs: { threadId: "3f0a1c2e-1111-4222-8333-444455556666" } },
          ],
        },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "One" }] },
            { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Nested" }] }] }] },
          ],
        },
      ],
    },
    { type: "orderedList", attrs: { start: 1 }, content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "First" }] }] }] },
    {
      type: "taskList",
      content: [
        { type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "Cash counted" }] }] },
        { type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph", content: [{ type: "text", text: "Keys handed over" }] }] },
      ],
    },
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableHeader", attrs: { colspan: 1, rowspan: 1, colwidth: [120] }, content: [{ type: "paragraph", content: [{ type: "text", text: "Task" }] }] },
            { type: "tableHeader", attrs: { colspan: 1, rowspan: 1, colwidth: [200] }, content: [{ type: "paragraph", content: [{ type: "text", text: "Mon" }] }] },
          ],
        },
        {
          type: "tableRow",
          content: [{ type: "tableCell", attrs: { colspan: 2, rowspan: 1, colwidth: null }, content: [{ type: "paragraph", content: [{ type: "text", text: "Merged" }] }] }],
        },
      ],
    },
    { type: "image", attrs: { src: IMAGE_OK, width: 1200 } },
    { type: "image", attrs: { src: IMAGE_BROKEN } },
    { type: "horizontalRule" },
    { type: "pageBreak" },
    { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "Quoted words" }] }] },
    { type: "codeBlock", attrs: { language: null }, content: [{ type: "text", text: "line1\nline2" }] },
    { type: "paragraph", content: [{ type: "text", text: "مرحبا بالعالم" }] },
    { type: "paragraph" },
  ],
};

async function exportFixture() {
  const fetched: string[] = [];
  const { blob, skippedImages } = await pmJsonToDocx(FIXTURE, {
    title: "Shift handover",
    pageSetup: defaultPageSetup("en"),
    imageLabel: "[image]",
    fetchImage: async (src): Promise<DocxImage | null> => {
      fetched.push(src);
      if (src !== IMAGE_OK) return null;
      return { data: PNG_1X1.buffer.slice(0) as ArrayBuffer, type: "png", width: 800, height: 600 };
    },
  });
  const buffer = await blob.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const read = async (path: string) => (await zip.file(path)?.async("string")) ?? "";
  return { buffer, zip, skippedImages, fetched, document: await read("word/document.xml"), rels: await read("word/_rels/document.xml.rels"), numbering: await read("word/numbering.xml"), styles: await read("word/styles.xml") };
}

describe("pmJsonToDocx", () => {
  test("produces a valid package with every block type", async () => {
    const out = await exportFixture();
    expect(out.fetched.sort()).toEqual([IMAGE_BROKEN, IMAGE_OK]);
    expect(out.skippedImages).toBe(1);

    const xml = out.document;
    for (const text of ["Shift handover", "Evening", "Done this shift", "One", "Nested", "First", "Cash counted", "Keys handed over", "Task", "Merged", "Quoted words", "line1", "line2", "مرحبا بالعالم", "[image]"]) {
      expect(xml).toContain(text);
    }
    expect(xml).toContain('w:pStyle w:val="Title"');
    expect(xml).toContain('w:pStyle w:val="Subtitle"');
    expect(xml).toContain('w:pStyle w:val="Heading2"');
    expect(xml).toContain('w:jc w:val="center"');
    expect(xml).toMatch(/w:line="360"/);
    expect(xml).toMatch(/w:ind w:left="1440"/);
    expect((xml.match(/<w:numPr>/g) ?? []).length).toBe(3);
    expect(xml).toContain('w:ilvl w:val="1"');
    // Checkbox content controls: checked ☒ (2612) and unchecked ☐ (2610).
    expect(xml).toContain("w:sdt");
    expect(xml).toContain('w14:checked w14:val="1"');
    expect(xml).toContain('w14:checked w14:val="0"');
    expect(xml).toContain('w:sym w:char="2612"');
    expect(xml).toContain('w:sym w:char="2610"');
    expect(xml).toContain("<w:tbl>");
    // colwidth 120px + 200px → 1800 + 3000 twips; the table is as wide as its columns.
    expect(xml).toContain('w:tblW w:type="dxa" w:w="4800"');
    expect(xml).toContain('w:gridSpan w:val="2"');
    expect(xml).toContain("<w:tblHeader");
    expect(xml).toContain('w:type="page"');
    expect(xml).toContain("<w:hyperlink");
    expect(xml).toContain('w:color w:val="DC2626"');
    expect(xml).toContain('w:sz w:val="28"');
    expect(xml).toContain('w:ascii="Georgia"');
    expect(xml).toContain('w:fill="FEF3C7"');
    expect(xml).toContain("<w:bidi");
    // 1200px requested → clamped to 624px of text width (6.5in) → 624 × 9525 EMU.
    expect(xml).toContain('cx="5943600"');
    expect(xml).not.toContain("data-comment-thread");

    expect(out.rels).toContain("https://merchiva.com/docs");
    expect(out.rels).toContain(IMAGE_BROKEN);
    expect(Object.keys(out.zip.files).some((path) => path.startsWith("word/media/"))).toBe(true);
    expect(out.numbering).toContain('w:numFmt w:val="bullet"');
    expect(out.numbering).toContain('w:numFmt w:val="decimal"');
    expect(out.styles).toContain('w:styleId="Subtitle"');
  });

  test("round-trips through mammoth", async () => {
    const { buffer } = await exportFixture();
    const result = await mammoth.convertToHtml({ buffer: Buffer.from(buffer) });
    expect(result.value).toContain("Done this shift");
    expect(result.value).toContain("<table>");
    expect(result.value).toContain("Cash counted");
    expect(result.value).toContain('href="https://merchiva.com/docs"');
  });

  test("an empty document still packs", async () => {
    const { blob, skippedImages } = await pmJsonToDocx({ type: "doc", content: [] }, { title: "Empty", pageSetup: defaultPageSetup("fr"), fetchImage: async () => null });
    expect(skippedImages).toBe(0);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
    expect(xml).toContain('w:w="11906"');
  });
});

describe("pmJsonToDocx numbering", () => {
  const para = (text: string): JSONContent => ({ type: "paragraph", content: [{ type: "text", text }] });
  const ordered = (start: number, ...items: string[]): JSONContent => ({
    type: "orderedList",
    attrs: { start },
    content: items.map((text) => ({ type: "listItem", content: [para(text)] })),
  });

  async function numberingOf(json: JSONContent) {
    const { blob } = await pmJsonToDocx(json, { title: "Lists", pageSetup: defaultPageSetup("en"), fetchImage: async () => null });
    const buffer = await blob.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);
    const document = (await zip.file("word/document.xml")?.async("string")) ?? "";
    const numbering = (await zip.file("word/numbering.xml")?.async("string")) ?? "";
    const paragraphs = new Map<string, { ilvl: number; numId: string }>();
    for (const match of document.matchAll(/<w:p>(.*?)<\/w:p>/gs)) {
      const text = [...match[1].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((t) => t[1]).join("");
      const numId = /<w:numId w:val="(\d+)"\/>/.exec(match[1])?.[1];
      if (text && numId) paragraphs.set(text, { ilvl: Number(/<w:ilvl w:val="(\d+)"\/>/.exec(match[1])?.[1]), numId });
    }
    const nums = new Map<string, { abstractId: string; startOverride: number | null }>();
    for (const match of numbering.matchAll(/<w:num w:numId="(\d+)">(.*?)<\/w:num>/gs)) {
      const override = /<w:lvlOverride w:ilvl="0"><w:startOverride w:val="(\d+)"\/>/.exec(match[2]);
      nums.set(match[1], { abstractId: /<w:abstractNumId w:val="(\d+)"\/>/.exec(match[2])?.[1] ?? "", startOverride: override ? Number(override[1]) : null });
    }
    const levelStart = (abstractId: string, ilvl: number): number | null => {
      const abstract = new RegExp(`<w:abstractNum w:abstractNumId="${abstractId}"[^>]*>(.*?)</w:abstractNum>`, "s").exec(numbering)?.[1] ?? "";
      const start = new RegExp(`<w:lvl w:ilvl="${ilvl}"[^>]*><w:start w:val="(\\d+)"/>`).exec(abstract);
      return start ? Number(start[1]) : null;
    };
    return { buffer, paragraphs, nums, levelStart };
  }

  test("numbered sublists under different bullet items count separately", async () => {
    const out = await numberingOf({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [para("A"), ordered(1, "x", "y")] },
            { type: "listItem", content: [para("B"), ordered(1, "z")] },
          ],
        },
      ],
    });
    const [a, x, y, b, z] = ["A", "x", "y", "B", "z"].map((text) => out.paragraphs.get(text));
    expect(a?.ilvl).toBe(0);
    expect(b?.numId).toBe(a?.numId);
    expect(x?.ilvl).toBe(1);
    expect(y?.numId).toBe(x?.numId);
    expect(z?.ilvl).toBe(1);
    // Separate instances of separate definitions: Word can't continue x, y into z.
    expect(z?.numId).not.toBe(x?.numId);
    const xNum = out.nums.get(x?.numId ?? "");
    const zNum = out.nums.get(z?.numId ?? "");
    expect(zNum?.abstractId).not.toBe(xNum?.abstractId);
    expect(out.levelStart(zNum?.abstractId ?? "", 1)).toBe(1);

    const html = (await mammoth.convertToHtml({ buffer: Buffer.from(out.buffer) })).value;
    expect(html).toBe("<ul><li>A<ol><li>x</li><li>y</li></ol></li><li>B<ol><li>z</li></ol></li></ul>");
  });

  test("ordered lists keep their start number, top level and nested", async () => {
    const out = await numberingOf({
      type: "doc",
      content: [
        ordered(1, "one"),
        ordered(5, "five", "six"),
        ordered(5, "again"),
        { type: "orderedList", attrs: { start: 1 }, content: [{ type: "listItem", content: [para("parent"), ordered(3, "third")] }] },
      ],
    });
    const numOf = (text: string) => out.nums.get(out.paragraphs.get(text)?.numId ?? "");
    expect(numOf("one")?.startOverride).toBe(1);
    expect(numOf("five")?.startOverride).toBe(5);
    expect(out.paragraphs.get("six")?.numId).toBe(out.paragraphs.get("five")?.numId);
    // A second list starting at 5 restarts at 5 on its own instance.
    expect(out.paragraphs.get("again")?.numId).not.toBe(out.paragraphs.get("five")?.numId);
    expect(numOf("again")?.startOverride).toBe(5);
    expect(out.paragraphs.get("third")?.ilvl).toBe(1);
    expect(out.levelStart(numOf("third")?.abstractId ?? "", 1)).toBe(3);
  });
});

describe("sniffDocxImageType", () => {
  test("detects formats by magic number", () => {
    expect(sniffDocxImageType(PNG_1X1)).toBe("png");
    expect(sniffDocxImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
    expect(sniffDocxImageType(new TextEncoder().encode("GIF89a"))).toBe("gif");
    expect(sniffDocxImageType(Uint8Array.from([0x52, 0x49, 0x46, 0x46]))).toBeNull();
  });
});
