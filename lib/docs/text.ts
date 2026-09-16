// Plain-text helpers shared by the editor, compaction and the docs home.
// Word counts are computed on the client and passed to reducers (plan D42);
// the server never counts words.

import type { DocTextStats } from "./types";

export const DOC_EXCERPT_MAX = 280;

/**
 * Card / search excerpt. MUST stay identical to `docExcerpt` in
 * spacetimedb/src/index.ts — scripts/tests/docs/text.test.ts checks parity.
 */
export function docExcerpt(plainText: string): string {
  return plainText.replace(/\s+/g, " ").trim().slice(0, DOC_EXCERPT_MAX);
}

interface WordSegment { readonly segment: string; readonly isWordLike?: boolean }
interface TextSegmenter { segment(input: string): Iterable<WordSegment> }

let wordSegmenter: TextSegmenter | null | undefined;
let graphemeSegmenter: TextSegmenter | null | undefined;

function makeSegmenter(granularity: "word" | "grapheme"): TextSegmenter | null {
  try {
    if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
      return new Intl.Segmenter(undefined, { granularity });
    }
  } catch {
    // Some WebViews ship the constructor without ICU data.
  }
  return null;
}

// Hiragana, Katakana, CJK ideographs (incl. extension A and compatibility).
// These scripts don't separate words with spaces, so the fallback counts each
// character as a word. Hangul is space-delimited and counted like Latin text.
const CJK_CHAR_RE = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/g;
const HAS_WORD_CHAR_RE = /[\p{L}\p{N}]/u;

/** Word count without Intl.Segmenter: CJK characters individually + whitespace-split tokens that contain a letter or digit. */
export function docWordCountFallback(text: string): number {
  if (!text) return 0;
  const cjk = text.match(CJK_CHAR_RE)?.length ?? 0;
  let words = 0;
  for (const token of text.replace(CJK_CHAR_RE, " ").split(/\s+/)) {
    if (token && HAS_WORD_CHAR_RE.test(token)) words++;
  }
  return cjk + words;
}

/**
 * Locale-aware word count over Intl.Segmenter word segments, with a CJK-aware
 * fallback. A segment counts when it is `isWordLike` or contains a letter or
 * digit: JavaScriptCore (Safari, iOS WebViews) reports numbers such as "42" or
 * "3.14" as not word-like while V8 does, and every device must agree.
 */
export function docWordCount(text: string): number {
  if (!text) return 0;
  if (wordSegmenter === undefined) wordSegmenter = makeSegmenter("word");
  if (!wordSegmenter) return docWordCountFallback(text);
  let count = 0;
  for (const segment of wordSegmenter.segment(text)) {
    if (segment.isWordLike || HAS_WORD_CHAR_RE.test(segment.segment)) count++;
  }
  return count;
}

function graphemeCount(text: string): number {
  if (!text) return 0;
  if (graphemeSegmenter === undefined) graphemeSegmenter = makeSegmenter("grapheme");
  if (!graphemeSegmenter) return Array.from(text).length;
  let count = 0;
  for (const segment of graphemeSegmenter.segment(text)) {
    void segment;
    count++;
  }
  return count;
}

/**
 * Word-count dialog figures for `editor.getText()` output. Line breaks are
 * block separators, not characters; "characters" counts user-perceived
 * characters (an emoji with a skin tone is one).
 */
export function docTextStats(text: string): DocTextStats {
  const body = text.replace(/[\r\n]+/g, "");
  return {
    words: docWordCount(text),
    characters: graphemeCount(body),
    charactersNoSpaces: graphemeCount(body.replace(/\s+/g, "")),
  };
}
