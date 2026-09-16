/**
 * Markdown → HTML with marked (GFM: tables, strikethrough, task lists). Loaded on demand by `importFile`; the HTML
 * then goes through `prepareImportHtml` (task-list normalisation, DOMPurify, image re-hosting).
 */
import { marked } from "marked";

export function markdownToHtml(markdown: string): string {
  const source = markdown.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  return marked.parse(source, { async: false, gfm: true, breaks: false });
}
