"use client";

// MediaRecorder-based hold-to-talk. `start()` on pointerdown, `stop(mode)` on
// pointerup. Uses audio/webm;codecs=opus when supported.

import { useCallback, useEffect, useRef, useState } from "react";
import type { PttResult } from "./types";

export interface UsePushToTalkResult {
  recording: boolean;
  elapsedSec: number;
  /** Mic permission problem or unsupported browser. */
  error: string | null;
  start: () => Promise<void>;
  stop: (mode: PttResult["mode"]) => Promise<PttResult | null>;
}

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  return "";
}

export function usePushToTalk(): UsePushToTalkResult {
  const [recording, setRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingRef = useRef(false);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  }, []);

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const start = useCallback(async () => {
    if (recordingRef.current) return;
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("unsupported");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorderRef.current = recorder;
      recorder.start(250);
      startedAtRef.current = Date.now();
      recordingRef.current = true;
      setRecording(true);
      setElapsedSec(0);
      clearTimer();
      timerRef.current = setInterval(() => {
        setElapsedSec(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 250);
    } catch (err) {
      releaseStream();
      setError(err instanceof Error ? (err.name === "NotAllowedError" ? "denied" : err.message) : String(err));
    }
  }, [releaseStream]);

  const stop = useCallback(async (mode: PttResult["mode"]): Promise<PttResult | null> => {
    const recorder = recorderRef.current;
    if (!recordingRef.current || !recorder) return null;
    recordingRef.current = false;
    clearTimer();
    const durationSec = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));

    const blob = await new Promise<Blob>((resolve) => {
      const finish = () => {
        resolve(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
      };
      if (recorder.state === "inactive") {
        finish();
        return;
      }
      recorder.onstop = finish;
      try {
        recorder.stop();
      } catch {
        finish();
      }
    });

    recorderRef.current = null;
    chunksRef.current = [];
    releaseStream();
    setRecording(false);
    setElapsedSec(0);

    return { mode, blob: mode === "delete" ? null : blob, durationSec };
  }, [releaseStream]);

  useEffect(() => {
    return () => {
      clearTimer();
      try { recorderRef.current?.stop(); } catch { /* ignore */ }
      releaseStream();
    };
  }, [releaseStream]);

  return { recording, elapsedSec, error, start, stop };
}
