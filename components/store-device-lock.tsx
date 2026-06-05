"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Lock, Delete, ArrowLeft } from "lucide-react";
import { useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { usePermissions } from "@/lib/context/permissions";
import { useStoreMachineMode, useDeviceName } from "@/lib/store-machine-mode";
import {
  getAutolockSeconds,
  setCurrentOperator,
  getCurrentOperator,
} from "@/lib/store-device-lock";
import { useT } from "@/lib/i18n/context";
import { hapticSuccess, hapticMedium, hapticLight } from "@/lib/haptics";
import { Spinner } from "@/components/ui/loaders/geometric";
import { cn } from "@/lib/utils";

interface MemberRow {
  id: { toString(): string };
  organizationId: string;
  status: string;
  displayName: string;
  punchInCode?: string;
}

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?"
  );
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function useTick(ms = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function StoreDeviceLock() {
  const t = useT();
  const now = useTick();
  const { organizationId } = usePermissions();
  const [storeMachine] = useStoreMachineMode();
  const [deviceName] = useDeviceName();
  const [memberRows] = useTable(tables.orgMember);

  const [locked, setLocked] = useState(false);
  const [stage, setStage] = useState<"picker" | "pin">("picker");
  const [selected, setSelected] = useState<MemberRow | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

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
      setStage("picker");
      setSelected(null);
      setPin("");
      setError(null);
    }, seconds * 1000);
  }, [storeMachine, locked, clearTimer]);

  useEffect(() => {
    if (!storeMachine || locked) {
      clearTimer();
      return;
    }
    const handler = () => scheduleLock();
    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, handler, { passive: true }));
    scheduleLock();
    return () => {
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, handler));
      clearTimer();
    };
  }, [storeMachine, locked, scheduleLock, clearTimer]);

  // If we leave store-machine mode, drop the lock so the regular UI isn't blocked.
  useEffect(() => {
    if (!storeMachine && locked) {
      setLocked(false);
      setStage("picker");
      setSelected(null);
      setPin("");
      setError(null);
    }
  }, [storeMachine, locked]);

  // External force-lock trigger (e.g. operator chip logout button).
  useEffect(() => {
    if (!storeMachine) return;
    const handler = () => {
      clearTimer();
      setLocked(true);
      setStage("picker");
      setSelected(null);
      setPin("");
      setError(null);
    };
    window.addEventListener("store-device-force-lock", handler);
    return () => window.removeEventListener("store-device-force-lock", handler);
  }, [storeMachine, clearTimer]);

  // Active members in this org that have a punch-in code (eligible to unlock).
  const eligibleMembers = useMemo<MemberRow[]>(() => {
    if (!organizationId) return [];
    const rows = (memberRows as unknown as MemberRow[]).filter(
      (m) =>
        m.organizationId === organizationId &&
        m.status === "active" &&
        typeof m.punchInCode === "string" &&
        m.punchInCode.length > 0,
    );
    return rows.slice().sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [memberRows, organizationId]);

  // PIN verification — runs whenever 4 digits are present.
  useEffect(() => {
    if (!locked || stage !== "pin" || pin.length !== 4) return;
    const member = selected
      ? (selected.punchInCode === pin ? selected : null)
      : (memberRows as unknown as MemberRow[]).find(
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
    setStage("picker");
    setSelected(null);
    setPin("");
    setError(null);
  }, [pin, locked, stage, selected, memberRows, organizationId, t]);

  // Keyboard input for PIN entry.
  useEffect(() => {
    if (!locked || stage !== "pin") return;
    const handler = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        setPin((p) => (p.length >= 4 ? p : p + e.key));
        hapticLight();
        setError(null);
      } else if (e.key === "Backspace") {
        setPin((p) => p.slice(0, -1));
      } else if (e.key === "Escape") {
        setStage("picker");
        setSelected(null);
        setPin("");
        setError(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [locked, stage]);

  if (!storeMachine || !locked) return null;

  const currentOp = getCurrentOperator();
  const clock = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const dateLine = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-background"
      role="dialog"
      aria-modal="true"
    >
      {/* Top status bar */}
      <header className="h-11 shrink-0 border-b border-background/20 bg-foreground text-background flex items-center px-4 gap-3">
        <Lock className="h-3.5 w-3.5" />
        <span className="font-mono text-xs font-bold tracking-[0.18em]">
          {t("components.store.appName")}
        </span>
        <span className="w-px h-4 bg-background/30" />
        <span className="text-[13px] font-semibold">{t("lock.title")}</span>
        <span className="ml-auto text-[11px] font-mono text-muted-foreground truncate">
          {deviceName ? deviceName.toUpperCase() : t("components.store.terminal")}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl w-full px-6 py-8 sm:py-12">
          {/* Clock + store header */}
          <div className="text-center mb-8 sm:mb-10">
            <div className="font-mono text-[64px] sm:text-[88px] font-bold tracking-tight leading-none tabular-nums">
              {clock}
            </div>
            <div className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground mt-3 uppercase">
              {dateLine}
            </div>
            {deviceName && (
              <div className="mt-4 text-base sm:text-lg font-semibold tracking-tight">
                {deviceName}
              </div>
            )}
            {currentOp?.name && stage === "picker" && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("lock.subtitleWithOp").replace("{name}", currentOp.name)}
              </p>
            )}
          </div>

          {stage === "picker" && (
            <>
              <div className="text-center mb-4">
                <p className="font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
                  {t("lock.tapToUnlock")}
                </p>
              </div>
              {eligibleMembers.length === 0 ? (
                <div className="border border-border rounded-[0.3rem] p-6 text-center">
                  <p className="text-sm text-muted-foreground">{t("lock.noMembers")}</p>
                  <button
                    onClick={() => setStage("pin")}
                    className="mt-4 inline-flex items-center px-4 py-2 border border-foreground rounded-[0.3rem] text-sm font-semibold hover:bg-muted"
                  >
                    {t("lock.enterPin")}
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 sm:gap-3">
                    {eligibleMembers.map((m) => (
                      <button
                        key={m.id.toString()}
                        onClick={() => {
                          hapticLight();
                          setSelected(m);
                          setPin("");
                          setError(null);
                          setStage("pin");
                        }}
                        className="group border border-border rounded-[0.3rem] p-3 bg-background hover:bg-muted active:bg-muted transition-colors flex flex-col items-center gap-2"
                      >
                        <div className="h-12 w-12 rounded-[0.3rem] bg-foreground text-background flex items-center justify-center font-mono text-sm font-semibold">
                          {initials(m.displayName)}
                        </div>
                        <div className="text-[12px] font-semibold leading-tight text-center truncate w-full">
                          {m.displayName}
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="text-center mt-6">
                    <button
                      onClick={() => {
                        hapticLight();
                        setSelected(null);
                        setPin("");
                        setError(null);
                        setStage("pin");
                      }}
                      className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
                    >
                      {t("lock.enterPin")}
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {stage === "pin" && (
            <div className="max-w-xs mx-auto space-y-6">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => {
                    setStage("picker");
                    setSelected(null);
                    setPin("");
                    setError(null);
                  }}
                  className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-3 w-3" />
                  {t("lock.back")}
                </button>
                {selected && (
                  <span className="text-[11px] font-semibold truncate">
                    {selected.displayName}
                  </span>
                )}
              </div>

              <div className="flex justify-center gap-2">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-12 w-12 flex items-center justify-center border text-xl font-mono tabular-nums rounded-[0.3rem]",
                      pin.length > i
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-background text-muted-foreground",
                    )}
                  >
                    {pin.length > i ? "•" : ""}
                  </div>
                ))}
              </div>

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

              {/* On-screen keypad */}
              <div className="grid grid-cols-3 gap-2">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
                  <button
                    key={k}
                    onClick={() => {
                      hapticLight();
                      setError(null);
                      setPin((p) => (p.length >= 4 ? p : p + k));
                    }}
                    className="rounded-[0.3rem] border border-border bg-background text-2xl font-medium shadow-[0_1px_0_rgb(229,229,229)] active:translate-y-px active:shadow-none active:bg-muted transition-all select-none min-h-[56px]"
                  >
                    {k}
                  </button>
                ))}
                <button
                  onClick={() => {
                    hapticLight();
                    setPin("");
                    setError(null);
                  }}
                  className="rounded-[0.3rem] border border-border bg-muted font-mono text-xs font-medium text-muted-foreground active:translate-y-px active:bg-muted transition-all select-none min-h-[56px]"
                >
                  {t("lock.clear")}
                </button>
                <button
                  onClick={() => {
                    hapticLight();
                    setError(null);
                    setPin((p) => (p.length >= 4 ? p : p + "0"));
                  }}
                  className="rounded-[0.3rem] border border-border bg-background text-2xl font-medium shadow-[0_1px_0_rgb(229,229,229)] active:translate-y-px active:shadow-none active:bg-muted transition-all select-none min-h-[56px]"
                >
                  0
                </button>
                <button
                  onClick={() => {
                    hapticLight();
                    setPin((p) => p.slice(0, -1));
                  }}
                  className="rounded-[0.3rem] border border-border bg-muted text-muted-foreground active:translate-y-px active:bg-muted transition-all select-none flex items-center justify-center min-h-[56px]"
                >
                  <Delete className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
