import { NextRequest, NextResponse } from "next/server";
import { SttError, transcribeAudio } from "@/lib/stt";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audio = formData.get("audio");
    const lang = formData.get("lang") as string | null;

    if (!(audio instanceof Blob)) {
      return NextResponse.json({ error: "audio blob required" }, { status: 400 });
    }

    const text = await transcribeAudio(audio, lang);
    return NextResponse.json({ text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = err instanceof SttError ? err.status : 500;
    console.error("[store-ai/stt] Error:", msg);
    return NextResponse.json({ error: msg }, { status });
  }
}
