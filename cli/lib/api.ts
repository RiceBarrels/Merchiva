// HTTP client for the Merchiva app's AI endpoint (/api/store-ai).
//
// The route streams plain text (Content-Type: text/plain). Two pieces of
// metadata ride along as base64 response headers:
//   X-Merchiva-Ack      — a short "what I'm checking" acknowledgment
//   X-Merchiva-Kaomoji  — a mood face, e.g. (・ω・)
// The streamed body is conversational text that may embed ```action {...}```
// fenced blocks which the web client executes. The CLI surfaces those blocks
// separately rather than printing raw JSON inline.
//
// The route only answers an ACTIVE member of the organization named in the
// body, proven by the signed-in user's token (`merchiva login`, or
// MERCHIVA_TOKEN) — so every call carries `token` and `organizationId`.
// Access tokens live about five minutes and a chat session outlives that, so
// the token is read, and refreshed when near expiry, for every request.

import { ensureFreshToken, renewToken } from "./auth.ts";
import type { CliConfig, Locale } from "./config.ts";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResult {
  /** Full assistant prose with action blocks stripped out. */
  text: string;
  /** Parsed ```action``` blocks, in order. */
  actions: unknown[];
  /** Short ack from the triage model, if any. */
  ack?: string;
  /** Mood kaomoji, if any. */
  kaomoji?: string;
}

interface StreamChatOptions {
  config: CliConfig;
  message: string;
  history?: ChatTurn[];
  lang?: Locale;
  /** Organization to ask about; defaults to the pinned `config.orgId`. */
  organizationId?: string;
  /** Called with each chunk of *prose* (action blocks excluded). */
  onText?: (chunk: string) => void;
  signal?: AbortSignal;
  /** Where the token comes from; the saved login unless a test swaps it. */
  tokens?: TokenSource;
}

// 401 from /api/store-ai means no token, an expired one, or no active
// membership of the org; point at the two commands that fix it.
export const UNAUTHORIZED_HINT =
  "Sign in with `merchiva login` and pin a store with `merchiva config set org <organizationId>`.";

/** Where a request's token comes from. */
export interface TokenSource {
  /** The token to send, refreshed first when it is near expiry. */
  current(): Promise<string | undefined>;
  /** A new token after a 401, or undefined when it can't be renewed. */
  renew(): Promise<string | undefined>;
}

/** The token `merchiva login` saved (or MERCHIVA_TOKEN), refreshed through its refresh token. */
export const savedLogin: TokenSource = { current: ensureFreshToken, renew: renewToken };

/**
 * Sends a request with a fresh token. A 401 gets one renewal and one retry:
 * the token can still expire between the local check and the server's.
 */
export async function sendWithToken(
  send: (token: string | undefined) => Promise<Response>,
  tokens: TokenSource,
): Promise<Response> {
  const res = await send(await tokens.current());
  if (res.status !== 401) return res;
  const renewed = await tokens.renew();
  if (!renewed) return res;
  await res.body?.cancel().catch(() => {});
  return send(renewed);
}

function decodeHeader(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    return Buffer.from(value, "base64").toString("utf-8");
  } catch {
    return undefined;
  }
}

// Line-oriented filter that splits prose from ```action``` fenced blocks as
// text streams in. Lines are emitted to `onText` once complete so a half-
// written action block never leaks to the terminal.
class ActionStripper {
  private pending = "";
  private inAction = false;
  private actionBuf = "";
  readonly prose: string[] = [];
  readonly actions: unknown[] = [];

  constructor(private onText?: (chunk: string) => void) {}

  push(chunk: string) {
    this.pending += chunk;
    let nl: number;
    while ((nl = this.pending.indexOf("\n")) !== -1) {
      const line = this.pending.slice(0, nl);
      this.pending = this.pending.slice(nl + 1);
      this.handleLine(line + "\n");
    }
  }

  private isFence(line: string) {
    return line.trimStart().startsWith("```");
  }

  private handleLine(line: string) {
    const trimmed = line.trim();
    if (this.inAction) {
      if (this.isFence(line)) {
        this.inAction = false;
        try {
          this.actions.push(JSON.parse(this.actionBuf.trim()));
        } catch {
          // Not valid JSON — surface the raw block so nothing is silently lost.
          this.actions.push({ _raw: this.actionBuf.trim() });
        }
        this.actionBuf = "";
      } else {
        this.actionBuf += line;
      }
      return;
    }
    if (this.isFence(line)) {
      // Opening fence: anything is treated as an action/code block to hide.
      const lang = trimmed.replace(/`/g, "").trim();
      if (lang === "" || lang === "action" || lang === "json") {
        this.inAction = true;
        return;
      }
    }
    this.prose.push(line);
    this.onText?.(line);
  }

  finish() {
    if (this.pending) {
      if (this.inAction) {
        this.actionBuf += this.pending;
      } else {
        this.prose.push(this.pending);
        this.onText?.(this.pending);
      }
      this.pending = "";
    }
    if (this.inAction && this.actionBuf.trim()) {
      try {
        this.actions.push(JSON.parse(this.actionBuf.trim()));
      } catch {
        this.actions.push({ _raw: this.actionBuf.trim() });
      }
    }
  }
}

export async function streamChat(opts: StreamChatOptions): Promise<ChatResult> {
  const { config, message, history = [], lang, organizationId, onText, signal, tokens = savedLogin } = opts;
  const url = `${config.baseUrl}/api/store-ai`;

  let res: Response;
  try {
    res = await sendWithToken(
      (token) =>
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            history,
            lang: lang ?? config.lang,
            mode: "chat",
            stream: true,
            token,
            organizationId: organizationId ?? config.orgId,
          }),
          signal,
        }),
      tokens,
    );
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Could not reach Merchiva at ${config.baseUrl} (${reason}).\n` +
        `Is the app running? Set the URL with: merchiva config set url <origin>`,
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `store-ai responded ${res.status} ${res.statusText}${detail ? `: ${detail.slice(0, 300)}` : ""}` +
        (res.status === 401 ? `\n${UNAUTHORIZED_HINT}` : ""),
    );
  }

  const ack = decodeHeader(res.headers.get("X-Merchiva-Ack"));
  const kaomoji = decodeHeader(res.headers.get("X-Merchiva-Kaomoji"));

  const stripper = new ActionStripper(onText);

  if (!res.body) {
    const full = await res.text();
    stripper.push(full);
  } else {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      stripper.push(decoder.decode(value, { stream: true }));
    }
    stripper.push(decoder.decode());
  }
  stripper.finish();

  return {
    text: stripper.prose.join("").trim(),
    actions: stripper.actions,
    ack,
    kaomoji,
  };
}

// Lightweight connectivity probe used by `merchiva doctor`.
export async function ping(
  config: CliConfig,
  tokens: TokenSource = savedLogin,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const res = await sendWithToken(
      (token) =>
        fetch(`${config.baseUrl}/api/store-ai`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: "ping",
            stream: false,
            lang: config.lang,
            token,
            organizationId: config.orgId,
          }),
        }),
      tokens,
    );
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
