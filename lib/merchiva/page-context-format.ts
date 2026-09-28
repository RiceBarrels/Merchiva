/*
 * Sentence and param helpers shared by the page-context builders (data-page-context.ts,
 * workspace-page-context.ts). A builder names the facts that hold on screen; these join them into
 * the one short sentence the model reads and drop the params that are not set.
 */

import type { MerchivaPageContext, PageContextValue } from "@/lib/merchiva/page-context";

/** A record the page has open: its row id and the name it shows. */
export interface PageRecord {
  id: string;
  name: string;
}

/** A period the page filters by, as calendar-day keys (both ends included). */
export interface DayRange {
  from: string;
  to: string;
}

const NAME_MAX = 80;

export function text(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/** A record's name, cut to fit the summary. */
export function clip(value: string): string {
  const clean = text(value);
  return clean.length > NAME_MAX ? `${clean.slice(0, NAME_MAX - 1)}…` : clean;
}

/** The parts that are set, as one sentence. */
export function sentence(parts: ReadonlyArray<string | false | null | undefined>): string {
  const kept = parts.filter((part): part is string => typeof part === "string" && part !== "");
  return kept.length > 0 ? `${kept.join(", ")}.` : "";
}

export function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function quoted(value: string): string {
  return `"${value}"`;
}

export function span(range: DayRange): string {
  return range.from === range.to ? range.from : `${range.from} to ${range.to}`;
}

/** The summary plus the params that hold: empty strings, nulls and undefined are left out. */
export function pageContext(summary: string, params: Record<string, PageContextValue | undefined>): MerchivaPageContext {
  const kept: Record<string, PageContextValue> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    kept[key] = value;
  }
  return { summary, params: kept };
}
