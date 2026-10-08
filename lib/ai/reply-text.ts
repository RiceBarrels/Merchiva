/**
 * Text helpers for Mr. Merchiva replies, shared by /api/store-ai and /api/store-ai/enqueue.
 * Pure: no model or network access.
 */

import { DEFAULT_LOCALE, normalizeLocale } from "@/lib/i18n/config";
import { getDictionary, lookup } from "@/lib/i18n/dictionaries";

export const ACK_OPEN = "[[MERCHIVA_ACK]]";
export const ACK_CLOSE = "[[/MERCHIVA_ACK]]";

/**
 * The acknowledgment wrapped in the sentinel the clients peel into their own bubble. It always
 * leads the reply body; empty when there is no ack.
 */
export function ackSentinel(ack: string): string {
  return ack ? `${ACK_OPEN}${ack}${ACK_CLOSE}` : "";
}

/** Removes ```action``` blocks (closed, truncated, or bare JSON lines) — for spoken replies. */
export function stripActionBlocks(text: string): string {
  let result = text;
  // Closed ```action ... ``` blocks
  result = result.replace(/```action\s*\n?[\s\S]*?```/g, "");
  // Unclosed ```action ... (truncated)
  result = result.replace(/```action\s*\n?[\s\S]*$/, "");
  // Bare JSON action objects on their own line
  result = result.replace(/^\s*\{\s*"action"\s*:[\s\S]*?\}\s*$/gm, "");
  return result.trim();
}

// Auto-batch helper: when a reply is truncated mid-action-block (the model
// hit maxOutputTokens partway through a ```action ... ``` block), trim from
// the last incomplete opener so the bytes we forward to the client still
// parse cleanly. Returns the trimmed text plus a flag for logging.
//
// A trailing ```action block is "incomplete" if EITHER (a) it has no closing
// ``` fence yet, OR (b) the JSON object inside hasn't reached balanced braces.
// The client-side extractActionBlocks parser bails on the first unclosed
// fence and drops everything after it, so without this trim a single truncated
// block would wipe out any actions emitted later (e.g. from a continuation
// batch we concatenate after it).
export function stripIncompleteTrailingAction(text: string): { trimmed: string; stripped: boolean } {
  const lastOpener = text.lastIndexOf("```action");
  if (lastOpener === -1) return { trimmed: text, stripped: false };

  const afterTag = lastOpener + "```action".length;
  const tail = text.slice(afterTag);

  // No closing ``` fence at all — definitely truncated mid-block.
  const closeFenceIdx = tail.indexOf("```");
  if (closeFenceIdx === -1) {
    return { trimmed: text.slice(0, lastOpener).trimEnd(), stripped: true };
  }

  // We have an opener and a closer. Verify the JSON between them is balanced.
  const between = tail.slice(0, closeFenceIdx);
  const openBrace = between.indexOf("{");
  if (openBrace === -1) {
    return { trimmed: text.slice(0, lastOpener).trimEnd(), stripped: true };
  }

  let depth = 0;
  let inString = false;
  let escape = false;
  let complete = false;
  for (let j = openBrace; j < between.length; j++) {
    const ch = between[j];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) { complete = true; break; }
    }
  }

  return complete
    ? { trimmed: text, stripped: false }
    : { trimmed: text.slice(0, lastOpener).trimEnd(), stripped: true };
}

/** The strings the AI routes themselves put in front of a person. */
export type ReplyStringKey =
  | "merchiva.errors.voiceFallback"
  | "merchiva.errors.chatFallback"
  | "merchiva.replyReady.title"
  | "merchiva.replyReady.body";

/**
 * A server-side Mr. Merchiva string in the caller's language, from the same messages/*.json the
 * app renders — so zh-tw and zh-hk get their Traditional text. `lang` is what the client sent:
 * a UI locale ("zh-hk"), a bare language ("zh", the CLI's) or a region tag; anything unknown is
 * English.
 */
export function replyString(lang: string | null | undefined, key: ReplyStringKey): string {
  return lookup(getDictionary(normalizeLocale(lang) ?? DEFAULT_LOCALE), key);
}
