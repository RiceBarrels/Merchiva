// Server-only speech-to-text via OpenRouter's Whisper endpoint. Shared by
// /api/store-ai/stt (Mr. Merchiva voice) and /api/walkie/transcribe.

function getApiKey(): string {
  return process.env.OPENROUTER_API_KEY ?? "";
}

function getBaseURL(): string {
  return (process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
}

function getModel(): string {
  return process.env.OPENROUTER_STT_MODEL ?? "openai/whisper-large-v3-turbo";
}

/** Map an app locale (en, zh-cn, zh-tw, …) to a Whisper language code. */
export function whisperLanguage(locale: string | null | undefined): string | null {
  if (!locale) return null;
  const base = locale.toLowerCase().split("-")[0];
  const map: Record<string, string> = { en: "en", zh: "zh", es: "es", fr: "fr", ar: "ar", hi: "hi" };
  return map[base] ?? null;
}

function detectFormat(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("webm")) return "webm";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mp3") || m.includes("mpeg")) return "mp3";
  if (m.includes("wav")) return "wav";
  if (m.includes("m4a") || m.includes("mp4")) return "m4a";
  if (m.includes("flac")) return "flac";
  if (m.includes("aac")) return "aac";
  return "webm";
}

export class SttError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Transcribe an audio blob. Throws SttError with an HTTP-ish status. */
export async function transcribeAudio(audio: Blob, locale?: string | null): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) throw new SttError("OPENROUTER_API_KEY not configured", 500);
  if (audio.size === 0) throw new SttError("audio is empty", 400);

  const buf = Buffer.from(await audio.arrayBuffer());
  const payload: Record<string, unknown> = {
    model: getModel(),
    input_audio: { data: buf.toString("base64"), format: detectFormat(audio.type || "audio/webm") },
    temperature: 0,
  };
  const lang = whisperLanguage(locale);
  if (lang) payload.language = lang;

  const res = await fetch(`${getBaseURL()}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://merchiva.com",
      "X-Title": "Merchiva Mr. Merchiva",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[stt] Upstream error:", res.status, errText);
    throw new SttError(`STT failed: ${errText.slice(0, 500)}`, res.status);
  }

  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}
