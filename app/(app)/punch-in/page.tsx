"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useSpacetimeDB, useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { usePermissions } from "@/lib/context/permissions";
import { recordPunch, setPunchInCode } from "@/lib/spacetimedb/actions";
import { PermissionGuard } from "@/components/permission-guard";
import { useDeviceName } from "@/lib/store-machine-mode";
import { hapticSuccess, hapticLight } from "@/lib/haptics";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type PunchAction = "in" | "out" | "break-start" | "break-end";
type Stage = "entry" | "confirm" | "success";

interface MemberRow {
  id: { toString(): string };
  organizationId: string;
  userId: { toString(): string };
  status: string;
  displayName: string;
  email: string;
  punchInCode?: string;
}

interface PunchEventRow {
  id: { toString(): string };
  organizationId: string;
  memberId: string;
  action: string;
  at: { toDate?: () => Date; microsSinceUnixEpoch?: bigint };
  closed: boolean;
  pairEventId?: string;
}

function eventTime(e: PunchEventRow): Date {
  if (e.at && typeof (e.at as { toDate?: () => Date }).toDate === "function") return (e.at as { toDate: () => Date }).toDate();
  if (e.at && typeof (e.at as { microsSinceUnixEpoch?: bigint }).microsSinceUnixEpoch === "bigint") return new Date(Number((e.at as { microsSinceUnixEpoch: bigint }).microsSinceUnixEpoch / BigInt(1000)));
  return new Date();
}

const ACTION_META: Record<PunchAction, { label: string; verb: string; tone: string }> = {
  in:            { label: "PUNCH IN",    verb: "punch in",    tone: "primary" },
  out:           { label: "PUNCH OUT",   verb: "punch out",   tone: "danger"  },
  "break-start": { label: "START BREAK", verb: "start break", tone: "warn"    },
  "break-end":   { label: "END BREAK",   verb: "end break",   tone: "primary" },
};

const pad = (n: number) => String(n).padStart(2, "0");
const fmtClock = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const fmtHM = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmtDate = (d: Date) => d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const fmtDur = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return `${pad(h)}:${pad(m)}:${pad(ss)}`;
};

function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) || "?";
}

// ─── Tick hook ──────────────────────────────────────────────────────────────

function useTick(ms = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), ms); return () => clearInterval(id); }, [ms]);
  return now;
}

// ─── Corner marks ───────────────────────────────────────────────────────────

function Corners() {
  const cls = "absolute w-2.5 h-2.5 text-stone-300";
  return (
    <>
      <svg className={cn(cls, "top-2 left-2")} viewBox="0 0 10 10"><path d="M0 0h4M0 0v4" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
      <svg className={cn(cls, "top-2 right-2 -scale-x-100")} viewBox="0 0 10 10"><path d="M0 0h4M0 0v4" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
      <svg className={cn(cls, "bottom-2 left-2 -scale-y-100")} viewBox="0 0 10 10"><path d="M0 0h4M0 0v4" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
      <svg className={cn(cls, "bottom-2 right-2 -scale-100")} viewBox="0 0 10 10"><path d="M0 0h4M0 0v4" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
    </>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function PunchInPage() {
  const now = useTick();
  const stdb = useSpacetimeDB();
  const { organizationId } = usePermissions();
  const [deviceName] = useDeviceName();
  const [orgMembers, membersReady] = useTable(tables.orgMember);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const punchEventTable = (tables as any).punchEvent;
  const [punchEvents] = useTable(punchEventTable ?? tables.orgMember);
  const hasPunchTable = !!punchEventTable;

  const identity = stdb?.identity;

  // ─── Set-code dialog (for first-time users) ─────────────────────────
  const myMember = useMemo(() => {
    if (!identity || !organizationId) return null;
    return (orgMembers as unknown as MemberRow[]).find(
      (r) => r.userId.toString() === identity.toString() && r.organizationId === organizationId && r.status === "active",
    ) ?? null;
  }, [orgMembers, identity, organizationId]);
  const myCode = typeof myMember?.punchInCode === "string" && myMember.punchInCode.length > 0 ? myMember.punchInCode : null;
  const [setCodeOpen, setSetCodeOpen] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [savingCode, setSavingCode] = useState(false);

  useEffect(() => {
    if (membersReady && myMember && !myCode && !setCodeOpen) setSetCodeOpen(true);
  }, [membersReady, myMember, myCode]);

  const handleSaveCode = async () => {
    if (!myMember) return;
    const code = codeInput.trim();
    if (!/^[0-9]{4}$/.test(code)) { toast.error("Code must be 4 digits"); return; }
    setSavingCode(true);
    try {
      await setPunchInCode(myMember.id.toString(), code);
      hapticSuccess(); toast.success("Code set");
      setSetCodeOpen(false); setCodeInput("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally { setSavingCode(false); }
  };

  // ─── Punch state ────────────────────────────────────────────────────
  const [stage, setStage] = useState<Stage>("entry");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [matched, setMatched] = useState<MemberRow | null>(null);
  const [detectedAction, setDetectedAction] = useState<PunchAction | null>(null);
  const [needsChoice, setNeedsChoice] = useState(false);
  const [chosenAction, setChosenAction] = useState<PunchAction>("out");
  const [confirming, setConfirming] = useState(false);
  const [successMember, setSuccessMember] = useState<MemberRow | null>(null);
  const [successAction, setSuccessAction] = useState<PunchAction | null>(null);
  const [successTime, setSuccessTime] = useState<Date | null>(null);
  const [memberState, setMemberState] = useState<"off" | "on" | "break">("off");

  // Auto-clear error
  useEffect(() => { if (!error) return; const t = setTimeout(() => { setError(null); setPin(""); }, 3500); return () => clearTimeout(t); }, [error]);
  // Auto-reset from success
  useEffect(() => { if (stage !== "success") return; const t = setTimeout(() => handleCancel(), 5000); return () => clearTimeout(t); }, [stage]);

  // ─── Derived data ───────────────────────────────────────────────────
  const orgEvents = useMemo(() => {
    if (!organizationId || !hasPunchTable) return [];
    return (punchEvents as unknown as PunchEventRow[]).filter(e => e.organizationId === organizationId);
  }, [punchEvents, organizationId, hasPunchTable]);

  const onShift = useMemo(() => {
    const openIns = orgEvents.filter(e => e.action === "in" && !e.closed);
    return openIns.map(inEv => {
      const member = (orgMembers as unknown as MemberRow[]).find(m => m.id.toString() === inEv.memberId);
      const onBreak = orgEvents.some(e => e.memberId === inEv.memberId && e.action === "break-start" && !e.closed);
      return { id: inEv.id.toString(), memberId: inEv.memberId, name: member?.displayName ?? "Unknown", avatar: initials(member?.displayName ?? "?"), at: eventTime(inEv), onBreak };
    });
  }, [orgEvents, orgMembers]);

  const recentPunches = useMemo(() => {
    return orgEvents.slice().sort((a, b) => eventTime(b).getTime() - eventTime(a).getTime()).slice(0, 15).map(e => {
      const member = (orgMembers as unknown as MemberRow[]).find(m => m.id.toString() === e.memberId);
      const dur = e.pairEventId ? (() => {
        const pair = orgEvents.find(p => p.id.toString() === e.pairEventId);
        return pair ? eventTime(e).getTime() - eventTime(pair).getTime() : null;
      })() : null;
      return { id: e.id.toString(), at: eventTime(e), who: member?.displayName ?? "Unknown", avatar: initials(member?.displayName ?? "?"), action: e.action as PunchAction, closed: e.closed, dur };
    });
  }, [orgEvents, orgMembers]);

  // ─── Keypad handlers ────────────────────────────────────────────────
  const handleDigit = useCallback((d: string) => {
    if (stage !== "entry") return;
    hapticLight();
    setError(null);
    setPin(prev => {
      if (prev.length >= 4) return prev;
      return prev + d;
    });
  }, [stage]);

  // Auto-submit on 4th digit
  useEffect(() => {
    if (pin.length !== 4 || stage !== "entry") return;
    const t = setTimeout(() => attemptPunch(pin), 200);
    return () => clearTimeout(t);
  }, [pin, stage]);

  const attemptPunch = (code: string) => {
    const member = (orgMembers as unknown as MemberRow[]).find(
      m => m.organizationId === organizationId && m.punchInCode === code && m.status === "active",
    );
    if (!member) { setError("PIN not recognized"); return; }
    setMatched(member);

    const memberEvts = orgEvents.filter(e => e.memberId === member.id.toString());
    const openIn = memberEvts.find(e => e.action === "in" && !e.closed);
    const openBreak = memberEvts.find(e => e.action === "break-start" && !e.closed);

    if (!openIn) {
      setMemberState("off"); setDetectedAction("in"); setNeedsChoice(false);
    } else if (openBreak) {
      setMemberState("break"); setDetectedAction("break-end"); setNeedsChoice(false);
    } else {
      setMemberState("on"); setDetectedAction(null); setNeedsChoice(true); setChosenAction("out");
    }
    setStage("confirm");
  };

  const handleConfirm = async () => {
    if (!matched) return;
    const action = needsChoice ? chosenAction : detectedAction;
    if (!action) { toast.error("Select an action"); return; }
    setConfirming(true);
    try {
      await recordPunch(pin, action);
      hapticSuccess();
      setSuccessMember(matched); setSuccessAction(action); setSuccessTime(new Date());
      setStage("success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally { setConfirming(false); }
  };

  const handleCancel = useCallback(() => {
    setStage("entry"); setPin(""); setMatched(null); setDetectedAction(null); setNeedsChoice(false); setError(null);
  }, []);

  // ─── Keyboard ───────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (stage === "entry") {
        if (/^[0-9]$/.test(e.key)) handleDigit(e.key);
        else if (e.key === "Backspace") setPin(p => p.slice(0, -1));
        else if (e.key === "Escape") { setPin(""); setError(null); }
      } else if (stage === "confirm") {
        if (e.key === "Enter") handleConfirm();
        else if (e.key === "Escape") handleCancel();
      } else if (stage === "success") {
        if (/^[0-9]$/.test(e.key) || e.key === "Escape" || e.key === "Enter") handleCancel();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  // ─── Action color helpers ───────────────────────────────────────────
  const actionBadge = (action: PunchAction) => {
    const m = ACTION_META[action];
    const c =
      m.tone === "primary" ? "bg-stone-900 text-white" :
      m.tone === "danger"  ? "bg-red-50 text-red-600 border border-red-200" :
                             "bg-amber-50 text-amber-700 border border-amber-200";
    return <span className={cn("inline-flex items-center px-2 py-0.5 rounded-[0.3rem] font-mono text-[11px] font-semibold tracking-wider", c)}>{m.label}</span>;
  };

  const tableBadge = (action: PunchAction) => {
    const labels: Record<string, string> = { in: "IN", out: "OUT", "break-start": "BREAK", "break-end": "RESUME" };
    const colors: Record<string, string> = {
      in: "bg-stone-900 text-white",
      out: "bg-stone-100 text-stone-700 border border-stone-300",
      "break-start": "bg-amber-50 text-amber-700 border border-amber-200",
      "break-end": "bg-stone-50 text-stone-600 border border-stone-300",
    };
    return <span className={cn("inline-flex px-1.5 py-px rounded-[0.3rem] font-mono text-[10px] font-semibold tracking-wider", colors[action])}>{labels[action]}</span>;
  };

  return (
    <PermissionGuard section="pos">
      <div className="h-full flex flex-col bg-stone-100 overflow-hidden">

        {/* ─── Main grid ─────────────────────────────────────── */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_380px] min-h-0">

          {/* ═══ LEFT: Punch panel ═══ */}
          <main className="p-4 lg:p-6 overflow-y-auto">
            <div className="relative bg-white border border-stone-200 rounded-[0.3rem] p-5 lg:p-6">
              <Corners />
              {/* Header row */}
              <div className="flex justify-between items-start gap-4 mb-5">
                <div>
                  <div className="font-mono text-[11px] tracking-[0.14em] text-stone-400 mb-2">01 · AUTHENTICATE</div>
                  <h1 className="text-xl lg:text-2xl font-bold tracking-tight">Enter your 4-digit PIN</h1>
                  <p className="text-[13px] text-stone-400 mt-1.5 max-w-[440px] leading-relaxed">
                    Punch in or out by keying your employee PIN. The terminal auto-detects the action based on your last punch.
                  </p>
                </div>
                <div className="hidden sm:block text-right border border-stone-200 rounded-[0.3rem] px-3.5 py-2.5 bg-stone-50 shrink-0">
                  <div className="font-mono text-2xl font-semibold tracking-tight leading-none">{fmtClock(now)}</div>
                  <div className="font-mono text-[10px] tracking-[0.14em] text-stone-400 mt-1.5">{fmtDate(now).toUpperCase()}</div>
                </div>
              </div>

              {/* ─── Stage: Entry ─── */}
              {stage === "entry" && (
                <div className="space-y-4">
                  <div className={cn("relative border-[1.5px] rounded-[0.3rem] p-4", error ? "border-red-400" : "border-stone-300")}>
                    <div className="absolute -top-2 left-3 bg-white px-1.5 font-mono text-[10px] tracking-[0.14em] text-stone-400">PIN</div>
                    <div className="grid grid-cols-4 gap-3">
                      {[0, 1, 2, 3].map(i => (
                        <div key={i} className={cn(
                          "relative aspect-[1/0.72] border-[1.5px] rounded-[0.3rem] flex items-center justify-center transition-all",
                          i < pin.length ? "border-stone-900 bg-stone-900 text-white" :
                          i === pin.length ? "border-stone-900 bg-white" : "border-stone-300 bg-white",
                        )}>
                          <span className="font-mono text-[40px] font-semibold leading-none">{i < pin.length ? "●" : "·"}</span>
                          <span className="absolute top-1.5 left-2 font-mono text-[10px] text-stone-400">{i + 1}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between items-center mt-3.5">
                      <span className="font-mono text-[11px] tracking-wider text-stone-400">
                        {error ? "▲ ERROR" : pin.length === 0 ? "READY" : pin.length < 4 ? `${pin.length}/4 ENTERED` : "VERIFYING…"}
                      </span>
                      <span className={cn("font-mono text-[11px] tracking-wider", error ? "text-red-500" : "text-stone-400")}>
                        {error ?? "PRESS DIGITS OR USE KEYBOARD"}
                      </span>
                    </div>
                  </div>

                  {/* Keypad */}
                  <div className="grid grid-cols-3 gap-2.5">
                    {["1","2","3","4","5","6","7","8","9"].map(k => (
                      <button key={k} onClick={() => handleDigit(k)} className="h-[60px] rounded-[0.3rem] border border-stone-300 bg-white text-[28px] font-medium shadow-[0_1px_0_var(--border)] active:translate-y-px active:shadow-none transition-all select-none">{k}</button>
                    ))}
                    <button onClick={() => { setPin(""); setError(null); }} className="h-[60px] rounded-[0.3rem] border border-stone-200 bg-stone-50 font-mono text-sm font-medium text-stone-600 shadow-[0_1px_0_var(--border)] active:translate-y-px active:shadow-none transition-all select-none">Clear</button>
                    <button onClick={() => handleDigit("0")} className="h-[60px] rounded-[0.3rem] border border-stone-300 bg-white text-[28px] font-medium shadow-[0_1px_0_var(--border)] active:translate-y-px active:shadow-none transition-all select-none">0</button>
                    <button onClick={() => setPin(p => p.slice(0, -1))} className="h-[60px] rounded-[0.3rem] border border-stone-200 bg-stone-50 text-stone-600 shadow-[0_1px_0_var(--border)] active:translate-y-px active:shadow-none transition-all select-none flex items-center justify-center">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3.5-7.1L3 8" /><path d="M3 3v5h5" /></svg>
                    </button>
                  </div>
                </div>
              )}

              {/* ─── Stage: Confirm ─── */}
              {stage === "confirm" && matched && (
                <div className="border-[1.5px] border-stone-900 rounded-[0.3rem] p-5 space-y-5">
                  <div className="flex items-center gap-5">
                    <div className="h-12 w-12 rounded-[0.3rem] bg-stone-900 text-white flex items-center justify-center font-mono text-base font-semibold tracking-wider shrink-0">{initials(matched.displayName)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-[11px] text-stone-400 tracking-wider">EMPLOYEE · PIN ••••</div>
                      <div className="text-2xl font-bold leading-tight truncate">{matched.displayName}</div>
                      <div className="text-[13px] text-stone-400">{matched.email}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-[11px] text-stone-400 tracking-wider">ACTION</div>
                      <div className="mt-1">
                        {actionBadge(needsChoice ? chosenAction : detectedAction!)}
                      </div>
                    </div>
                  </div>

                  {needsChoice && (
                    <div>
                      <div className="font-mono text-[10px] tracking-[0.14em] text-stone-400 mb-2">SELECT AN ACTION</div>
                      <div className="grid grid-cols-2 gap-2.5">
                        {([["out", "End shift", "Punch out for the day"], ["break-start", "Start break", "Pause — meal, rest, etc."]] as const).map(([act, title, sub]) => (
                          <button key={act} onClick={() => setChosenAction(act)} className={cn(
                            "text-left p-3 rounded-[0.3rem] border-[1.5px] flex items-center gap-2.5 transition-all",
                            chosenAction === act ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white hover:bg-stone-50",
                          )}>
                            <span className={cn("w-4 h-4 rounded-full border-[1.5px] shrink-0", chosenAction === act ? "border-white bg-stone-900 shadow-[inset_0_0_0_3px_white]" : "border-stone-300 bg-white")} />
                            <span>
                              <div className="text-sm font-semibold leading-tight">{title}</div>
                              <div className="text-xs opacity-70 mt-0.5">{sub}</div>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-px bg-stone-200 border border-stone-200 rounded-[0.3rem] overflow-hidden">
                    {[["TIME", fmtClock(now)], ["DATE", now.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })], ["STATE", memberState === "off" ? "OFF SHIFT" : memberState === "break" ? "ON BREAK" : "ON SHIFT"]].map(([k, v]) => (
                      <div key={k} className="bg-white px-3.5 py-3">
                        <div className="font-mono text-[10px] tracking-wider text-stone-400">{k}</div>
                        <div className="font-mono text-[15px] font-semibold mt-0.5">{v}</div>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2.5">
                    <button onClick={handleCancel} className="flex-1 h-11 rounded-[0.3rem] border border-stone-900 bg-white text-sm font-semibold hover:bg-stone-50 transition-colors">Cancel (Esc)</button>
                    <button onClick={handleConfirm} disabled={confirming} className="flex-[2] h-11 rounded-[0.3rem] border border-stone-900 bg-stone-900 text-white text-sm font-semibold disabled:opacity-50 hover:bg-stone-800 transition-colors flex items-center justify-center gap-2">
                      {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Confirm {ACTION_META[needsChoice ? chosenAction : detectedAction!]?.verb} <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg></>}
                    </button>
                  </div>
                </div>
              )}

              {/* ─── Stage: Success ─── */}
              {stage === "success" && successMember && successAction && successTime && (
                <div className="border-[1.5px] border-stone-900 rounded-[0.3rem] p-6 bg-stone-900 text-white">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-[0.3rem] bg-emerald-500 flex items-center justify-center">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                    </div>
                    <span className="font-mono text-xs tracking-wider text-stone-400">PUNCH RECORDED</span>
                  </div>
                  <div className="text-3xl lg:text-[44px] font-bold mt-4 leading-[1.05] tracking-tight">
                    {successAction === "in" ? `Welcome, ${successMember.displayName.split(" ")[0]}.` :
                     successAction === "out" ? `Goodbye, ${successMember.displayName.split(" ")[0]}.` :
                     successAction === "break-start" ? "Break started." :
                     `Welcome back, ${successMember.displayName.split(" ")[0]}.`}
                  </div>
                  <div className="text-[15px] text-stone-400 mt-1.5">
                    {successAction === "in" ? "Your shift is now open." :
                     successAction === "out" ? "Your shift has been closed." :
                     successAction === "break-start" ? "Clock is paused — don't forget to end your break." :
                     "Break ended — your shift is active again."}
                  </div>
                  <div className="grid grid-cols-4 gap-px bg-white/15 border border-white/15 rounded-[0.3rem] overflow-hidden mt-5">
                    {[
                      [successAction === "in" ? "IN AT" : successAction === "out" ? "OUT AT" : successAction === "break-start" ? "BREAK AT" : "RESUMED AT", fmtClock(successTime)],
                      ["TERMINAL", (deviceName || "TC-01").toUpperCase().slice(0, 10)],
                      ["LOCATION", (deviceName || "—").toUpperCase().slice(0, 16)],
                      ["CONF. ID", "0x" + Math.floor(Math.random() * 0xffffff).toString(16).toUpperCase().padStart(6, "0")],
                    ].map(([k, v]) => (
                      <div key={k} className="bg-stone-900 px-3.5 py-3">
                        <div className="font-mono text-[10px] tracking-wider text-stone-500">{k}</div>
                        <div className="font-mono text-sm font-semibold mt-0.5">{v}</div>
                      </div>
                    ))}
                  </div>
                  <div className="font-mono text-[11px] tracking-wider text-stone-500 mt-5">
                    RETURNING TO ENTRY IN 5S · TAP ANY DIGIT TO DISMISS
                  </div>
                </div>
              )}
            </div>
          </main>

          {/* ═══ RIGHT: Side panel ═══ */}
          <aside className="border-l border-stone-200 bg-white flex flex-col min-h-0 overflow-y-auto">
            {/* On shift now */}
            <div className="p-5 border-b border-stone-200">
              <div className="font-mono text-[11px] tracking-[0.14em] text-stone-400 mb-1">02 · ON SHIFT NOW</div>
              <div className="flex items-baseline gap-2.5">
                <span className="text-[40px] font-bold tracking-tight font-mono leading-none">{onShift.length}</span>
                <span className="text-[13px] text-stone-400">active</span>
              </div>
              <div className="h-px bg-stone-200 my-3.5" />
              {onShift.length === 0 ? (
                <div className="text-[13px] text-stone-400">No active shifts.</div>
              ) : (
                <div className="space-y-2">
                  {onShift.map(s => (
                    <div key={s.id} className="flex items-center gap-2.5">
                      <div className={cn(
                        "w-7 h-7 rounded-[0.3rem] flex items-center justify-center font-mono text-[11px] font-semibold shrink-0",
                        s.onBreak ? "bg-stone-100 text-stone-600 border border-stone-300" : "bg-stone-900 text-white",
                      )}>{s.avatar}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold truncate">{s.name}</div>
                        <div className="text-[11px] text-stone-400">{s.onBreak ? "on break" : "active"}</div>
                      </div>
                      <span className={cn("font-mono text-xs", s.onBreak ? "text-amber-600" : "text-stone-400")}>{fmtDur(now.getTime() - s.at.getTime())}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent punches */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-stone-200">
                <div>
                  <div className="font-mono text-[11px] tracking-[0.14em] text-stone-400">03 · RECENT PUNCHES</div>
                  <div className="text-sm font-semibold mt-0.5">Today</div>
                </div>
                <span className="font-mono text-[11px] tracking-wider text-stone-400">LIVE</span>
              </div>
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-stone-50">
                      <th className="text-left px-3.5 py-2.5 font-mono text-[10px] tracking-wider text-stone-400 font-medium border-b border-stone-200">Time</th>
                      <th className="text-left px-3.5 py-2.5 font-mono text-[10px] tracking-wider text-stone-400 font-medium border-b border-stone-200">Who</th>
                      <th className="text-left px-3.5 py-2.5 font-mono text-[10px] tracking-wider text-stone-400 font-medium border-b border-stone-200">Action</th>
                      <th className="text-right px-3.5 py-2.5 font-mono text-[10px] tracking-wider text-stone-400 font-medium border-b border-stone-200">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentPunches.length === 0 ? (
                      <tr><td colSpan={4} className="text-center py-8 text-stone-400 text-sm">No punches today</td></tr>
                    ) : recentPunches.map(p => (
                      <tr key={p.id}>
                        <td className="px-3.5 py-2.5 font-mono border-b border-stone-100 w-[70px]">{fmtHM(p.at)}</td>
                        <td className="px-3.5 py-2.5 border-b border-stone-100">
                          <div className="font-semibold text-[13px]">{p.who}</div>
                          <div className="text-[11px] text-stone-400">PIN ••••</div>
                        </td>
                        <td className="px-3.5 py-2.5 border-b border-stone-100">{tableBadge(p.action)}</td>
                        <td className="px-3.5 py-2.5 border-b border-stone-100 text-right font-mono text-xs text-stone-400">
                          {p.dur != null ? fmtDur(p.dur) : (p.closed ? "—" : (p.action === "break-start" ? "on break" : "open"))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </aside>
        </div>

      </div>

      {/* ─── Set-code dialog (first-time setup) ──────────── */}
      <Dialog open={setCodeOpen} onOpenChange={setSetCodeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle mobileTitle="Punch-in code">{myCode ? "Change your punch-in code" : "Set your punch-in code"}</DialogTitle>
            <DialogDescription>
              {myCode ? "Update the 4-digit code you enter at this store." : "Pick a 4-digit code you'll remember. You'll enter it every time you punch in."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>New code</Label>
              <Input value={codeInput} onChange={e => setCodeInput(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="4 digits" className="h-11 font-mono text-base tracking-[0.3em]" autoFocus onKeyDown={e => { if (e.key === "Enter") handleSaveCode(); }} />
            </div>
            <Button onClick={handleSaveCode} disabled={savingCode || codeInput.length < 4} className="w-full">
              {savingCode ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save code"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PermissionGuard>
  );
}
