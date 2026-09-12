"use client";

// Dots + shuffled numeric pad with an error shake.

import { useCallback, useEffect, useState } from "react";
import { Delete } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { hapticError, hapticLight, hapticSuccess } from "@/lib/haptics";

export interface PinPadProps {
  length?: number;                       // default 4
  onComplete: (pin: string) => boolean | Promise<boolean>;
  /** Larger keys (64px) for the tablet log-in pane. */
  size?: "md" | "lg";
  shuffle?: boolean;                     // default true
  className?: string;
}

function makeKeys(shuffle: boolean): number[] {
  const k = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
  if (!shuffle) return k;
  for (let i = k.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [k[i], k[j]] = [k[j], k[i]];
  }
  return k;
}

export function PinPad({ length = 4, onComplete, size = "md", shuffle = true, className }: PinPadProps) {
  const [pin, setPin] = useState("");
  const [keys, setKeys] = useState<number[]>(() => makeKeys(false));
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  // Shuffle on the client only (avoids hydration mismatch).
  useEffect(() => {
    setKeys(makeKeys(shuffle));
  }, [shuffle]);

  const reset = useCallback(() => {
    setPin("");
    setKeys(makeKeys(shuffle));
  }, [shuffle]);

  const push = async (d: number) => {
    if (busy || pin.length >= length) return;
    hapticLight();
    const nextPin = pin + String(d);
    setPin(nextPin);
    if (nextPin.length === length) {
      setBusy(true);
      await new Promise((r) => setTimeout(r, 120));
      let ok = false;
      try {
        ok = await onComplete(nextPin);
      } catch {
        ok = false;
      }
      if (ok) {
        hapticSuccess();
        setBusy(false);
        setPin("");
        return;
      }
      hapticError();
      setError(true);
      setTimeout(() => {
        setError(false);
        reset();
        setBusy(false);
      }, 400);
    }
  };

  const back = () => {
    if (busy) return;
    hapticLight();
    setPin((p) => p.slice(0, -1));
  };

  const lg = size === "lg";
  const keyCls = cn(
    "grid place-items-center rounded-lg border border-border font-medium select-none active:bg-muted",
    lg ? "h-16 text-[22px]" : "h-[52px] text-[20px]",
  );

  return (
    <div className={cn("flex flex-col", className)}>
      <motion.div
        animate={error ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
        transition={{ duration: 0.35 }}
        className={cn("flex justify-center", lg ? "mb-7 mt-8 gap-4" : "mb-[18px] mt-1.5 gap-3.5")}
      >
        {Array.from({ length }).map((_, i) => (
          <i
            key={i}
            className={cn(
              "rounded-full border-[1.5px] transition-colors duration-150",
              lg ? "h-4 w-4" : "h-3.5 w-3.5",
              error ? "border-destructive" : "border-foreground",
              i < pin.length && (error ? "bg-destructive" : "bg-foreground"),
            )}
          />
        ))}
      </motion.div>
      <div className="grid grid-cols-3 gap-2">
        {keys.slice(0, 9).map((k) => (
          <button key={k} type="button" className={keyCls} onClick={() => push(k)} disabled={busy}>
            {k}
          </button>
        ))}
        <div />
        <button type="button" className={keyCls} onClick={() => push(keys[9])} disabled={busy}>
          {keys[9]}
        </button>
        <button type="button" className={cn(keyCls, "text-muted-foreground")} onClick={back} disabled={busy} aria-label="Backspace">
          <Delete className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
