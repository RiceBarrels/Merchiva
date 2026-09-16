/**
 * HTML export (docs-editor-ui spec §6.3): a standalone, self-styled page around Tiptap's own serializer output.
 * The HTML comes from `editor.getHTML()` (schema-rendered, no decorations), so it is not sanitized again;
 * comment spans are unwrapped.
 *
 * The document's own paper size and margins are written as a small override on top of the shared stylesheet, so an
 * exported A4 landscape page opens as one, on screen and on paper.
 */
import { LOCALE_BCP47, isLocale } from "@/lib/i18n/config";
import { pageSizeIn, type DocPageSetup } from "@/lib/docs/page-setup";

import { DOC_EXPORT_CSS } from "./export-css";
import { escapeHtml, stripCommentSpans } from "./utils";

export interface StandaloneHtmlInput {
  title: string;
  html: string;
  locale: string;
  pageSetup: DocPageSetup;
}

/** Paper geometry as CSS, layered after `DOC_EXPORT_CSS` (which carries the typography). */
function pageCss(setup: DocPageSetup): string {
  const size = pageSizeIn(setup);
  const { top, right, bottom, left } = setup.margins;
  return [
    `.doc{max-width:${size.width}in;padding:${top}in ${right}in ${bottom}in ${left}in}`,
    `@media (max-width:${size.width}in){.doc{margin:0;border:0;padding:24px 16px}}`,
    `@media print{@page{size:${size.width}in ${size.height}in;margin:${top}in ${right}in ${bottom}in ${left}in}.doc{max-width:none;margin:0;padding:0;border:0}}`,
  ].join("");
}

function langTag(locale: string): string {
  const tag = isLocale(locale) ? LOCALE_BCP47[locale] : locale;
  return /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(tag) ? tag : "en";
}

export function buildStandaloneHtml({ title, html, locale, pageSetup }: StandaloneHtmlInput): string {
  return [
    "<!doctype html>",
    `<html lang="${escapeHtml(langTag(locale))}" dir="auto">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="generator" content="Merchiva Docs">',
    `<title>${escapeHtml(title)}</title>`,
    `<style>${DOC_EXPORT_CSS}\n${pageCss(pageSetup)}</style>`,
    "</head>",
    "<body>",
    `<article class="doc" dir="auto">${stripCommentSpans(html)}</article>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
