/**
 * Plain text → editor JSON (docs-editor-ui spec §6.4): blank lines separate paragraphs, single newlines become hard
 * breaks. Built directly as JSON, no HTML involved. Pure, so it runs under Bun tests.
 */
import type { JSONContent } from "@tiptap/core";

export function textToDocJson(text: string): JSONContent {
  const normalized = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const blocks = normalized
    .split(/\n[ \t\f\v]*\n+/)
    .map((block) => block.replace(/^\n+|\n+$/g, ""))
    .filter((block) => block.trim().length > 0);

  const content: JSONContent[] = blocks.map((block) => {
    const inline: JSONContent[] = [];
    block.split("\n").forEach((line, index) => {
      if (index > 0) inline.push({ type: "hardBreak" });
      if (line) inline.push({ type: "text", text: line });
    });
    return inline.length > 0 ? { type: "paragraph", content: inline } : { type: "paragraph" };
  });

  return { type: "doc", content: content.length > 0 ? content : [{ type: "paragraph" }] };
}
