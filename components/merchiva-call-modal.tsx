"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff, Volume2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n, useT } from "@/lib/i18n/context";
import { usePermissions } from "@/lib/context/permissions";
import { useAuth } from "@/lib/auth/context";
import { getStoredToken } from "@/lib/spacetimedb/client";
import { loadStoredMcpServers } from "@/lib/merchiva/mcp/config";
import type { CurrentPage } from "@/lib/ai/page-prompt";
import { MerchivaLogo } from "./logo";
import { Spinner } from "@/components/ui/loaders/geometric";
import { Button } from "@/components/ui/button";

type CallState =
  | "idle"
  | "permission"
  | "listening"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "error"
  | "ended";

interface VoiceTurnContext {
  history: Array<{ role: "user" | "assistant"; content: string }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  storeContext: Record<string, any>;
  memory: { summary?: string; storeOverview?: string; userPreferences?: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  permissions: any;
  /** The page the chat's tab shows (lib/merchiva/current-page.ts), read per turn. */
  page?: CurrentPage | null;
}

interface MerchivaCallModalProps {
  open: boolean;
  onClose: () => void;
  /** Returns the latest history snapshot to send to the AI. */
  getContext: () => VoiceTurnContext;
  /** Notify the chat dashboard when a voice exchange completes. */
  onTurnComplete?: (userText: string, aiText: string) => void;
  /** Notify the chat dashboard when the call ends, with total duration in seconds. */
  onCallEnd?: (durationSec: number) => void;
}

const SILENCE_END_MS = 700;
const MIN_SPEECH_MS = 200;
const MAX_LISTEN_MS = 30_000;
const VOICE_LEVEL = 18;

const SENTENCE_END_RE = /[.!?。！？]+["'")\]]?\s|\n\n/;

function cleanForSpeech(text: string): string {
  return text
    .replace(/```action[\s\S]*?```/g, "")
    .replace(/```action[\s\S]*$/, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[\->]\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function MerchivaCallModal({
  open,
  onClose,
  getContext,
  onTurnComplete,
  onCallEnd,
}: MerchivaCallModalProps) {
  const t = useT();
  const { locale } = useI18n();
  const { organizationId } = usePermissions();
  const { getToken } = useAuth();
  const [state, setState] = useState<CallState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  // Drives the in-modal kaomoji's open/closed mouth while TTS is playing.
  // Set from playBlob's analyser loop alongside the merchiva:voice-mouth
  // event so the chat watermark and the modal both animate in sync.
  const [mouthOpen, setMouthOpen] = useState(false);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const callStartRef = useRef<number>(0);
  const cancelledRef = useRef(false);
  const vadFrameRef = useRef<number | null>(null);
  const speechDetectedRef = useRef(false);
  const lastVoiceAtRef = useRef(0);
  const recordingStartedAtRef = useRef(0);
  const mutedRef = useRef(false);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const cleanup = useCallback(() => {
    cancelledRef.current = true;
    if (vadFrameRef.current != null) {
      cancelAnimationFrame(vadFrameRef.current);
      vadFrameRef.current = null;
    }
    try {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
    } catch {
      /* noop */
    }
    recorderRef.current = null;
    audioChunksRef.current = [];
    mediaStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    mediaStreamRef.current = null;
    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    analyserRef.current = null;
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.src = "";
      audioElRef.current = null;
    }
  }, []);

  const endCall = useCallback(() => {
    setState("ended");
    const durationSec = callStartRef.current
      ? Math.max(0, Math.floor((Date.now() - callStartRef.current) / 1000))
      : 0;
    cleanup();
    onCallEnd?.(durationSec);
    onClose();
  }, [cleanup, onClose, onCallEnd]);

  const fetchTTS = useCallback(
    async (text: string): Promise<Blob> => {
      const res = await fetch("/api/store-ai/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, lang: locale, format: "mp3" }),
      });
      if (!res.ok) {
        const errBody = await res.text();
        console.error("[call] TTS failed:", res.status, errBody);
        throw new Error("TTS request failed");
      }
      return res.blob();
    },
    [locale],
  );

  const playBlob = useCallback((blob: Blob) => {
    return new Promise<void>((resolve, reject) => {
      if (cancelledRef.current) {
        resolve();
        return;
      }
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioElRef.current = audio;

      // Hook the audio element into the Web Audio graph so we can read its
      // amplitude in real time and drive the chat watermark's mouth state.
      // Audio still plays through the speakers because analyser is wired
      // through to ctx.destination.
      let rafId: number | null = null;
      const ctx = audioContextRef.current;
      const dispatchMouth = (active: boolean, level?: number) => {
        try {
          window.dispatchEvent(
            new CustomEvent("merchiva:voice-mouth", { detail: { active, level } }),
          );
        } catch {/* ignore */}
      };
      const stopAnalyser = () => {
        if (rafId != null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
      };
      if (ctx) {
        try {
          const source = ctx.createMediaElementSource(audio);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.6;
          source.connect(analyser);
          analyser.connect(ctx.destination);
          const data = new Uint8Array(analyser.frequencyBinCount);
          const tick = () => {
            analyser.getByteFrequencyData(data);
            // Mean of the low/mid frequency bins (voice sits in the bottom
            // of the spectrum). Normalize to 0-1.
            let sum = 0;
            const used = Math.min(data.length, 32);
            for (let i = 0; i < used; i++) sum += data[i];
            const lvl = sum / used / 255;
            dispatchMouth(true, lvl);
            setMouthOpen(lvl > 0.12);
            rafId = requestAnimationFrame(tick);
          };
          rafId = requestAnimationFrame(tick);
        } catch (err) {
          console.warn("[call] mouth analyser setup failed:", err);
        }
      }

      audio.onended = () => {
        stopAnalyser();
        setMouthOpen(false);
        dispatchMouth(false);
        URL.revokeObjectURL(url);
        resolve();
      };
      audio.onerror = () => {
        stopAnalyser();
        setMouthOpen(false);
        dispatchMouth(false);
        URL.revokeObjectURL(url);
        reject(new Error("Audio playback failed"));
      };
      audio.play().catch((e) => {
        stopAnalyser();
        setMouthOpen(false);
        dispatchMouth(false);
        URL.revokeObjectURL(url);
        reject(e);
      });
    });
  }, []);

  // Stream AI reply + kick off TTS per sentence + play in order.
  // Returns the full spoken text (cleaned for speech).
  const askAndSpeak = useCallback(
    async (userText: string): Promise<string> => {
      setState("thinking");
      const { history, storeContext, memory, permissions, page } = getContext();
      const mcpServers = organizationId
        ? loadStoredMcpServers(organizationId).filter((server) => server.enabled)
        : [];
      // /api/store-ai checks this token belongs to an active member of the org.
      // Same token the chat sends to /api/store-ai/enqueue: the auto-refreshed
      // WorkOS access token, else the stored SpacetimeDB token.
      const token = (await getToken().catch(() => null)) || getStoredToken();

      const res = await fetch("/api/store-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userText,
          history,
          context: storeContext,
          page: page ?? null,
          organizationId,
          token,
          lang: locale,
          stream: true,
          mode: "voice",
          memory,
          permissions,
          ...(mcpServers.length > 0 ? { mcpServers } : {}),
        }),
      });
      if (!res.ok || !res.body) {
        const errBody = !res.body ? "no body" : await res.text();
        console.error("[call] AI stream failed:", res.status, errBody);
        throw new Error("AI request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const ttsQueue: Promise<Blob | null>[] = [];
      let raw = "";
      let buffer = "";
      let streamDone = false;

      const enqueueSentence = (sentence: string) => {
        const cleaned = cleanForSpeech(sentence);
        if (cleaned.length < 2) return;
        ttsQueue.push(fetchTTS(cleaned).catch((e) => {
          console.warn("[call] TTS sentence failed:", e);
          return null;
        }));
      };

      const flushSentences = (final: boolean) => {
        for (;;) {
          const match = SENTENCE_END_RE.exec(buffer);
          if (!match) break;
          const end = match.index + match[0].length;
          const sentence = buffer.slice(0, end);
          buffer = buffer.slice(end);
          enqueueSentence(sentence);
        }
        if (final && buffer.trim()) {
          enqueueSentence(buffer);
          buffer = "";
        }
      };

      // Playback loop: consume TTS results in order, play sequentially.
      const playLoop = (async () => {
        let idx = 0;
        let playedAny = false;
        while (!cancelledRef.current) {
          while (idx >= ttsQueue.length && !streamDone) {
            await new Promise((r) => setTimeout(r, 40));
            if (cancelledRef.current) return;
          }
          if (idx >= ttsQueue.length) return;
          const blob = await ttsQueue[idx];
          idx++;
          if (!blob || cancelledRef.current) continue;
          if (!playedAny) {
            playedAny = true;
            setState("speaking");
          }
          try {
            await playBlob(blob);
          } catch (e) {
            console.warn("[call] Playback error:", e);
          }
        }
      })();

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (!chunk) continue;
          raw += chunk;
          buffer += chunk;
          flushSentences(false);
        }
        flushSentences(true);
      } finally {
        streamDone = true;
      }

      await playLoop;
      return cleanForSpeech(raw);
    },
    [getContext, organizationId, getToken, locale, fetchTTS, playBlob],
  );

  const transcribe = useCallback(
    async (audio: Blob): Promise<string> => {
      setState("transcribing");
      const fd = new FormData();
      fd.append("audio", new File([audio], "speech.webm", { type: audio.type || "audio/webm" }));
      fd.append("lang", locale);
      const res = await fetch("/api/store-ai/stt", { method: "POST", body: fd });
      if (!res.ok) {
        const errBody = await res.text();
        console.error("[call] STT failed:", res.status, errBody);
        throw new Error("STT request failed");
      }
      const data = (await res.json()) as { text?: string };
      return (data.text ?? "").trim();
    },
    [locale],
  );

  const startListening = useCallback(async () => {
    if (cancelledRef.current) return;
    setState("listening");
    setError(null);
    audioChunksRef.current = [];
    speechDetectedRef.current = false;
    lastVoiceAtRef.current = 0;
    recordingStartedAtRef.current = performance.now();

    try {
      if (!mediaStreamRef.current) {
        mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      }
      const stream = mediaStreamRef.current;

      if (!audioContextRef.current) {
        const AudioCtor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioContextRef.current = new AudioCtor();
      }
      const audioCtx = audioContextRef.current;
      if (audioCtx.state === "suspended") await audioCtx.resume();

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        if (cancelledRef.current) return;
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        audioChunksRef.current = [];

        if (!speechDetectedRef.current || blob.size < 2000) {
          // No real speech detected — loop back to listening
          if (!cancelledRef.current) startListening();
          return;
        }

        try {
          const userText = await transcribe(blob);
          if (cancelledRef.current) return;
          if (!userText) {
            startListening();
            return;
          }
          const aiText = await askAndSpeak(userText);
          if (cancelledRef.current) return;
          if (!aiText) {
            setError(t("merchiva.call.aiSilent"));
            setState("error");
            return;
          }
          onTurnComplete?.(userText, aiText);
          if (cancelledRef.current) return;
          startListening();
        } catch (err) {
          if (cancelledRef.current) return;
          console.error("[call] Turn error:", err);
          setError(t("merchiva.call.turnError"));
          setState("error");
        }
      };

      recorder.start(150);

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (cancelledRef.current || recorder.state !== "recording") return;
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length;
        setLevel(avg);

        const now = performance.now();
        const elapsed = now - recordingStartedAtRef.current;

        if (!mutedRef.current && avg > VOICE_LEVEL) {
          if (!speechDetectedRef.current && elapsed >= MIN_SPEECH_MS) {
            speechDetectedRef.current = true;
          }
          lastVoiceAtRef.current = now;
        } else if (speechDetectedRef.current) {
          if (now - lastVoiceAtRef.current > SILENCE_END_MS) {
            try {
              recorder.stop();
            } catch {
              /* noop */
            }
            return;
          }
        }

        if (elapsed > MAX_LISTEN_MS) {
          try {
            recorder.stop();
          } catch {
            /* noop */
          }
          return;
        }

        vadFrameRef.current = requestAnimationFrame(tick);
      };
      vadFrameRef.current = requestAnimationFrame(tick);
    } catch (err) {
      console.error("[call] Mic error:", err);
      setError(
        err instanceof Error && err.name === "NotAllowedError"
          ? t("merchiva.call.micDenied")
          : t("merchiva.call.micError"),
      );
      setState("error");
    }
  }, [askAndSpeak, onTurnComplete, t, transcribe]);

  // Pre-warm mic + AudioContext as soon as the modal opens so the first
  // listen has no cold-start delay.
  const prewarm = useCallback(async () => {
    if (cancelledRef.current) return;
    try {
      if (!mediaStreamRef.current) {
        mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      }
      if (!audioContextRef.current) {
        const AudioCtor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioContextRef.current = new AudioCtor();
      }
      if (audioContextRef.current.state === "suspended") {
        await audioContextRef.current.resume().catch(() => undefined);
      }
    } catch (err) {
      console.warn("[call] Prewarm failed (will retry on listen):", err);
    }
  }, []);

  // Boot when modal opens
  useEffect(() => {
    if (!open) return;
    cancelledRef.current = false;
    callStartRef.current = Date.now();
    setElapsedSec(0);
    setError(null);
    setState("permission");

    // Kick off mic + AudioContext setup immediately so first listen is instant.
    void prewarm();
    const startupTimer = setTimeout(() => {
      if (!cancelledRef.current) startListening();
    }, 100);

    const tickTimer = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - callStartRef.current) / 1000));
    }, 1000);

    return () => {
      clearTimeout(startupTimer);
      clearInterval(tickTimer);
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const stateLabel = useMemo(() => {
    switch (state) {
      case "permission":
        return t("merchiva.call.connecting");
      case "listening":
        return muted ? t("merchiva.call.muted") : t("merchiva.call.listening");
      case "transcribing":
        return t("merchiva.call.transcribing");
      case "thinking":
        return t("merchiva.call.thinking");
      case "speaking":
        return t("merchiva.call.speaking");
      case "error":
        return error ?? t("merchiva.call.errorGeneric");
      case "ended":
        return t("merchiva.call.ended");
      default:
        return "";
    }
  }, [state, muted, error, t]);

  const elapsedLabel = useMemo(() => {
    const m = Math.floor(elapsedSec / 60);
    const s = elapsedSec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }, [elapsedSec]);

  if (!open) return null;

  const ringScale = 1 + Math.min(level / 80, 0.5);

  return (
    <div
      className="fixed inset-0 z-[120] flex flex-col bg-foreground text-background select-none"
      role="dialog"
      aria-modal="true"
      aria-label={t("merchiva.call.title")}
    >
      <header className="flex items-center justify-between px-6 py-4 border-b border-background/10 shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-background/60">
            {t("merchiva.call.title")}
          </span>
          <span className="h-1 w-1 rounded-full bg-emerald-500" />
          <span className="font-mono text-[11px] tabular-nums text-background/80">{elapsedLabel}</span>
        </div>
        <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-background/50">
          {t("merchiva.call.modelTag")}
        </span>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 min-h-0">
        <div className="relative flex flex-col items-center justify-center px-8 py-8 gap-4">
          {/* Pulsing colored ring — bigger so it frames the kaomoji */}
          <div
            className={cn(
              "absolute inset-0  rounded-4xl transition-transform duration-150",
              state === "listening"
                ? "bg-emerald-500/15"
                : state === "speaking"
                  ? "bg-sky-500/15"
                  : state === "thinking" || state === "transcribing"
                    ? "bg-amber-500/15"
                    : "bg-background/10",
            )}
            style={{
              transform: `scale(${state === "listening" || state === "speaking" ? ringScale : 1})`,
            }}
          />
          {/* Big kaomoji avatar. While speaking the mouth swaps between
              closed `‿` and open `O` per audio-analyser amplitude. While
              not speaking we show a calm closed face. The transition is
              instant during speech (transition-none) so the mouth feels
              tied to the audio. */}
          <div
            className={cn(
              "relative font-mono leading-none text-background select-none transition-none",
            )}
            style={{ fontSize: 64, letterSpacing: "0.02em" }}
            aria-hidden="true"
          >
            {state === "speaking"
              ? (mouthOpen ? "(◕O◕)" : "(◕‿◕)")
              : state === "listening"
                ? "(•‿•)"
                : state === "thinking" || state === "transcribing"
                  ? "(￣ω￣)"
                  : "(◕‿◕)"}
          </div>
          <MerchivaLogo className="h-32 w-32"/>
        </div>

        <div className="text-center max-w-md">
          <div className="text-[18px] font-medium tracking-tight mb-1">{t("merchiva.name")}</div>
          <div
            className={cn(
              "text-[13px] font-mono tracking-wide uppercase",
              state === "error" ? "text-destructive" : "text-background/60",
            )}
          >
            {state === "error" && <AlertTriangle className="inline h-3 w-3 mr-1 -mt-0.5" />}
            {stateLabel}
          </div>
        </div>

        {state === "error" && (
          <Button
            size="lg"
            onClick={() => startListening()}
            className="px-4 bg-background text-foreground hover:bg-background/90 text-[13px]"
          >
            {t("merchiva.call.retry")}
          </Button>
        )}

        {(state === "transcribing" || state === "thinking") && (
          <Spinner size={20} className="text-background/60" />
        )}

        {state === "speaking" && (
          <div className="flex items-center gap-1.5 text-background/60">
            <Volume2 className="h-4 w-4" />
            <span className="font-mono text-[10px] uppercase tracking-[0.12em]">
              {t("merchiva.call.playing")}
            </span>
          </div>
        )}
      </div>

      <footer className="flex items-center justify-center gap-4 px-6 py-6 border-t border-background/10 shrink-0">
        <Button
          variant="ghost"
          size="icon-lg"
          onClick={() => setMuted((m) => !m)}
          className={cn(
            "h-14 w-14 rounded-full border",
            muted
              ? "bg-destructive/20 border-destructive/40 text-destructive hover:bg-destructive/30 hover:text-destructive"
              : "bg-background/5 border-background/10 text-background hover:bg-background/10 hover:text-background",
          )}
          aria-label={muted ? t("merchiva.call.unmute") : t("merchiva.call.mute")}
          title={muted ? t("merchiva.call.unmute") : t("merchiva.call.mute")}
        >
          {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </Button>
        <Button
          variant="destructive"
          size="lg"
          onClick={endCall}
          className="h-14 px-6 rounded-full gap-2 bg-destructive text-white hover:bg-destructive/90 text-[13px]"
          aria-label={t("merchiva.call.endCall")}
        >
          <PhoneOff className="h-5 w-5" />
          <span className="hidden sm:inline">{t("merchiva.call.endCall")}</span>
        </Button>
      </footer>
    </div>
  );
}
