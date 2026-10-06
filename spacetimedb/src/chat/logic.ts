// Pure channel rules shared by ./reducers.ts and the client
// (scripts/tests/chat/logic.test.ts loads this file directly). No SDK imports.

/** Edited message text; the original send path has no cap, edits do. */
export const CHAT_EDIT_MAX_LENGTH = 8000;
export const CHAT_TOPIC_MAX_LENGTH = 250;
/** One emoji can be several code points (skin tone, ZWJ sequences, flags). */
export const CHAT_EMOJI_MAX_LENGTH = 32;
/** Distinct emoji on one message, so a script cannot grow one message without bound. */
export const CHAT_REACTIONS_PER_MESSAGE = 40;

export function chatMemberStateId(conversationId: string, identityHex: string): string {
  return `${conversationId}:${identityHex}`;
}

export function isValidReactionEmoji(emoji: string): boolean {
  return emoji.length > 0 && emoji.length <= CHAT_EMOJI_MAX_LENGTH && !/\s/.test(emoji);
}

/** Only owners and managers create group channels, invite to them, remove from them and set topics. */
export function isChannelManagerRole(role: string): boolean {
  return role === 'owner' || role === 'manager';
}

export interface MentionCandidate {
  /** Identity hex. */
  hex: string;
  name: string;
}

export interface Mentions {
  everyone: boolean;
  /** Identity hexes named with `@Display Name`. */
  users: Set<string>;
}

const MENTION_END = /^($|[\s.,!?;:)\]}'"，。！？；：、）])/;

/**
 * Who a message mentions. The composer inserts `@Display Name ` (names may hold
 * spaces), so a name matches when `@name` is followed by the end, whitespace or
 * punctuation — `@Ann` does not match inside `@Anna`. Each `@` takes the
 * longest name that fits, so `@Ann Lee` names Ann Lee and not also an "Ann".
 * Case-insensitive.
 */
export function chatMentions(content: string, candidates: readonly MentionCandidate[]): Mentions {
  const text = content.toLowerCase();
  const mentions: Mentions = { everyone: false, users: new Set() };
  if (!text.includes('@')) return mentions;
  const names = candidates
    .map((c) => ({ hex: c.hex, name: c.name.trim().toLowerCase() }))
    .filter((c) => c.name)
    .sort((a, b) => b.name.length - a.name.length);
  for (let at = text.indexOf('@'); at >= 0; at = text.indexOf('@', at + 1)) {
    // `mail@everyone.com` is not a mention: the `@` has to start a word.
    if (at > 0 && /[\p{L}\p{N}._-]/u.test(text[at - 1])) continue;
    const rest = text.slice(at + 1);
    if (rest.startsWith('everyone') && MENTION_END.test(rest.slice('everyone'.length))) {
      mentions.everyone = true;
      continue;
    }
    const hit = names.find((c) => rest.startsWith(c.name) && MENTION_END.test(rest.slice(c.name.length)));
    if (!hit) continue;
    // Everyone sharing the longest matching name is named (two "Ann Lee"s).
    for (const c of names) if (c.name === hit.name) mentions.users.add(c.hex);
  }
  return mentions;
}

/**
 * Whether a member gets a notification row for a message. A muted
 * conversation stays quiet except for a mention of that member by name;
 * `@everyone` does not break through a mute.
 */
export function shouldNotifyChatMember(muted: boolean, mentionedByName: boolean): boolean {
  return !muted || mentionedByName;
}
