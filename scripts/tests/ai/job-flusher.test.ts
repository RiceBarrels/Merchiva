import { describe, expect, test } from "bun:test";
import { createJobFlusher } from "@/lib/ai/job-flusher";

type Call = { chunk: string; setRunning: boolean };

function recorder(delays: number[] = []) {
  const calls: Call[] = [];
  let n = 0;
  const append = async (chunk: string, setRunning: boolean) => {
    const delay = delays[n++] ?? 0;
    if (delay) await new Promise((r) => setTimeout(r, delay));
    calls.push({ chunk, setRunning });
  };
  return { calls, append };
}

describe("job flusher", () => {
  test("the first write flips the job to running, later ones do not", async () => {
    const { calls, append } = recorder();
    const flusher = createJobFlusher(append);
    flusher.push("Hello");
    await flusher.flush();
    flusher.push(" world");
    await flusher.flush();
    expect(calls).toEqual([
      { chunk: "Hello", setRunning: true },
      { chunk: " world", setRunning: false },
    ]);
  });

  test("the first flush writes even with no text (so the job shows as running)", async () => {
    const { calls, append } = recorder();
    const flusher = createJobFlusher(append);
    await flusher.flush();
    await flusher.flush();
    expect(calls).toEqual([{ chunk: "", setRunning: true }]);
  });

  test("text is coalesced until it is big or old enough", async () => {
    let clock = 0;
    const { calls, append } = recorder();
    const flusher = createJobFlusher(append, { now: () => clock, everyMs: 250, atChars: 10 });
    flusher.push("abc");
    await flusher.maybeFlush();
    expect(calls).toHaveLength(0);
    flusher.push("defghijk");
    await flusher.maybeFlush();
    expect(calls).toEqual([{ chunk: "abcdefghijk", setRunning: true }]);
    flusher.push("x");
    clock = 300;
    await flusher.maybeFlush();
    expect(calls.at(-1)).toEqual({ chunk: "x", setRunning: false });
  });

  test("writes land in push order even when a slow write is still in flight", async () => {
    // The first write is slow; a tool frame pushed meanwhile must not overtake it.
    const { calls, append } = recorder([30, 0, 0]);
    const flusher = createJobFlusher(append);
    flusher.push("ack");
    const first = flusher.flush();
    flusher.pushNow("[frame]");
    flusher.push("text");
    await flusher.flush();
    await first;
    expect(calls.map((c) => c.chunk)).toEqual(["ack", "[frame]", "text"]);
  });

  test("pushNow sends buffered text along with the frame", async () => {
    const { calls, append } = recorder();
    const flusher = createJobFlusher(append);
    flusher.push("before ");
    flusher.pushNow("[frame]");
    await flusher.flush();
    expect(calls).toEqual([{ chunk: "before [frame]", setRunning: true }]);
  });

  test("a failed write is reported and does not stop later writes", async () => {
    const errors: unknown[] = [];
    const calls: string[] = [];
    let n = 0;
    const flusher = createJobFlusher(
      async (chunk) => {
        if (n++ === 0) throw new Error("reducer down");
        calls.push(chunk);
      },
      { onError: (err) => errors.push(err) },
    );
    flusher.push("a");
    await flusher.flush();
    flusher.push("b");
    await flusher.flush();
    expect(errors).toHaveLength(1);
    expect(calls).toEqual(["b"]);
  });
});
