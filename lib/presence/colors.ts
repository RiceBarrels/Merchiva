import { fnv1a } from "./hash";

/**
 * Per-member presence colours (design-system/README.md §2 "Presence colors"): Docs editor carets and
 * selections, the live cursors and click rings on /manager pages, and the ring around presence avatars.
 * 8 muted hues taken from families the app already uses — status tones and the chart blue ramp. They are
 * the only per-person hue in the product: Mr. Merchiva's cursor is neutral, and everything else in the UI
 * stays neutral too.
 *
 * lib/docs/colors.ts re-exports these, so an editor caret and a page cursor of the same person match.
 */

export const PRESENCE_COLORS = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#dc2626",
  "#0284c7",
  "#1f3fad",
  "#57534e",
  "#047857",
] as const;

export type PresenceColor = (typeof PRESENCE_COLORS)[number];

/** Stable collaborator colour for an org member id (same on every device). */
export function colorForMember(memberId: string | null | undefined): PresenceColor {
  if (!memberId) return PRESENCE_COLORS[6];
  return PRESENCE_COLORS[fnv1a(memberId) % PRESENCE_COLORS.length];
}
