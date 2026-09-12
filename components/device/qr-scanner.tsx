"use client";

// Live camera preview with a scan line; decodes via BarcodeDetector when
// available, else jsQR on a canvas at ~10 fps.

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";

export interface QrScannerProps {
  active: boolean;
  onResult: (text: string) => void;
  onError?: (message: string) => void;
  /** Success state: hides the scan line, emerald border, shows `successText`. */
  success?: boolean;
  successText?: string;
  hint?: string;
  size?: number;                 // px, default 200
  className?: string;
}

interface DetectedBarcode { rawValue: string }
interface BarcodeDetectorLike { detect(source: ImageBitmapSource): Promise<DetectedBarcode[]> }
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

function Corner({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  return (
    <i
      className={cn(
        "absolute h-[26px] w-[26px] border-[3px] border-current",
        pos === "tl" && "left-3 top-3 border-b-0 border-r-0",
        pos === "tr" && "right-3 top-3 border-b-0 border-l-0",
        pos === "bl" && "bottom-3 left-3 border-r-0 border-t-0",
        pos === "br" && "bottom-3 right-3 border-l-0 border-t-0",
      )}
    />
  );
}

export function QrScanner({ active, onResult, onError, success, successText, hint, size = 200, className }: QrScannerProps) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastRef = useRef<string | null>(null);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  onResultRef.current = onResult;
  onErrorRef.current = onError;
  const [camReady, setCamReady] = useState(false);

  useEffect(() => {
    if (!active) {
      setCamReady(false);
      lastRef.current = null;
      return;
    }
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const videoEl = videoRef.current;

    (async () => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        onErrorRef.current?.(t("device.cameraUnsupported"));
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch (err) {
        onErrorRef.current?.(err instanceof Error && err.name === "NotAllowedError" ? t("device.cameraDenied") : t("device.cameraUnavailable"));
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((tr) => tr.stop());
        return;
      }
      const video = videoEl;
      if (!video) return;
      video.srcObject = stream;
      try { await video.play(); } catch { /* autoplay blocked; user gesture will start it */ }
      setCamReady(true);

      const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
      let detector: BarcodeDetectorLike | null = null;
      if (Ctor) {
        try { detector = new Ctor({ formats: ["qr_code"] }); } catch { detector = null; }
      }
      type JsQr = (data: Uint8ClampedArray, w: number, h: number) => { data: string } | null;
      let jsqr: JsQr | null = null;
      if (!detector) {
        try {
          const mod = await import("jsqr");
          jsqr = mod.default as unknown as JsQr;
        } catch {
          onErrorRef.current?.(t("device.cameraUnsupported"));
          return;
        }
      }
      const emit = (text: string) => {
        if (!text || text === lastRef.current) return;
        lastRef.current = text;
        onResultRef.current(text);
      };
      let busy = false;
      timer = setInterval(async () => {
        if (busy || stopped || !video.videoWidth) return;
        busy = true;
        try {
          if (detector) {
            const codes = await detector.detect(video);
            if (codes.length) emit(codes[0].rawValue);
          } else if (jsqr) {
            if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
            const c = canvasRef.current;
            const w = Math.min(480, video.videoWidth);
            const h = Math.round((video.videoHeight / video.videoWidth) * w);
            c.width = w;
            c.height = h;
            const ctx = c.getContext("2d", { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(video, 0, 0, w, h);
              const img = ctx.getImageData(0, 0, w, h);
              const res = jsqr(img.data, w, h);
              if (res?.data) emit(res.data);
            }
          }
        } catch {
          // ignore frame errors
        } finally {
          busy = false;
        }
      }, 100);
    })();

    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
      if (videoEl) videoEl.srcObject = null;
      setCamReady(false);
    };
  }, [active, t]);

  return (
    <div
      style={{ width: size, height: size }}
      className={cn(
        "relative mx-auto overflow-hidden rounded border transition-colors",
        success ? "border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900 dark:bg-emerald-950" : "border-border bg-muted text-foreground",
        className,
      )}
    >
      <video ref={videoRef} muted playsInline className={cn("absolute inset-0 h-full w-full object-cover", (!camReady || success) && "opacity-0")} />
      <Corner pos="tl" />
      <Corner pos="tr" />
      <Corner pos="bl" />
      <Corner pos="br" />
      {!success && active && (
        <i
          className="absolute left-3 right-3 h-[2px] animate-[device-scan_1.6s_ease-in-out_infinite_alternate] bg-destructive shadow-[0_0_12px_var(--destructive)]"
          style={{ top: 14 }}
        />
      )}
      <div
        className={cn(
          "absolute inset-0 grid place-items-center px-3 text-center text-[11px] font-semibold uppercase tracking-[0.06em]",
          success ? "text-emerald-600 dark:text-emerald-400" : camReady ? "text-transparent" : "text-muted-foreground",
        )}
      >
        {success ? successText ?? t("device.scanned") : hint ?? t("device.pointAtQr")}
      </div>
    </div>
  );
}
