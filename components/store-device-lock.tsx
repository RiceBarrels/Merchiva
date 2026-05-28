"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { usePermissions } from "@/lib/context/permissions";
import { useStoreMachineMode } from "@/lib/store-machine-mode";
import {
  getAutolockSeconds,
  setCurrentOperator,
  getCurrentOperator,
} from "@/lib/store-device-lock";
import { useT } from "@/lib/i18n/context";
import { hapticSuccess, hapticMedium } from "@/lib/haptics";
import { Spinner } from "@/components/ui/loaders/geometric";

interface MemberRow {
  id: { toString(): string };
  organizationId: string;
  status: string;
  displayName: string;
  punchInCode?: string;
}

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;

export function StoreDeviceLock() {
  const t = useT();
  const { organizationId } = usePermissions();
  const [storeMachine] = useStoreMachineMode();
  const [memberRows] = useTable(tables.orgMember);

  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Track timeout in a ref so activity handlers can reset without re-rendering.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleLock = useCallback(() => {
    clearTimer();
    if (!storeMachine || locked) return;
    const seconds = getAutolockSeconds();
    if (seconds <= 0) return; // 0 = never
    timerRef.current = setTimeout(() => {
      setLocked(true);
      setPin("");
      setError(null);
    }, seconds * 1000);
  }, [storeMachine, locked, clearTimer]);

  // Reset timer on any user activity while in store-machine mode and unlocked.
  useEffect(() => {
    if (!storeMachine || locked) {
      clearTimer();
      return;
    }
    const handler = () => scheduleLock();
    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, handler, { passive: true }));
    scheduleLock(); // start timer on mount / when conditions become true
    return () => {
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, handler));
      clearTimer();
    };
  }, [storeMachine, locked, scheduleLock, clearTimer]);

  // If we leave store-machine mode, drop the lock so the regular UI isn't blocked.
  useEffect(() => {
    if (!storeMachine && locked) {
      setLocked(false);
      setPin("");
      setError(null);
    }
  }, [storeMachine, locked]);

  // Auto-focus PIN input when lock appears.
  useEffect(() => {
    if (locked) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 50);
      return () => window.clearTimeout(id);
    }
  }, [locked]);

  // Auto-submit when 4 digits entered.
  useEffect(() => {
    if (!locked || pin.length !== 4) return;
    const member = (memberRows as unknown as MemberRow[]).find(
      (m) =>
        m.organizationId === organizationId &&
        m.status === "active" &&
        typeof m.punchInCode === "string" &&
        m.punchInCode === pin,
    );
    if (!member) {
      setError(t("lock.pinNotRecognized"));
      hapticMedium();
      const timeout = window.setTimeout(() => {
        setPin("");
        setError(null);
      }, 800);
      return () => window.clearTimeout(timeout);
    }
    setCurrentOperator({ memberId: member.id.toString(), name: member.displayName ?? "" });
    hapticSuccess();
    setLocked(false);
    setPin("");
    setError(null);
  }, [pin, locked, memberRows, organizationId, t]);

  if (!storeMachine || !locked) return null;

  const currentOp = getCurrentOperator();

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="w-full max-w-xs space-y-6 px-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded border border-border bg-muted">
            <Lock className="h-5 w-5 text-foreground" />
          </div>
          <h1 className="text-base font-semibold tracking-tight text-foreground">
            {t("lock.title")}
          </h1>
          <p className="text-xs text-muted-foreground">
            {currentOp?.name
              ? t("lock.subtitleWithOp").replace("{name}", currentOp.name)
              : t("lock.subtitle")}
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex justify-center gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-10 w-10 flex items-center justify-center border text-base font-mono tabular-nums rounded ${
                  pin.length > i ? "border-foreground bg-foreground text-background" : "border-border bg-background text-muted-foreground"
                }`}
              >
                {pin.length > i ? "•" : ""}
              </div>
            ))}
          </div>
          <input
            ref={inputRef}
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={pin}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 4);
              setPin(v);
              setError(null);
            }}
            className="sr-only"
            aria-label={t("lock.pinLabel")}
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.focus()}
            className="w-full text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            {t("lock.tapToType")}
          </button>
          {error && (
            <p className="text-center text-xs text-red-600 dark:text-red-400 font-medium">
              {error}
            </p>
          )}
          {pin.length === 4 && !error && (
            <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
              <Spinner size={12} />
              {t("lock.verifying")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
