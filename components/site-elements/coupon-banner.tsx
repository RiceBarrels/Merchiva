"use client";

import { useState, useEffect } from "react";
import { Copy, Check, Tag } from "lucide-react";

interface CouponBannerProps {
  code?: string;
  discount?: string;
  title?: string;
  description?: string;
  backgroundColor?: string;
  expiresAt?: string; // ISO date string
  isEditor?: boolean;
}

function useCountdown(expiresAt?: string) {
  const [remaining, setRemaining] = useState<string | null>(null);

  useEffect(() => {
    if (!expiresAt) return;

    function calc() {
      const diff = new Date(expiresAt!).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining("Expired");
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (d > 0) setRemaining(`${d}d ${h}h ${m}m`);
      else if (h > 0) setRemaining(`${h}h ${m}m ${s}s`);
      else setRemaining(`${m}m ${s}s`);
    }

    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return remaining;
}

export function CouponBanner({
  code = "SAVE20",
  discount = "20% OFF",
  title = "Limited Time Offer",
  description = "Use this code at checkout to save on your next order.",
  backgroundColor = "#1c1917",
  expiresAt,
  isEditor = false,
}: CouponBannerProps) {
  const [copied, setCopied] = useState(false);
  const countdown = useCountdown(expiresAt);

  function handleCopy() {
    if (isEditor) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      // Haptic feedback on mobile
      if (navigator.vibrate) navigator.vibrate(50);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  return (
    <div
      className="px-5 py-4 text-white overflow-hidden relative"
      style={{ backgroundColor, borderRadius: "0.3rem" }}
    >
      {/* Background pattern */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: "repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)",
          backgroundSize: "12px 12px",
        }}
      />

      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Tag className="h-4 w-4 opacity-70" />
              <span className="text-xs font-medium opacity-70 uppercase tracking-wider">{title}</span>
            </div>
            <p className="text-2xl font-bold tracking-tight">{discount}</p>
            {description && (
              <p className="text-sm opacity-75 mt-1 leading-snug">{description}</p>
            )}
            {countdown && (
              <p className="text-xs font-mono mt-2 opacity-60">
                Expires in: <span className="font-semibold opacity-100">{countdown}</span>
              </p>
            )}
          </div>

          <div className="flex-shrink-0 flex flex-col items-end gap-2">
            <div
              className="border-2 border-dashed border-white/30 bg-white/10 px-3 py-1.5 text-center"
              style={{ borderRadius: "0.3rem" }}
            >
              <p className="text-xs opacity-60 mb-0.5">Promo Code</p>
              <p className="font-mono font-bold tracking-widest text-lg">{code}</p>
            </div>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-xs font-medium transition-colors"
              style={{ borderRadius: "0.3rem" }}
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied!" : "Copy code"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
