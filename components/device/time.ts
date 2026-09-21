"use client";

const pad = (n: number) => String(n).padStart(2, "0");

// Lives in lib/ so manager pages can read a live clock too; re-exported here
// because every device surface already imports it from this module.
export { useNow } from "@/lib/use-now";

/** "9:41" (12h, no leading zero) — status strip. */
export function fmtStatusClock(d: Date): string {
  const h = d.getHours();
  return `${h % 12 || 12}:${pad(d.getMinutes())}`;
}

/** "04:41" (12h, zero padded) — big idle / clock page. */
export function fmtBigClock(d: Date): string {
  const h = d.getHours();
  return `${pad(h % 12 || 12)}:${pad(d.getMinutes())}`;
}

/** "PM · Thu 11 Sep" */
export function fmtBigDate(d: Date, locale?: string): string {
  const ampm = d.getHours() < 12 ? "AM" : "PM";
  return `${ampm} · ${d.toLocaleDateString(locale ?? "en-GB", { weekday: "short", day: "2-digit", month: "short" })}`;
}

/** "07:00" 24h */
export function fmtHM(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "2h 05m" */
export function fmtDurationHM(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60000));
  return `${Math.floor(m / 60)}h ${pad(m % 60)}m`;
}

/** "02:03:41" */
export function fmtDurationHMS(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** "00:07" mm:ss for recordings */
export function fmtMMSS(sec: number): string {
  return `${pad(Math.floor(sec / 60))}:${pad(Math.floor(sec % 60))}`;
}

export function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "?";
}

/** "Muheng F." */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}
