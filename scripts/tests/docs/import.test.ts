import { describe, expect, test } from "bun:test";

import {
  DocImportError,
  IMPORT_MAX_BYTES,
  cleanImportTitle,
  detectImportKind,
  importErrorMessageKey,
  importFile,
  titleFromFileName,
  validateImportFile,
} from "@/lib/docs/import";
import { decodeImportText, legacyEncodingsFor, sniffHtmlCharset, sniffUtf16 } from "@/lib/docs/import/decode";
import { createLimiter, dataUrlToBlob, importImageAction } from "@/lib/docs/import/images";
import { markdownToHtml } from "@/lib/docs/import/markdown";
import { textToDocJson } from "@/lib/docs/import/txt";

function fakeFile(name: string, size: number, type = ""): File {
  return { name, size, type } as unknown as File;
}

describe("detectImportKind / validateImportFile", () => {
  test("by extension, case-insensitive", () => {
    expect(detectImportKind(new File(["# hi"], "Notes.MD"))).toBe("md");
    expect(detectImportKind(new File([""], "a.markdown"))).toBe("md");
    expect(detectImportKind(new File([""], "page.HTM"))).toBe("html");
    expect(detectImportKind(new File([""], "report.docx"))).toBe("docx");
    expect(detectImportKind(new File([""], "log.txt"))).toBe("txt");
    expect(detectImportKind(new File([""], "scan.pdf", { type: "text/plain" }))).toBeNull();
  });

  test("MIME fallback only without an extension", () => {
    expect(detectImportKind(new File([""], "README", { type: "text/markdown" }))).toBe("md");
    expect(detectImportKind(new File([""], "README"))).toBeNull();
  });

  test("size before kind", () => {
    expect(validateImportFile(fakeFile("big.txt", IMPORT_MAX_BYTES + 1))).toBe("tooLarge");
    expect(validateImportFile(fakeFile("big.pdf", IMPORT_MAX_BYTES + 1))).toBe("tooLarge");
    expect(validateImportFile(fakeFile("ok.pdf", 10))).toBe("unsupported");
    expect(validateImportFile(fakeFile("ok.html", IMPORT_MAX_BYTES))).toBeNull();
  });

  test("error keys", () => {
    expect(importErrorMessageKey(new DocImportError("tooLarge"))).toBe("docs.import.tooLarge");
    expect(importErrorMessageKey(new DocImportError("unsupported"))).toBe("docs.import.unsupported");
    expect(importErrorMessageKey(new Error("boom"))).toBe("docs.import.failed");
  });

  test("reducer failures use the docs error message for their code", () => {
    // createDocument rejects seeded state above 8 MB, which a file under the 20 MB import limit can reach.
    const tooLarge = new DocImportError("failed", "Document is too large", { docCode: "too_large" });
    expect(tooLarge.docCode).toBe("too_large");
    expect(importErrorMessageKey(tooLarge)).toBe("docs.errors.tooLarge");
    expect(importErrorMessageKey(new Error("[doc.not_published] Docs module is not published"))).toBe("docs.errors.notPublished");
    expect(importErrorMessageKey(new DocImportError("failed", "bad", { docCode: "invalid" }))).toBe("docs.import.failed");
    expect(new DocImportError("failed").docCode).toBeNull();
  });

  test("importFile rejects invalid files before loading converters", async () => {
    const deps = { t: (k: string) => k, uploadImage: async () => "https://x" };
    await expect(importFile(fakeFile("x.pdf", 1), deps)).rejects.toMatchObject({ code: "unsupported" });
    await expect(importFile(fakeFile("x.md", IMPORT_MAX_BYTES + 1), deps)).rejects.toMatchObject({ code: "tooLarge" });
  });

  test("txt import end to end (no DOM needed)", async () => {
    const result = await importFile(new File(["\uFEFFHello\nworld\r\n\r\nSecond"], "Shift notes.txt"), {
      t: (k) => k,
      uploadImage: async () => "https://x",
    });
    expect(result.title).toBe("Shift notes");
    expect(result.warnings).toBe(0);
    expect(result.skippedImages).toBe(0);
    expect(result.json.content?.length).toBe(2);
  });

  test("txt import decodes UTF-16 files (Notepad \"Unicode\")", async () => {
    const bytes = Uint8Array.from([0xff, 0xfe, 0x4f, 0x00, 0x4b, 0x00, 0x0a, 0x00, 0x2d, 0x4e, 0x87, 0x65]);
    const result = await importFile(new File([bytes], "u16.txt"), { t: (k) => k, uploadImage: async () => "https://x" });
    expect(result.json.content?.[0]).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: "OK" }, { type: "hardBreak" }, { type: "text", text: "中文" }],
    });
  });
});

describe("decodeImportText", () => {
  const bytes = (...values: number[]) => Uint8Array.from(values);
  const ascii = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));
  const concat = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap((part) => Array.from(part)));
  const GBK_ZHONGWEN = bytes(0xd6, 0xd0, 0xce, 0xc4);
  const BIG5_ZHONGWEN = bytes(0xa4, 0xa4, 0xa4, 0xe5);

  test("UTF-8 with or without a BOM", () => {
    expect(decodeImportText(new TextEncoder().encode("店铺 café"), "txt", { languages: ["zh-CN"] })).toBe("店铺 café");
    expect(decodeImportText(bytes(0xef, 0xbb, 0xbf, 0x41), "md")).toBe("A");
    expect(decodeImportText(new ArrayBuffer(0), "txt")).toBe("");
  });

  test("UTF-16 by BOM, and BOM-less UTF-16 by its NUL pattern", () => {
    expect(decodeImportText(bytes(0xff, 0xfe, 0x48, 0x00, 0x69, 0x00), "txt")).toBe("Hi");
    expect(decodeImportText(bytes(0xfe, 0xff, 0x00, 0x48, 0x00, 0x69), "html")).toBe("Hi");
    expect(sniffUtf16(bytes(0x00, 0x48, 0x00, 0x69, 0x00, 0x21, 0x00, 0x0a))).toBe("utf-16be");
    expect(decodeImportText(bytes(0x48, 0x00, 0x69, 0x00, 0x21, 0x00, 0x0a, 0x00), "txt")).toBe("Hi!\n");
    expect(sniffUtf16(ascii("plain ascii"))).toBeNull();
  });

  test("legacy Chinese files use the user's language", () => {
    expect(decodeImportText(GBK_ZHONGWEN, "txt", { languages: ["zh-CN", "en"] })).toBe("中文");
    expect(decodeImportText(BIG5_ZHONGWEN, "md", { languages: ["zh-TW"] })).toBe("中文");
    expect(decodeImportText(BIG5_ZHONGWEN, "txt", { languages: ["zh-Hant-HK"] })).toBe("中文");
  });

  test("windows-1252 is the last resort", () => {
    expect(decodeImportText(bytes(0x63, 0x61, 0x66, 0xe9), "txt", { languages: ["fr-FR"] })).toBe("café");
    expect(decodeImportText(bytes(0x63, 0x61, 0x66, 0xe9), "txt", { languages: [] })).toBe("café");
  });

  test("HTML follows its declared charset", () => {
    const word = concat(ascii('<html><head><meta http-equiv=Content-Type content="text/html; charset=windows-1252"></head><body>caf'), bytes(0xe9), ascii("</body></html>"));
    expect(sniffHtmlCharset(word)).toBe("windows-1252");
    expect(decodeImportText(word, "html", { languages: ["zh-CN"] })).toContain("<body>café</body>");
    const gb = concat(ascii('<meta charset="gb2312"><p>'), GBK_ZHONGWEN, ascii("</p>"));
    expect(decodeImportText(gb, "html", { languages: ["en"] })).toBe('<meta charset="gb2312"><p>中文</p>');
    expect(sniffHtmlCharset(ascii('<meta charset="utf-16">'))).toBe("utf-8");
    expect(sniffHtmlCharset(ascii('<meta charset="no-such-charset">'))).toBeNull();
    expect(sniffHtmlCharset(ascii('<?xml version="1.0" encoding="Big5"?><html></html>'))).toBe("big5");
  });

  test("legacyEncodingsFor", () => {
    expect(legacyEncodingsFor(["zh-CN", "en-US"])).toEqual(["gb18030", "big5", "windows-1252"]);
    expect(legacyEncodingsFor(["zh_TW"])).toEqual(["big5", "gb18030", "windows-1252"]);
    expect(legacyEncodingsFor(["ar-SA", "ja"])).toEqual(["windows-1256", "shift_jis", "euc-jp", "windows-1252"]);
    expect(legacyEncodingsFor([])).toEqual(["windows-1252"]);
  });
});

describe("importImageAction", () => {
  test("linked, uploaded, dropped and counted, dropped by the converter", () => {
    expect(importImageAction("https://cdn.example/a.png", false)).toBe("keep");
    expect(importImageAction(" HTTP://cdn.example/a.png", true)).toBe("keep");
    expect(importImageAction("data:image/png;base64,aGk=", false)).toBe("upload");
    // DOMPurify strips relative, file: and blob: sources, leaving an empty src that must still be counted.
    expect(importImageAction("", false)).toBe("skip");
    expect(importImageAction("images/floorplan.png", false)).toBe("skip");
    expect(importImageAction("data:text/html,hi", false)).toBe("skip");
    // The .docx reader counts its own failed image uploads.
    expect(importImageAction("", true)).toBe("dropCounted");
  });
});

describe("titles", () => {
  test("file names", () => {
    expect(titleFromFileName("Q3 plan.final.docx")).toBe("Q3 plan.final");
    expect(titleFromFileName("C:\\Users\\me\\店铺  手册.md")).toBe("店铺 手册");
    expect(titleFromFileName(".env")).toBe(".env");
  });

  test("cleaning", () => {
    expect(cleanImportTitle("  a \n b  ")).toBe("a b");
    expect(cleanImportTitle("y".repeat(250)).length).toBe(200);
  });
});

describe("textToDocJson", () => {
  test("blank lines split paragraphs; single newlines are hard breaks", () => {
    expect(textToDocJson("\uFEFFLine 1\nLine 2\r\n\r\n\r\nPara 2\n")).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Line 1" }, { type: "hardBreak" }, { type: "text", text: "Line 2" }] },
        { type: "paragraph", content: [{ type: "text", text: "Para 2" }] },
      ],
    });
  });

  test("empty and whitespace-only input give one empty paragraph", () => {
    expect(textToDocJson("")).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
    expect(textToDocJson(" \n\n \t\n")).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });

  test("no empty text nodes around consecutive newlines", () => {
    const json = textToDocJson("a\n\tb");
    expect(json.content?.[0].content).toEqual([{ type: "text", text: "a" }, { type: "hardBreak" }, { type: "text", text: "\tb" }]);
  });
});

describe("markdownToHtml", () => {
  test("GFM tables, strikethrough and task lists", () => {
    const html = markdownToHtml("# Title\n\n- [x] done\n- [ ] todo\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n~~old~~");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toMatch(/<input[^>]*checked[^>]*type="checkbox"|<input[^>]*type="checkbox"[^>]*checked/);
    expect(html).toContain("<table>");
    expect(html).toContain("<del>old</del>");
  });
});

describe("image helpers", () => {
  test("dataUrlToBlob", async () => {
    const blob = dataUrlToBlob("data:image/png;base64,aGVsbG8=");
    expect(blob?.type).toBe("image/png");
    expect(await blob?.text()).toBe("hello");
    const text = dataUrlToBlob("data:text/plain,hi%20there");
    expect(text?.type.startsWith("text/plain")).toBe(true);
    expect(await text?.text()).toBe("hi there");
    expect(dataUrlToBlob("https://example.com/a.png")).toBeNull();
  });

  test("createLimiter caps concurrency", async () => {
    const limit = createLimiter(2);
    let active = 0;
    let peak = 0;
    const task = () =>
      limit(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return active;
      });
    await Promise.all(Array.from({ length: 7 }, task));
    expect(peak).toBe(2);
    await expect(limit(async () => Promise.reject(new Error("x")))).rejects.toThrow("x");
  });
});
