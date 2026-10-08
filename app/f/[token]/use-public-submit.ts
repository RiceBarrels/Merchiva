"use client";

// Submits one anyone-with-the-link response to /api/forms/public/<token>.
// The response id is made once per page, so a retry after a dropped
// connection never records the answers twice (the module ignores a replay).
// It waits out the minimum fill time itself and refreshes an expired render
// stamp once, so a person never sees those anti-abuse checks.

import { useCallback, useRef } from "react";
import { dateKey } from "@/lib/date-key";
import type { Answers } from "@/lib/forms/types";

/** The server's PUBLIC_STAMP_MIN_AGE_MS plus a margin for clock and network jitter. */
const MIN_FILL_MS = 3_500;

/** Endpoint codes → the Forms error code the host shows (`forms.errors.<code>`); unknown codes read as generic. */
const HOST_CODE: Readonly<Record<string, string>> = {
  too_large: "answers_too_large",
  not_configured: "generic",
  unavailable: "generic",
  invalid: "generic",
  expired: "generic",
};

/**
 * A refused submit. The message is `[forms.<code>]` (plus the question id for an answer issue), the shape the
 * Forms renderer host turns into copy with formsErrorKey; the endpoint's own codes map onto the nearest Forms code.
 */
export class PublicSubmitError extends Error {
  readonly code: string;
  readonly questionId: string | null;
  constructor(code: string, questionId: string | null = null) {
    const shown = HOST_CODE[code] ?? code;
    super(`[forms.${shown}]${questionId ? ` ${questionId}` : ""}`);
    this.name = "PublicSubmitError";
    this.code = code;
    this.questionId = questionId;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface PostResult {
  ok: boolean;
  error: string | null;
  questionId: string | null;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await res.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function usePublicSubmit(token: string, initialStamp: string | null) {
  const responseId = useRef<string>("");
  const stamp = useRef<string | null>(initialStamp);
  const loadedAt = useRef<number>(0);
  const honeypot = useRef<HTMLInputElement | null>(null);

  const markLoaded = useCallback(() => {
    if (loadedAt.current === 0) loadedAt.current = Date.now();
  }, []);

  const post = useCallback(
    async (answers: Answers): Promise<PostResult> => {
      const res = await fetch(`/api/forms/public/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responseId: responseId.current,
          answers,
          date: dateKey(),
          stamp: stamp.current ?? "",
          website: honeypot.current?.value ?? "",
        }),
      });
      const body = await readJson(res);
      if (res.ok) return { ok: true, error: null, questionId: null };
      return {
        ok: false,
        error: typeof body.error === "string" ? body.error : "unavailable",
        questionId: typeof body.questionId === "string" ? body.questionId : null,
      };
    },
    [token],
  );

  const refreshStamp = useCallback(async (): Promise<boolean> => {
    const res = await fetch(`/api/forms/public/${token}`, { cache: "no-store" });
    const body = await readJson(res);
    if (!res.ok || typeof body.stamp !== "string") return false;
    stamp.current = body.stamp;
    loadedAt.current = Date.now();
    return true;
  }, [token]);

  const submit = useCallback(
    async (answers: Answers): Promise<void> => {
      if (!responseId.current) responseId.current = crypto.randomUUID().toLowerCase();
      markLoaded();
      const wait = loadedAt.current + MIN_FILL_MS - Date.now();
      if (wait > 0) await sleep(wait);
      let result: PostResult;
      try {
        result = await post(answers);
        if (result.error === "expired" && (await refreshStamp())) {
          await sleep(MIN_FILL_MS);
          result = await post(answers);
        }
      } catch {
        throw new PublicSubmitError("network");
      }
      if (!result.ok) throw new PublicSubmitError(result.error ?? "unavailable", result.questionId);
    },
    [markLoaded, post, refreshStamp],
  );

  return { submit, markLoaded, honeypot };
}
