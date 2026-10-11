// Special follow (特别关注): whether a person's row offers the toggle, and which way.
// Pure, so the channel workspace and the /personal directory decide it the same way.
//
// The module (setChatFollow in spacetimedb/src/notify/reducers.ts) refuses to follow
// yourself or anyone who is not an active member of the store, but always lets an
// unfollow through, so someone who has left can still be unfollowed.

export type FollowToggle = "hidden" | "follow" | "unfollow";

export interface FollowToggleInput {
  /** The person on the row (identity hex, any case, optional 0x). */
  readonly targetHex: string | null | undefined;
  /** The viewer's own identities: the person, and the account every write runs as. */
  readonly selfHexes: readonly (string | null | undefined)[];
  /** The person is an active member of the store. */
  readonly activeMember: boolean;
  /** The viewer follows the person now. */
  readonly following: boolean;
  /**
   * Follows can be set here: the viewer's own device or session (never a store
   * machine's PIN operator) and the module's follow table has answered.
   */
  readonly enabled: boolean;
}

/** The lowercase identity hex without a 0x prefix ('' for nothing). */
export function followHex(hex: string | null | undefined): string {
  return typeof hex === "string" ? hex.trim().replace(/^0x/i, "").toLowerCase() : "";
}

/** What a person's row offers: nothing, "follow", or "unfollow". */
export function followToggleFor(input: FollowToggleInput): FollowToggle {
  const target = followHex(input.targetHex);
  if (!input.enabled || !target) return "hidden";
  if (input.selfHexes.some((self) => followHex(self) === target)) return "hidden";
  if (input.following) return "unfollow";
  return input.activeMember ? "follow" : "hidden";
}
