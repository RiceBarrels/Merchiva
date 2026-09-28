/**
 * Rename bookkeeping for `FileTitleInput`, kept free of React so it can be tested on its own. One editing session
 * can hand the same draft over twice (the 600 ms debounce, then the blur or Enter that follows it) before the new
 * title comes back, so the committer remembers the last value it sent and the live title it was sent against. That
 * memory is dropped when the live title changes, when the session ends and when the rename fails, so a later rename
 * to the same text is never swallowed.
 */

export const TITLE_MAX = 200;

/** Collapses whitespace runs, trims and caps the length. */
export function cleanTitle(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, TITLE_MAX);
}

export interface TitleCommitter {
  /** Sends the cleaned `draft` unless it equals the live `title` or was already sent against that same title. */
  commit(draft: string, title: string, send: (title: string) => Promise<void>): void;
  /** The live title is now `title`. A change, from this input or from anywhere else, forgets what was sent. */
  titleChanged(title: string): void;
  /** The editing session ended (blur): forget what was sent, so the next session can retry the same value. */
  endSession(): void;
}

interface SentTitle {
  readonly value: string;
  readonly forTitle: string;
}

export function createTitleCommitter(): TitleCommitter {
  let sent: SentTitle | null = null;
  let liveTitle: string | null = null;

  return {
    commit(draft, title, send) {
      const clean = cleanTitle(draft);
      if (clean === cleanTitle(title)) return;
      if (sent && sent.value === clean && sent.forTitle === title) return;
      const entry: SentTitle = { value: clean, forTitle: title };
      sent = entry;
      send(clean).catch(() => {
        // The caller already reported the error; allow the same value to be retried.
        if (sent === entry) sent = null;
      });
    },
    titleChanged(title) {
      if (title === liveTitle) return;
      liveTitle = title;
      sent = null;
    },
    endSession() {
      sent = null;
    },
  };
}
