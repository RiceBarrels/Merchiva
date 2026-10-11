// What the alert hook (./alerts.ts) does with rows it has not alerted yet, pure
// (scripts/tests/notify/client-alert-plan.test.ts).
//
// Alert-only rows (no feature, so no dot and no inbox) are read only once they
// were presented: shown as a toast or an OS notification. Rows nobody was shown —
// a connection's backlog, or a row that came while nobody was at the screen and
// OS notifications were off — are replayed while someone is; a long backlog
// folds into one "N more" alert.
//
// A focused tab is asked by the service worker (public/sw.js) whether a push is
// already dealt with here; anything it does not know becomes an OS notification.

/** Backlog rows replayed one by one; the rest fold into one alert. */
export const ALERT_REPLAY_MAX = 3;

export interface AlertOnlyPlanInput {
  /** Unread alert-only rows of the active store, newest first (DotState.alertOnlyIds). */
  readonly ids: readonly string[];
  /** Shown as a toast or an OS notification (or skipped because the page on screen showed it). */
  readonly presented: ReadonlySet<string>;
  /** Still waiting for its settle timer. */
  readonly pending: (id: string) => boolean;
  /** Rows this plan leaves alone (the SOS: read when its toast is dismissed). */
  readonly skip: (id: string) => boolean;
  readonly max?: number;
}

export interface AlertOnlyPlan {
  /** Presented: mark read. */
  readonly read: string[];
  /** Never presented: show one by one, newest first. */
  readonly replay: string[];
  /** Never presented, beyond `max`: one "N more" alert. */
  readonly fold: string[];
}

/** Which alert-only rows to read and which to show first. Run only while someone is at the screen. */
export function planAlertOnly(input: AlertOnlyPlanInput): AlertOnlyPlan {
  const max = input.max ?? ALERT_REPLAY_MAX;
  const read: string[] = [];
  const fresh: string[] = [];
  for (const id of input.ids) {
    if (input.pending(id) || input.skip(id)) continue;
    (input.presented.has(id) ? read : fresh).push(id);
  }
  return { read, replay: fresh.slice(0, max), fold: fresh.slice(max) };
}

export interface PushHandoffInput {
  readonly presented: ReadonlySet<string>;
  readonly pending: (id: string) => boolean;
  /** The row's read flag in this page's feed; null when the feed does not hold it (another store). */
  readonly read: (id: string) => boolean | null;
}

/**
 * Whether this page has dealt with a pushed row, so the service worker need not raise an OS
 * notification: it was presented, is about to be, or is already read. A row of another store,
 * of a connection's backlog, or with no id is not.
 */
export function pushHandledHere(id: string | null, input: PushHandoffInput): boolean {
  if (!id) return false;
  return input.presented.has(id) || input.pending(id) || input.read(id) === true;
}
