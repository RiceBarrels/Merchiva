import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { SttError, transcribeAudio } from "@/lib/stt";
import { getOpenRouterFastModel } from "@/app/api/store-ai/route";

export const runtime = "nodejs";
export const maxDuration = 60;

// Transcripts shorter than this are sent as-is — nothing to condense.
const MIN_WORDS_FOR_SUMMARY = 8;

function wordCount(s: string): number {
  // CJK has no spaces; count characters there so short Chinese notes also skip
  // the summary step.
  const cjk = (s.match(/[㐀-鿿]/g) ?? []).length;
  const latin = s.replace(/[㐀-鿿]/g, " ").split(/\s+/).filter(Boolean).length;
  return latin + Math.ceil(cjk / 2);
}

async function summarize(transcript: string): Promise<string> {
  const { text } = await generateText({
    model: getOpenRouterFastModel(),
    temperature: 0.2,
    maxOutputTokens: 160,
    system: [
      "You clean up push-to-talk voice messages sent between coworkers on a shop floor.",
      "Rewrite the transcript as a concise, clear work message of 1–2 sentences.",
      "Keep every number, name, time, location and item exactly as spoken.",
      "Drop filler words, false starts and repetition. Do not add information.",
      "Reply in the same language as the transcript. Output only the message text.",
    ].join(" "),
    prompt: transcript,
  });
  return text.trim();
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audio = formData.get("audio");
    const lang = formData.get("lang") as string | null;

    if (!(audio instanceof Blob)) {
      return NextResponse.json({ error: "audio blob required" }, { status: 400 });
    }

    const transcript = await transcribeAudio(audio, lang);
    if (!transcript) {
      return NextResponse.json({ error: "Nothing was heard" }, { status: 422 });
    }

    let summary = transcript;
    if (wordCount(transcript) >= MIN_WORDS_FOR_SUMMARY) {
      try {
        const s = await summarize(transcript);
        if (s) summary = s;
      } catch (err) {
        console.warn("[walkie/transcribe] summary failed, using transcript:", err instanceof Error ? err.message : err);
      }
    }

    return NextResponse.json({ transcript, summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = err instanceof SttError ? err.status : 500;
    console.error("[walkie/transcribe] Error:", msg);
    return NextResponse.json({ error: msg }, { status });
  }
}
