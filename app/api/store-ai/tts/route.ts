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
  return process.env.OPENROUTER_TTS_MODEL ?? "openai/gpt-4o-mini-tts-2025-12-15";
}

function getDefaultVoice(): string {
  return process.env.OPENROUTER_TTS_VOICE ?? "ash";
}

const VOICE_INSTRUCTIONS: Record<string, string> = {
  en: "Speak in a friendly, professional tone like a helpful colleague on a phone call. Keep it natural and conversational.",
  zh: "用友好、专业的语气说话，像电话上一位乐于助人的同事。保持自然、对话式。",
  es: "Habla con un tono amigable y profesional, como un colega servicial al teléfono. Mantenlo natural y conversacional.",
  fr: "Parlez d'un ton amical et professionnel, comme un collègue serviable au téléphone. Restez naturel et conversationnel.",
  ar: "تحدث بنبرة ودية ومهنية، مثل زميل مفيد على الهاتف. حافظ على أسلوب طبيعي ومحادثة.",
  hi: "एक मित्रवत, पेशेवर लहजे में बात करें, जैसे फोन पर एक मददगार सहयोगी। इसे स्वाभाविक और संवादात्मक रखें।",
};

export async function POST(req: NextRequest) {
  try {
    const apiKey = getApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENROUTER_API_KEY not configured" },
        { status: 500 },
      );
    }

    const body = (await req.json()) as {
      text?: string;
      voice?: string;
      format?: "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";
      lang?: string;
      instructions?: string;
    };

    const text = body.text;
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "text required" }, { status: 400 });
    }
    if (text.length > 4096) {
      return NextResponse.json({ error: "text too long (max 4096 chars)" }, { status: 400 });
    }

    const voice = body.voice ?? getDefaultVoice();
    const format = body.format ?? "mp3";
    const instructions =
      body.instructions ?? VOICE_INSTRUCTIONS[body.lang ?? "en"] ?? VOICE_INSTRUCTIONS.en;

    const payload: Record<string, unknown> = {
      model: getModel(),
      input: text,
      voice,
      response_format: format,
      speed: 1.0,
    };
    if (instructions) {
      // OpenAI-specific tone control passed through OpenRouter's `provider` passthrough.
      payload.provider = { openai: { instructions } };
    }

    const res = await fetch(`${getBaseURL()}/audio/speech`, {
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
      console.error("[store-ai/tts] Upstream error:", res.status, errText);
      return NextResponse.json(
        { error: `TTS failed: ${errText.slice(0, 500)}` },
        { status: res.status },
      );
    }

    const contentType =
      format === "mp3"
        ? "audio/mpeg"
        : format === "pcm"
          ? "audio/pcm"
          : format === "opus"
            ? "audio/ogg"
            : format === "aac"
              ? "audio/aac"
              : format === "flac"
                ? "audio/flac"
                : format === "wav"
                  ? "audio/wav"
                  : "application/octet-stream";

    return new NextResponse(res.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[store-ai/tts] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
