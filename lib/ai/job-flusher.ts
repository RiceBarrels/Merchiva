/**
 * Streams a background reply into its `ai_job` row without one reducer call per token.
 *
 * Text is coalesced into ~250 ms / 600-char chunks; tool frames (`pushNow`) go out at once so a
 * tool call shows while it runs. Tool callbacks fire while the text loop is still awaiting its
 * own flush, so writes are chained: `append` is only ever called one at a time, in push order,
 * and the row's partialText never gets two chunks swapped.
 *
 * Pure apart from the injected `append` and clock: safe to unit-test.
 */

export type AppendChunk = (chunk: string, setRunning: boolean) => Promise<void>;

export interface JobFlusher {
  /** Buffer text; it goes out on the next flush. */
  push(text: string): void;
  /** Buffer text and start a flush now, without waiting for it. */
  pushNow(text: string): void;
  /** Flush when the buffer is big or old enough; resolves once that write has landed. */
  maybeFlush(): Promise<void>;
  /** Flush whatever is buffered; resolves when every queued write has landed. */
  flush(): Promise<void>;
}

export interface JobFlusherOptions {
  everyMs?: number;
  atChars?: number;
  now?: () => number;
  onError?: (err: unknown) => void;
}

export function createJobFlusher(append: AppendChunk, options: JobFlusherOptions = {}): JobFlusher {
  const everyMs = options.everyMs ?? 250;
  const atChars = options.atChars ?? 600;
  const now = options.now ?? Date.now;
  const onError =
    options.onError ?? ((err: unknown) => console.error("[chunk-flusher] reducer failed:", err));

  let buf = "";
  let lastFlushAt = now();
  // The first write also flips the job to running, even when there is no text yet.
  let firstWrite = true;
  let chain: Promise<void> = Promise.resolve();

  const flush = (): Promise<void> => {
    const chunk = buf;
    buf = "";
    lastFlushAt = now();
    if (!chunk && !firstWrite) return chain;
    const setRunning = firstWrite;
    firstWrite = false;
    chain = chain.then(() => append(chunk, setRunning)).catch(onError);
    return chain;
  };

  return {
    push(text: string) {
      buf += text;
    },
    pushNow(text: string) {
      buf += text;
      void flush();
    },
    maybeFlush() {
      if (buf.length >= atChars || now() - lastFlushAt >= everyMs) return flush();
      return Promise.resolve();
    },
    flush,
  };
}
