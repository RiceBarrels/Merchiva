"use client";

// Renders `value` as a QR inside a bordered square with corner marks.

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { cn } from "@/lib/utils";

export interface QrCodeViewProps {
  value: string;
  size?: number;                 // px, default 240
  caption?: string;
  status?: "idle" | "refreshing" | "ok";
  onClick?: () => void;
  className?: string;
}

function Corner({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  return (
    <i
      className={cn(
        "absolute h-[30px] w-[30px] border-[3px] border-current",
        pos === "tl" && "left-3 top-3 border-b-0 border-r-0",
        pos === "tr" && "right-3 top-3 border-b-0 border-l-0",
        pos === "bl" && "bottom-3 left-3 border-r-0 border-t-0",
        pos === "br" && "bottom-3 right-3 border-l-0 border-t-0",
      )}
    />
  );
}

export function QrCodeView({ value, size = 240, caption, status = "idle", onClick, className }: QrCodeViewProps) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!value) return;
    QRCode.toDataURL(value, { margin: 0, errorCorrectionLevel: "M", width: size * 2 })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  const ok = status === "ok";
  return (
    <div
      onClick={onClick}
      style={{ width: size, height: size }}
      className={cn(
        "relative overflow-hidden rounded border transition-colors",
        ok ? "border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900 dark:bg-emerald-950" : "border-border bg-muted text-foreground",
        onClick && "cursor-pointer",
        className,
      )}
    >
      <Corner pos="tl" />
      <Corner pos="tr" />
      <Corner pos="bl" />
      <Corner pos="br" />
      {src && value && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          draggable={false}
          className={cn(
            "absolute inset-[52px] h-auto w-[calc(100%-104px)] select-none transition-opacity duration-300",
            status === "refreshing" && "opacity-15",
            ok && "opacity-20",
          )}
          style={{ imageRendering: "pixelated" }}
        />
      )}
      {caption && (
        <div
          className={cn(
            "absolute inset-x-0 bottom-2 text-center text-[10px] font-medium tracking-[0.04em]",
            ok ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
          )}
        >
          {caption}
        </div>
      )}
    </div>
  );
}
