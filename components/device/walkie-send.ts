// Sending one push-to-talk recording to a conversation: the original voice as an
// attachment, or transcribed + AI-summarised with the original attached. Shared by the
// store walkie (./use-channels.ts) and the /personal channel, which open conversations
// differently but send the same way.

import { ACCOUNT_CHAT_WRITES, type ChatWrites } from "@/lib/spacetimedb/actions/chat";
import { uploadChatFile } from "@/lib/db/chat";
import { appUploadErrorKey } from "@/lib/storage/app-upload";
import type { PttResult } from "./types";

interface TranscribeResponse {
  transcript?: string;
  summary?: string;
  error?: string;
}

export interface WalkieTarget {
  conversationId: string;
  /** Named in the "sent to" toast. */
  name: string;
}

async function uploadVoice(blob: Blob, organizationId: string) {
  const ext = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "m4a" : "webm";
  const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: blob.type || "audio/webm" });
  const res = await uploadChatFile(file, organizationId);
  return { url: res.url, type: "audio", name: res.name };
}

/**
 * Sends `result` to `target`; resolves with a short status line for a toast. `send` writes the
 * message: the account's own, or on a store tablet its operator's (OPERATOR_CHAT_WRITES.send).
 */
export async function sendWalkieVoice(
  result: PttResult,
  target: WalkieTarget | null,
  { organizationId, locale, t, send = ACCOUNT_CHAT_WRITES.send }: {
    organizationId: string; locale: string; t: (key: string) => string; send?: ChatWrites["send"];
  },
): Promise<string> {
  if (result.mode === "delete" || !result.blob) return t("device.toastDeleted");
  if (!target) return t("device.toastNoChannel");

  if (result.mode === "original") {
    let attachment: Awaited<ReturnType<typeof uploadVoice>>;
    try {
      attachment = await uploadVoice(result.blob, organizationId);
    } catch (err) {
      return t(appUploadErrorKey(err));
    }
    await send(target.conversationId, "", attachment, null);
    return t("device.toastOriginalSent");
  }

  // "summary": transcribe + summarize, upload the original in parallel.
  const fd = new FormData();
  fd.append("audio", result.blob, "voice.webm");
  fd.append("lang", locale);
  let uploadError: unknown = null;
  const uploadPromise = uploadVoice(result.blob, organizationId).catch((err: unknown) => {
    uploadError = err;
    return null;
  });
  const res = await fetch("/api/walkie/transcribe", { method: "POST", body: fd });
  const data = (await res.json().catch(() => ({}))) as TranscribeResponse;
  if (!res.ok) throw new Error(data.error || t("device.toastTranscribeFailed"));
  const transcript = (data.transcript ?? "").trim();
  const summary = (data.summary ?? "").trim() || transcript;
  if (!transcript) return t("device.toastNothingHeard");
  const attachment = await uploadPromise;
  await send(target.conversationId, summary, attachment, transcript);
  // The summary goes out without its recording when the upload failed (a full store, say): say why.
  if (uploadError !== null) return `${t("device.toastSummarySent")} ${target.name} · ${t(appUploadErrorKey(uploadError))}`;
  return `${t("device.toastSummarySent")} ${target.name}`;
}
