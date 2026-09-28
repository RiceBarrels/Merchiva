/**
 * A reply that comes back with nothing to read. gpt-oss (L1) sometimes ends its tool loop with a
 * step that has no text and finish=stop: it reasoned over the tool results and wrote nothing, and
 * the chat showed the acknowledgment, the tool steps and no answer.
 *
 * /api/store-ai and /api/store-ai/enqueue run each reply through `withBlankRetry`: when the first
 * attempt is blank, the model gets one more turn with everything that attempt fetched (its tool
 * calls and results) and a note that the user has seen nothing yet. A reply that is still blank
 * gets the route's own fallback line (merchiva.errors.chatFallback). Pure apart from the injected
 * `run`.
 */

import type { ModelMessage } from "ai";

/** Nothing a person would read: no text at all, or only whitespace. */
export function isBlankReply(text: string): boolean {
  return text.trim().length === 0;
}

/** Appended to the system prompt for the retry. */
export const BLANK_REPLY_RETRY_NOTE = `

RETRY: Your previous turn ended without writing anything, so the user has not seen an answer yet. The tool calls you made and their results are in the conversation above. Answer the user's message now, in their language. If those results do not contain what the user asked about (for example a filtered list that leaves out the item they mean), call the tool again with the right arguments first, then answer.`;

/** The most steps (tool round trips included) the retry may take. */
export const BLANK_RETRY_MAX_STEPS = 3;

/** An assistant turn that carried nothing: no text and no tool call. */
function isEmptyAssistant(message: ModelMessage): boolean {
  if (message.role !== "assistant") return false;
  if (typeof message.content === "string") return isBlankReply(message.content);
  return !message.content.some((part) => part.type === "tool-call" || (part.type === "text" && !isBlankReply(part.text)));
}

/**
 * The retry's conversation: what the first attempt was sent, then what it produced (its tool
 * calls and their results), minus trailing assistant turns that said nothing — so the retry picks
 * up after the last tool result, as the tool loop itself would.
 */
export function blankRetryMessages(sent: readonly ModelMessage[], produced: readonly ModelMessage[]): ModelMessage[] {
  const tail = [...produced];
  while (tail.length > 0 && isEmptyAssistant(tail[tail.length - 1])) tail.pop();
  return [...sent, ...tail];
}

export interface ReplyAttempt {
  system: string;
  messages: ModelMessage[];
  /** False on the first attempt, true on the retry. */
  retry: boolean;
}

export interface ReplyAttemptResult {
  /** The reply text the attempt produced — not the ack or tool frames. */
  text: string;
  /** What it added to the conversation: the AI SDK result's `response.messages`. */
  messages: readonly ModelMessage[];
}

/**
 * Runs `run` once, and once more when that reply is blank. Says whether it retried and whether
 * the last reply is still blank (the caller then adds its fallback line).
 */
export async function withBlankRetry(
  first: { system: string; messages: ModelMessage[] },
  run: (attempt: ReplyAttempt) => Promise<ReplyAttemptResult>,
): Promise<{ retried: boolean; blank: boolean }> {
  const result = await run({ ...first, retry: false });
  if (!isBlankReply(result.text)) return { retried: false, blank: false };
  const again = await run({
    system: first.system + BLANK_REPLY_RETRY_NOTE,
    messages: blankRetryMessages(first.messages, result.messages),
    retry: true,
  });
  return { retried: true, blank: isBlankReply(again.text) };
}
