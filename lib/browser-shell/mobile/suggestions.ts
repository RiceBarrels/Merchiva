import type { AppIcon } from "@/components/device/app-icons";
import { canonicalizeUrl } from "../url";
import type { TabUrl } from "../types";
import { matchStrength } from "./labels";

/*
 * Search sheet suggestions (mobile-safari spec §12). Pure ranking so it can be unit tested:
 * prefix > word start > substring; a title match beats a keyword/path match. Candidates that
 * point at the same URL collapse into one row, and an open tab always wins that collapse so
 * the row switches to the tab instead of loading the page twice.
 */

export type SuggestionKind = "tab" | "page" | "document" | "bookmark" | "history";

export interface Suggestion {
  /** Stable React key. */
  readonly key: string;
  readonly kind: SuggestionKind;
  readonly href: TabUrl;
  readonly title: string;
  /** Secondary line (the in-app path, or the parent section for pages). */
  readonly subtitle: string;
  readonly icon: AppIcon;
  /** Set for `kind === "tab"`. */
  readonly tabId: string | null;
  readonly score: number;
}

export const MAX_SUGGESTIONS = 12;

const KIND_ORDER: Readonly<Record<SuggestionKind, number>> = {
  tab: 0,
  page: 1,
  document: 2,
  bookmark: 3,
  history: 4,
};

/** Deterministic base so ranking never depends on `window.location`. */
const KEY_BASE = "http://local/";

/**
 * Score for one candidate: `strength * 10 + 2` for a title match, `strength * 10 + 1` for a
 * keyword / path match (the same scale core's `searchRoutes` uses). 0 means no match.
 */
export function suggestionScore(query: string, title: string, extras: readonly (string | null | undefined)[] = []): number {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return 0;
  const titleStrength = matchStrength(q, title);
  let extraStrength = 0;
  for (const extra of extras) extraStrength = Math.max(extraStrength, matchStrength(q, extra));
  return Math.max(titleStrength > 0 ? titleStrength * 10 + 2 : 0, extraStrength > 0 ? extraStrength * 10 + 1 : 0);
}

function urlKey(href: string): string {
  return canonicalizeUrl(href, KEY_BASE)?.key ?? href;
}

function preferred(candidate: Suggestion, current: Suggestion): boolean {
  if (candidate.kind === "tab" && current.kind !== "tab") return true;
  if (current.kind === "tab" && candidate.kind !== "tab") return false;
  if (candidate.score !== current.score) return candidate.score > current.score;
  return KIND_ORDER[candidate.kind] < KIND_ORDER[current.kind];
}

/** Drops non-matches, collapses duplicates by URL, sorts best first and caps the list. */
export function rankSuggestions(candidates: readonly Suggestion[], limit: number = MAX_SUGGESTIONS): Suggestion[] {
  const byUrl = new Map<string, Suggestion>();
  for (const candidate of candidates) {
    if (candidate.score <= 0) continue;
    const key = urlKey(candidate.href);
    const current = byUrl.get(key);
    if (!current) {
      byUrl.set(key, candidate);
      continue;
    }
    const winner = preferred(candidate, current) ? candidate : current;
    const score = Math.max(candidate.score, current.score);
    byUrl.set(key, winner.score === score ? winner : { ...winner, score });
  }
  return Array.from(byUrl.values())
    .sort(
      (a, b) =>
        b.score - a.score ||
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
        a.title.localeCompare(b.title),
    )
    .slice(0, Math.max(0, limit));
}
