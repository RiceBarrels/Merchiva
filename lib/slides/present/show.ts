// The state of a running slideshow (slides.md §9): which slide is up, the end screen after the last slide, a black
// or white screen, the digits typed for "go to slide n", and the presenter's timer. Pure: the overlay feeds it key,
// click and swipe actions and deck changes, and the tests drive it the same way.
//
// Rules:
// - Next past the last slide shows the end screen; one more next ends the show. Back from the end screen returns to
//   the last slide.
// - While the screen is black or white, a navigation key only brings the slide back (it does not move).
// - Digits then Enter jump to that slide number (1-based over the shown slides); Backspace deletes a typed digit,
//   else goes back. Any other action forgets the digits.
import { jumpTo, reconcileNav, startIndex, step, type PresenterNav } from "@/lib/slides/present/nav";

export type BlankScreen = "black" | "white";

export interface ShowState {
  nav: PresenterNav;
  /** Past the last slide: the end screen. */
  ended: boolean;
  blank: BlankScreen | null;
  /** Digits typed for "go to slide n" (Enter jumps). */
  digits: string;
  /** The show should close: the host calls onExit. */
  done: boolean;
}

export type ShowAction =
  | { type: "next" }
  | { type: "prev" }
  | { type: "first" }
  | { type: "last" }
  | { type: "goto"; index: number }
  | { type: "digit"; digit: string }
  | { type: "enter" }
  | { type: "backspace" }
  | { type: "blank"; screen: BlankScreen }
  | { type: "exit" }
  | { type: "deck"; order: readonly string[]; all: readonly string[] };

/** At most this many digits are kept (the deck caps at 500 slides). */
const MAX_DIGITS = 4;

export function initShow(order: readonly string[], startSlideId: string | null, all: readonly string[] = order): ShowState {
  return { nav: { order, index: startIndex(order, startSlideId, all) }, ended: false, blank: null, digits: "", done: false };
}

/** The slide on screen; null on the end screen and in an empty show. */
export function showSlideId(s: ShowState): string | null {
  return s.ended ? null : (s.nav.order[s.nav.index] ?? null);
}

function withNav(s: ShowState, nav: PresenterNav): ShowState {
  return nav === s.nav && !s.ended && s.digits === "" ? s : { ...s, nav, ended: false, digits: "" };
}

function next(s: ShowState): ShowState {
  if (s.ended || s.nav.order.length === 0) return { ...s, done: true, digits: "" };
  const moved = step(s.nav, 1);
  return moved === "end" ? { ...s, ended: true, digits: "" } : withNav(s, moved);
}

function prev(s: ShowState): ShowState {
  if (s.ended) return { ...s, ended: false, digits: "" };
  return withNav(s, step(s.nav, -1) as PresenterNav);
}

/** Actions that move the show; while the screen is blank they only bring the slide back. */
const MOVES: ReadonlySet<ShowAction["type"]> = new Set(["next", "prev", "first", "last", "goto", "enter"]);

export function showReducer(s: ShowState, a: ShowAction): ShowState {
  if (s.done) return s;
  if (s.blank !== null && MOVES.has(a.type)) return { ...s, blank: null, digits: "" };
  switch (a.type) {
    case "next":
      return next(s);
    case "prev":
      return prev(s);
    case "first":
      return withNav(s, jumpTo(s.nav, 1));
    case "last":
      return withNav(s, jumpTo(s.nav, s.nav.order.length));
    case "goto":
      return withNav(s, jumpTo(s.nav, a.index + 1));
    case "digit":
      return /^[0-9]$/.test(a.digit) && s.digits.length < MAX_DIGITS ? { ...s, digits: s.digits + a.digit } : s;
    case "enter": {
      if (s.digits === "") return next(s);
      const n = Number.parseInt(s.digits, 10);
      return n > 0 ? withNav(s, jumpTo(s.nav, n)) : { ...s, digits: "" };
    }
    case "backspace":
      return s.digits !== "" ? { ...s, digits: s.digits.slice(0, -1) } : prev(s);
    case "blank":
      return { ...s, blank: s.blank === a.screen ? null : a.screen, digits: "" };
    case "exit":
      return { ...s, done: true, digits: "" };
    case "deck": {
      const nav = reconcileNav(s.nav, a.order, a.all);
      return nav === s.nav ? s : { ...s, nav };
    }
  }
}

// ── Timer ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The presenter's stopwatch: elapsed = (pausedAt ?? now) − startedAt. Times are epoch ms. */
export interface ShowTimer {
  startedAt: number;
  pausedAt: number | null;
}

export function startTimer(now: number): ShowTimer {
  return { startedAt: now, pausedAt: null };
}

export function timerElapsed(timer: ShowTimer, now: number): number {
  return Math.max(0, (timer.pausedAt ?? now) - timer.startedAt);
}

export function pauseTimer(timer: ShowTimer, now: number): ShowTimer {
  return timer.pausedAt === null ? { ...timer, pausedAt: now } : timer;
}

/** Resumes from where it was paused (the paused time does not count). */
export function resumeTimer(timer: ShowTimer, now: number): ShowTimer {
  return timer.pausedAt === null ? timer : { startedAt: timer.startedAt + (now - timer.pausedAt), pausedAt: null };
}

/** Back to 0:00, keeping whether it runs. */
export function resetTimer(timer: ShowTimer, now: number): ShowTimer {
  return { startedAt: now, pausedAt: timer.pausedAt === null ? null : now };
}

/** "m:ss" under an hour, else "h:mm:ss" (ASCII digits; shown in a tabular mono face). */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
