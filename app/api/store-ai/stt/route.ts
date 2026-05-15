import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

function getApiKey(): string {
  return process.env.OPENROUTER_API_KEY ?? "";
}

function getBaseURL(): string {
  return (process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
}

function getModel(): string {
  return process.env.OPENROUTER_STT_MODEL ?? "openai/whisper-large-v3-turbo";
}

function whisperLanguage(locale: string | null): string | null {
  if (!locale) return null;
  const map: Record<string, string> = {
    en: "en",
    zh: "zh",
    es: "es",
    fr: "fr",
    ar: "ar",
    hi: "hi",
  };
  return map[locale] ?? null;
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

export async function POST(req: NextRequest) {
  try {
    const apiKey = getApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENROUTER_API_KEY not configured" },
        { status: 500 },
      );
    }

    const formData = await req.formData();
    const audio = formData.get("audio");
    const lang = whisperLanguage(formData.get("lang") as string | null);

    if (!(audio instanceof Blob)) {
      return NextResponse.json({ error: "audio blob required" }, { status: 400 });
    }
    if (audio.size === 0) {
      return NextResponse.json({ error: "audio is empty" }, { status: 400 });
    }

    const buf = Buffer.from(await audio.arrayBuffer());
    const base64 = buf.toString("base64");
    const format = detectFormat(audio.type || "audio/webm");

    const payload: Record<string, unknown> = {
      model: getModel(),
      input_audio: { data: base64, format },
      temperature: 0,
    };
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
      console.error("[store-ai/stt] Upstream error:", res.status, errText);
      return NextResponse.json(
        { error: `STT failed: ${errText.slice(0, 500)}` },
        { status: res.status },
      );
    }

    const data = (await res.json()) as { text?: string };
    return NextResponse.json({ text: data.text ?? "" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[store-ai/stt] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
