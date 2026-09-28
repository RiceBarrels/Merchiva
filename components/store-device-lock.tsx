"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { usePermissions } from "@/lib/context/permissions";
import { useStoreMachineMode, useDeviceName } from "@/lib/store-machine-mode";
import {
  getAutolockSeconds,
  setCurrentOperator,
  getCurrentOperator,
} from "@/lib/store-device-lock";
import { recordPunch, resolveDeviceOperator } from "@/lib/spacetimedb/actions";
import { useT } from "@/lib/i18n/context";
import { hapticSuccess, hapticMedium, hapticLight } from "@/lib/haptics";
import { Spinner } from "@/components/ui/loaders/geometric";
import { cn } from "@/lib/utils";

interface MemberRow {
  id: { toString(): string };
  organizationId: string;
  status: string;
  displayName: string;
}

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;

const pad = (n: number) => String(n).padStart(2, "0");
const fmtClock = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const fmtDate = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

function useTick(ms = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function Corners() {
  const cls = "absolute w-2.5 h-2.5 text-muted-foreground";
  return (
    <>
      <svg className={cn(cls, "top-2 left-2")} viewBox="0 0 10 10">
        <path d="M0 0h4M0 0v4" fill="none" stroke="currentColor" strokeWidth="1" />
      </svg>
      <svg className={cn(cls, "top-2 right-2 -scale-x-100")} viewBox="0 0 10 10">
        <path d="M0 0h4M0 0v4" fill="none" stroke="currentColor" strokeWidth="1" />
      </svg>
      <svg className={cn(cls, "bottom-2 left-2 -scale-y-100")} viewBox="0 0 10 10">
        <path d="M0 0h4M0 0v4" fill="none" stroke="currentColor" strokeWidth="1" />
      </svg>
      <svg className={cn(cls, "bottom-2 right-2 -scale-100")} viewBox="0 0 10 10">
        <path d="M0 0h4M0 0v4" fill="none" stroke="currentColor" strokeWidth="1" />
      </svg>
    </>
  );
}

interface OperatorSessionRow {
  organizationId: string;
  memberId: string;
  memberName: string;
  role: string;
  resolvedAt: { toDate?: () => Date };
}

type Stage = "entry" | "verifying" | "success";

export function StoreDeviceLock() {
  const t = useT();
  const now = useTick();
  const { organizationId } = usePermissions();
  const [storeMachine] = useStoreMachineMode();
  const [deviceName] = useDeviceName();
  const [memberRows] = useTable(tables.orgMember);
  // Written by the `resolveDeviceOperator` reducer; RLS scopes it to this
  // device's identity, so it only ever holds this tablet's own result.
  const [operatorRows] = useTable(tables.deviceOperatorSession);

  // In store-machine mode the device is locked by default — even on a fresh
  // load or refresh. The next user has to identify themselves with their PIN
  // before they can use the app.
  const [locked, setLocked] = useState(true);
  const [stage, setStage] = useState<Stage>("entry");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [punchedMember, setPunchedMember] = useState<MemberRow | null>(null);
  const [punchedAction, setPunchedAction] = useState<string | null>(null);

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
    if (seconds <= 0) return;
    timerRef.current = setTimeout(() => {
      setLocked(true);
      setStage("entry");
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

  // Drop the lock when leaving store mode; re-lock when re-entering it. Anchored
  // off a ref of the previous value so we only react to actual transitions, not
  // every render.
  const prevStoreMachineRef = useRef<boolean | null>(null);
  useEffect(() => {
    const prev = prevStoreMachineRef.current;
    prevStoreMachineRef.current = storeMachine;
    if (prev === storeMachine) return;
    if (!storeMachine) {
      // Leaving store mode → drop the lock so the normal UI isn't blocked.
      if (locked) {
        setLocked(false);
        setStage("entry");
        setPin("");
        setError(null);
      }
    } else if (prev === false) {
      // Entering store mode (after a toggle) → force re-identification.
      setLocked(true);
      setStage("entry");
      setPin("");
      setError(null);
    }
  }, [storeMachine, locked]);

  // External force-lock trigger (operator chip logout button).
  useEffect(() => {
    if (!storeMachine) return;
    const handler = () => {
      clearTimer();
      setLocked(true);
      setStage("entry");
      setPin("");
      setError(null);
    };
    window.addEventListener("store-device-force-lock", handler);
    return () => window.removeEventListener("store-device-force-lock", handler);
  }, [storeMachine, clearTimer]);

  // Reset entry state every time we re-enter the lock screen.
  useEffect(() => {
    if (locked) {
      setStage("entry");
      setPin("");
      setError(null);
    }
  }, [locked]);

  // Auto-clear errors after a short delay.
  useEffect(() => {
    if (!error) return;
    const id = window.setTimeout(() => {
      setError(null);
      setPin("");
    }, 1200);
    return () => window.clearTimeout(id);
  }, [error]);

  // Auto-dismiss success state.
  useEffect(() => {
    if (stage !== "success") return;
    const id = window.setTimeout(() => {
      setLocked(false);
      setStage("entry");
      setPin("");
      setPunchedMember(null);
      setPunchedAction(null);
    }, 2200);
    return () => window.clearTimeout(id);
  }, [stage]);

  const handleDigit = useCallback(
    (d: string) => {
      if (!locked || stage !== "entry") return;
      hapticLight();
      setError(null);
      setPin((prev) => (prev.length >= 4 ? prev : prev + d));
    },
    [locked, stage],
  );

  const handleBackspace = useCallback(() => {
    if (!locked || stage !== "entry") return;
    hapticLight();
    setPin((p) => p.slice(0, -1));
  }, [locked, stage]);

  const handleClear = useCallback(() => {
    if (!locked || stage !== "entry") return;
    hapticLight();
    setPin("");
    setError(null);
  }, [locked, stage]);

  // Unlocking is a two-step handshake because SpacetimeDB reducers cannot
  // return a value.
  //
  //   1. 4 digits entered  → call `resolveDeviceOperator(code)`. The module
  //      matches the PIN against `member_punch_code` (which this tablet cannot
  //      read) and, on success, writes the operator to
  //      `device_operator_session` for this identity. A PIN that matches
  //      nobody rejects the call and writes nothing.
  //   2. The call succeeded → read the operator from the session row. The SDK
  //      applies the caller's own row change to the client cache before it
  //      settles the reducer promise, so the row is the one this attempt wrote.
  //
  // `awaitingSince` names the attempt in flight and `resolvedAttempt` the one
  // whose call succeeded; step 2 needs both to match. A session row alone
  // proves nothing: one left from an earlier unlock would open the lock for
  // any PIN, as the operator who left it.
  const [awaitingSince, setAwaitingSince] = useState<number | null>(null);
  const [resolvedAttempt, setResolvedAttempt] = useState<number | null>(null);

  useEffect(() => {
    if (!locked || stage !== "entry" || pin.length !== 4) return;
    const code = pin;
    const attempt = Date.now();
    setStage("verifying");
    setAwaitingSince(attempt);
    void resolveDeviceOperator(code).then(
      () => setResolvedAttempt(attempt),
      () => {
        hapticMedium();
        setError(t("lock.pinNotRecognized"));
        // Clear the digits with the stage: back at "entry" with 4 digits still
        // in `pin`, this effect would submit the same wrong PIN again.
        setPin("");
        setStage("entry");
        setAwaitingSince(null);
      },
    );
  }, [pin, locked, stage, t]);

  useEffect(() => {
    if (stage !== "verifying" || awaitingSince === null || resolvedAttempt !== awaitingSince) return;

    const session = (operatorRows as unknown as OperatorSessionRow[]).find(
      (r) => r.organizationId === organizationId,
    );
    if (!session) return;   // not streamed back yet — wait for the next update

    setAwaitingSince(null);
    const member: MemberRow = {
      id: { toString: () => session.memberId },
      organizationId: session.organizationId,
      status: "active",
      displayName: session.memberName,
    };
    const code = pin;

    // Set operator first so any reducer kicked off below tags rows with the
    // correct identity (e.g. inventory actions read this from localStorage).
    setCurrentOperator({ memberId: member.id.toString(), name: member.displayName ?? "" });

    (async () => {
      // Auto punch — server-side "auto" resolves to:
      //   not on shift → in
      //   on break     → break-end
      //   on shift     → NEEDS_EXPLICIT_ACTION (we ignore, treat as plain unlock)
      let action: string | null = null;
      try {
        await recordPunch(code, "auto");
        action = "in"; // optimistic — server logged it
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("NEEDS_EXPLICIT_ACTION")) {
          action = null; // already on shift — just unlocking
        } else {
          // Punch failed for an unexpected reason. Don't block the unlock —
          // the user identified themselves correctly with their PIN. Surface
          // it to the console for diagnostics.
          console.warn("[StoreDeviceLock] auto punch failed:", msg);
          action = null;
        }
      }

      hapticSuccess();
      setPunchedMember(member);
      setPunchedAction(action);
      setStage("success");
    })();
  }, [stage, awaitingSince, resolvedAttempt, operatorRows, organizationId, pin]);

  // A resolve that never streams back must not strand the keypad in
  // "verifying" — fall back to the normal error path after a few seconds.
  useEffect(() => {
    if (stage !== "verifying" || awaitingSince === null) return;
    const id = setTimeout(() => {
      setAwaitingSince(null);
      hapticMedium();
      setError(t("lock.pinNotRecognized"));
      setPin("");
      setStage("entry");
    }, 6000);
    return () => clearTimeout(id);
  }, [stage, awaitingSince, t]);

  // Hardware keyboard input — works alongside the on-screen keypad.
  useEffect(() => {
    if (!locked) return;
    const handler = (e: KeyboardEvent) => {
      if (stage === "entry") {
        if (/^[0-9]$/.test(e.key)) handleDigit(e.key);
        else if (e.key === "Backspace") handleBackspace();
        else if (e.key === "Escape") handleClear();
      } else if (stage === "success") {
        if (/^[0-9]$/.test(e.key) || e.key === "Enter" || e.key === "Escape") {
          setLocked(false);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [locked, stage, handleDigit, handleBackspace, handleClear]);

  if (!storeMachine || !locked) return null;

  const currentOp = getCurrentOperator();

  return (
    <div className="fixed inset-0 z-[100] bg-muted overflow-hidden flex flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl w-full p-3 sm:p-4 lg:p-6">
          <div className="relative bg-background border border-border rounded-lg p-4 sm:p-5 lg:p-6 flex flex-col">
            <Corners />

            {/* Header: title + clock */}
            <div className="flex justify-between items-start gap-3 mb-4 sm:mb-5">
              <div className="min-w-0">
                <div className="hidden sm:block font-mono text-[11px] tracking-[0.14em] text-muted-foreground mb-2">
                  01 · {t("lock.headerStep").toUpperCase()}
                </div>
                <h1 className="text-lg sm:text-xl lg:text-2xl font-bold tracking-tight">
                  {t("lock.enterPinTitle")}
                </h1>
                <p className="text-[12px] sm:text-[13px] text-muted-foreground mt-1 leading-relaxed hidden sm:block">
                  {t("lock.enterPinHint")}
                </p>
                {currentOp?.name && (
                  <p className="text-[11px] text-muted-foreground mt-2 font-mono tracking-wider">
                    {t("lock.subtitleWithOp").replace("{name}", currentOp.name)}
                  </p>
                )}
              </div>
              <div className="text-right border border-border rounded-lg px-2.5 sm:px-3.5 py-2 sm:py-2.5 bg-muted shrink-0">
                <div className="font-mono text-lg sm:text-2xl font-semibold tracking-tight leading-none tabular-nums">
                  {fmtClock(now)}
                </div>
                <div className="font-mono text-[9px] sm:text-[10px] tracking-[0.14em] text-muted-foreground mt-1">
                  {fmtDate(now).toUpperCase()}
                </div>
                {deviceName && (
                  <div className="font-mono text-[9px] sm:text-[10px] tracking-[0.14em] text-muted-foreground mt-1 truncate max-w-[120px]">
                    {deviceName.toUpperCase()}
                  </div>
                )}
              </div>
            </div>

            {stage !== "success" ? (
              <div className="flex flex-col gap-3 sm:gap-4">
                {/* PIN display */}
                <div
                  className={cn(
                    "relative border-[1.5px] rounded-lg p-3 sm:p-4",
                    error ? "border-destructive" : "border-border",
                  )}
                >
                  <div className="absolute -top-2 left-3 bg-background px-1.5 font-mono text-[10px] tracking-[0.14em] text-muted-foreground">
                    PIN
                  </div>
                  <div className="grid grid-cols-4 gap-2 sm:gap-3">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={cn(
                          "relative aspect-[1/0.65] sm:aspect-[1/0.72] border-[1.5px] rounded-lg flex items-center justify-center transition-all",
                          i < pin.length
                            ? "border-foreground bg-foreground text-background"
                            : i === pin.length
                              ? "border-foreground bg-background"
                              : "border-border bg-background",
                        )}
                      >
                        <span className="font-mono text-[32px] sm:text-[40px] font-semibold leading-none">
                          {i < pin.length ? "●" : "·"}
                        </span>
                        <span className="absolute top-1 left-1.5 sm:top-1.5 sm:left-2 font-mono text-[9px] sm:text-[10px] text-muted-foreground">
                          {i + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between items-center mt-2.5 sm:mt-3.5">
                    <span className="font-mono text-[10px] sm:text-[11px] tracking-wider text-muted-foreground">
                      {error
                        ? "▲ " + t("lock.errorLabel").toUpperCase()
                        : stage === "verifying"
                          ? t("lock.verifying").toUpperCase()
                          : pin.length === 0
                            ? t("lock.ready").toUpperCase()
                            : pin.length < 4
                              ? `${pin.length}/4 ${t("lock.entered").toUpperCase()}`
                              : t("lock.verifying").toUpperCase()}
                    </span>
                    <span
                      className={cn(
                        "font-mono text-[10px] sm:text-[11px] tracking-wider",
                        error ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {error ?? <span className="hidden sm:inline">{t("lock.keypadHint").toUpperCase()}</span>}
                    </span>
                  </div>
                </div>

                {/* Keypad */}
                <div className="grid grid-cols-3 grid-rows-4 gap-1.5 sm:gap-2.5">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
                    <button
                      key={k}
                      onClick={() => handleDigit(k)}
                      disabled={stage === "verifying"}
                      className="rounded-lg border border-border bg-background text-2xl sm:text-[28px] font-medium active:translate-y-px active:bg-muted transition-all select-none min-h-[56px] disabled:opacity-50 disabled:active:translate-y-0"
                    >
                      {k}
                    </button>
                  ))}
                  <button
                    onClick={handleClear}
                    disabled={stage === "verifying"}
                    className="rounded-lg border border-border bg-muted font-mono text-xs sm:text-sm font-medium text-muted-foreground active:translate-y-px active:bg-muted transition-all select-none min-h-[56px] disabled:opacity-50"
                  >
                    {t("lock.clear")}
                  </button>
                  <button
                    onClick={() => handleDigit("0")}
                    disabled={stage === "verifying"}
                    className="rounded-lg border border-border bg-background text-2xl sm:text-[28px] font-medium active:translate-y-px active:bg-muted transition-all select-none min-h-[56px] disabled:opacity-50 disabled:active:translate-y-0"
                  >
                    0
                  </button>
                  <button
                    onClick={handleBackspace}
                    disabled={stage === "verifying"}
                    className="rounded-lg border border-border bg-muted text-muted-foreground active:translate-y-px active:bg-muted transition-all select-none flex items-center justify-center min-h-[56px] disabled:opacity-50"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 12a9 9 0 1 0 3.5-7.1L3 8" />
                      <path d="M3 3v5h5" />
                    </svg>
                  </button>
                </div>

                {stage === "verifying" && (
                  <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
                    <Spinner size={12} />
                    {t("lock.verifying")}
                  </p>
                )}
              </div>
            ) : (
              <div
                onClick={() => setLocked(false)}
                className="border-[1.5px] border-foreground rounded-lg p-4 sm:p-6 bg-foreground text-background cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </div>
                  <span className="font-mono text-xs tracking-wider text-muted-foreground">
                    {punchedAction === "in"
                      ? t("lock.punchInRecorded").toUpperCase()
                      : t("lock.unlocked").toUpperCase()}
                  </span>
                </div>
                <div className="text-2xl sm:text-3xl lg:text-[44px] font-bold mt-3 sm:mt-4 leading-[1.05] tracking-tight">
                  {punchedAction === "in"
                    ? t("lock.welcomeName").replace(
                        "{name}",
                        (punchedMember?.displayName ?? "").split(" ")[0] || "",
                      )
                    : t("lock.welcomeBackName").replace(
                        "{name}",
                        (punchedMember?.displayName ?? "").split(" ")[0] || "",
                      )}
                </div>
                <div className="text-[13px] sm:text-[15px] text-muted-foreground mt-1.5">
                  {punchedAction === "in"
                    ? t("lock.shiftOpen")
                    : t("lock.shiftContinue")}
                </div>
                <div className="font-mono text-[10px] sm:text-[11px] tracking-wider text-muted-foreground mt-4 sm:mt-5">
                  {t("lock.tapToDismiss").toUpperCase()}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
