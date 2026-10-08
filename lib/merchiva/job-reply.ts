/**
 * A background job's reply, laid over its bubble once the job is done. Pure.
 *
 * The bubble may be a placeholder saved mid-reply and restored from history,
 * and every restored message comes back `executed` (the chat's
 * parseSessionMessages), which keeps its cards from running on their own. A
 * job's reply is finished once (ai_job.consumed, and the chat's set of
 * finalized jobs), so its cards are always fresh: they run as their gate says,
 * like those of a reply that arrived in this session.
 */

import type { ChatMessage } from "@/lib/merchiva/skills/types";

export function finishJobMessage(message: ChatMessage, reply: Partial<ChatMessage>): ChatMessage {
  return { ...message, ...reply, executed: false };
}
