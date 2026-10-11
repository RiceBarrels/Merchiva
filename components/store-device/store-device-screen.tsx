"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { usePermissions } from "@/lib/context/permissions";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { hapticSuccess } from "@/lib/haptics";
import { clearDeviceOperator, registerStoreDevice } from "@/lib/spacetimedb/actions";
import { rememberOperatorGrant } from "@/lib/spacetimedb/actions/pin";
import { getOrCreateDeviceId, getStoreMachineMode, setStoreMachineMode, useDeviceName } from "@/lib/store-machine-mode";
import { useAutolockSeconds, useCurrentOperator, setCurrentOperator, getCurrentOperator } from "@/lib/store-device-lock";
import { useIsMobile } from "@/lib/use-is-mobile";
import { Spinner } from "@/components/ui/loaders/geometric";
import { useNow, fmtStatusClock, useIdleTimer, useOnShift, IdleLock, MiniAppSurface } from "@/components/device";
import { useOrgMembers, type StoreMember } from "./use-org-members";
import { LoginPane } from "./login-pane";
import { RosterPages, StoreClockCard, useClosingTime } from "./roster-pages";
import { LoggedInScreen } from "./logged-in-screen";
import { useReleaseStorePush } from "./use-release-push";
import { StoreNotAllowed } from "./not-allowed";
import { canRunStoreDevice } from "@/lib/store-device-access";

/** Delete this tablet's `device_operator_session` row. Best effort: the server
 *  also ignores a session older than 12 h. */
function forgetOperatorSession() {
  rememberOperatorGrant(null);
  void clearDeviceOperator().catch((err) => console.warn("[store-device] clear operator failed:", err));
}

/**
 * /store — the shared store device. Logged out it shows the QR / PIN log-in
 * and the on-work roster; logged in it becomes the operator's walkie-talkie
 * plus a home screen of apps. Auto-locks (logged out) or auto-logs-out
 * (logged in) after the device's autolock interval.
 *
 * Tablet (≥768px): two columns — log-in / walkie-talkie on the left, roster /
 * apps on the right. Phone: the log-in pane stacks above the roster and the
 * logged-in view becomes swipeable Channel | Apps pages over the talk bar.
 */
export function StoreDeviceScreen() {
  const t = useT();
  const { organizationId, currentOrg, role, permissions } = usePermissions();
  // Only an account allowed to run a store device works one (the module refuses the rest).
  const allowed = canRunStoreDevice(role, permissions);
  const now = useNow(1000);
  const phone = useIsMobile();
  const [deviceName] = useDeviceName();
  const [deviceId, setDeviceId] = useState("");
  const { members, ready: membersReady } = useOrgMembers(organizationId || null);
  const orgId = organizationId ?? "";
  const onShift = useOnShift(orgId);
  const closingTime = useClosingTime(orgId);
  const [autolock] = useAutolockSeconds();
  const operator = useCurrentOperator();
  const [idleLocked, setIdleLocked] = useState(false);
  const [recording, setRecording] = useState(false);
  // After a log-in, ask "Punch in now?" once the roster is known and the
  // operator isn't already on shift — as their own phone asks on unlock.
  const [punchCheckPending, setPunchCheckPending] = useState(false);
  const [punchPromptMember, setPunchPromptMember] = useState<StoreMember | null>(null);
  // The PIN the operator typed to log in. Punching goes through `recordPunch`,
  // which takes the code and validates it server-side, and the device can no
  // longer read anyone's code from a table — so it holds this one in memory for
  // the session. Never persisted: a shared tablet must not keep a PIN on disk.
  const [operatorPin, setOperatorPin] = useState<string | null>(null);

  // A shared tablet holds nobody's push subscription.
  useReleaseStorePush(organizationId);

  // The legacy store-machine flag restricted the manager shell; this surface
  // manages its own operator/lock, so clear it. Register the device best-effort.
  useEffect(() => {
    if (getStoreMachineMode()) setStoreMachineMode(false);
    const id = getOrCreateDeviceId();
    setDeviceId(id);
    if (id && organizationId && allowed) {
      registerStoreDevice(id, deviceName || "Store device").catch((err) => console.warn("[store-device] register failed:", err));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const operatorMember = useMemo<StoreMember | null>(
    () => (operator ? members.find((m) => m.id === operator.memberId) ?? null : null),
    [operator, members],
  );

  // Operator persisted on this device but no longer an active member → drop it.
  useEffect(() => {
    if (operator && membersReady && !operatorMember) setCurrentOperator(null);
  }, [operator, membersReady, operatorMember]);

  // A PIN / QR log-in leaves this tablet a server-side operator session
  // (`device_operator_session`), which lets Drive act for that person for up to
  // 12 h. Drop it the moment nobody is logged in here: log-out, the idle log-out,
  // the stale-operator drop above, or a clear from anywhere else (another tab,
  // an app's "log in again").
  const operatorId = operator?.memberId ?? null;
  const lastOperatorIdRef = useRef<string | null>(null);
  useEffect(() => {
    const last = lastOperatorIdRef.current;
    lastOperatorIdRef.current = operatorId;
    if (last && !operatorId) forgetOperatorSession();
  }, [operatorId]);

  // The idle lock while nobody is logged in drops it too: a session can outlive
  // a log-in that never finished (the lock hides the log-in pane, which cancels
  // a QR log-in it had already consumed; a PIN answer can land after the pane
  // gave up). Read the operator live, not from state: a log-in that lands in the
  // same tick has already stored it, and its fresh session must stay.
  useEffect(() => {
    if (idleLocked && !getCurrentOperator()) forgetOperatorSession();
  }, [idleLocked]);

  const loggedIn = !!operatorMember;
  const operatorShift = operatorMember ? onShift.forMember(operatorMember.id) : null;

  useEffect(() => {
    if (!punchCheckPending || !operatorMember || !onShift.ready) return;
    setPunchCheckPending(false);
    // Punches go by the log-in's grant (recordOperatorPunch), so a QR log-in is asked too.
    if (!operatorShift) setPunchPromptMember(operatorMember);
  }, [punchCheckPending, operatorMember, onShift.ready, operatorShift]);

  const handleLogin = useCallback(
    (member: StoreMember, pin: string | null) => {
      setCurrentOperator({ memberId: member.id, name: member.displayName });
      setOperatorPin(pin);
      setIdleLocked(false);
      setPunchCheckPending(true);
      hapticSuccess();
      toast.success(`${t("storeDevice.loggedIn")} · ${member.displayName}`);
    },
    [t],
  );

  const handleLogout = useCallback(
    (reason?: "idle") => {
      setCurrentOperator(null);
      setOperatorPin(null);
      setPunchCheckPending(false);
      setPunchPromptMember(null);
      toast(reason === "idle" ? t("storeDevice.loggedOutIdle") : t("storeDevice.loggedOut"));
    },
    [t],
  );

  const idleMs = autolock * 1000;
  const { dimming, reset } = useIdleTimer({
    idleMs,
    dimMs: Math.max(1000, idleMs - 8000),
    enabled: autolock > 0 && !!organizationId && !idleLocked,
    // Only a live recording freezes the countdown — open app panels, the
    // log-out drawer and the punch prompt keep counting so an abandoned
    // shared device still logs out.
    paused: recording,
    onIdle: () => {
      if (loggedIn) handleLogout("idle");
      else setIdleLocked(true);
    },
  });

  const unlock = () => {
    setIdleLocked(false);
    reset();
  };

  if (!organizationId || !currentOrg) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-background">
        <Spinner size={24} className="text-muted-foreground" />
      </div>
    );
  }

  if (!allowed) return <StoreNotAllowed />;

  const orgName = currentOrg.name;

  return (
    <MiniAppSurface
      // The log-out warning has to stay visible over an open app: an abandoned
      // shared tablet must still show it is about to log out.
      overlay={
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 z-[60]",
            loggedIn ? "bg-white" : "bg-black",
            dimming ? "opacity-100 transition-opacity duration-[8000ms] ease-linear" : "opacity-0 transition-opacity duration-150",
          )}
        />
      }
    >
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-background text-foreground select-none">
        {/* Status strip */}
        <div className="h-10 shrink-0 flex items-center justify-between px-6 border-b border-border text-[13px] font-semibold">
          <span className="font-mono tabular-nums">{fmtStatusClock(now)}</span>
          <span className="text-muted-foreground font-medium">Merchiva · {orgName}</span>
          {/* Who is logged in, beside the device's name: the home below is theirs. */}
          <span className="font-mono text-[11px] font-medium text-muted-foreground truncate max-w-[30%]">
            {operatorMember ? `${operatorMember.displayName} · ` : ""}{deviceName || t("storeDevice.thisDevice")}
          </span>
        </div>

        <div className="relative flex-1 min-h-0">
          <AnimatePresence mode="wait" initial={false}>
            {loggedIn && operatorMember ? (
              <motion.div
                key="in"
                className="absolute inset-0 flex flex-col min-h-0"
                initial={{ opacity: 0, y: 80, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -60, scale: 0.94 }}
                transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }}
              >
                <LoggedInScreen
                  organizationId={organizationId}
                  operator={operatorMember}
                  operatorPin={operatorPin}
                  shift={operatorShift}
                  onShiftEntries={onShift.entries}
                  punchAsk={punchPromptMember !== null}
                  onPunchAskDone={() => setPunchPromptMember(null)}
                  onLogout={() => handleLogout()}
                  onRecordingChange={setRecording}
                  idle={dimming}
                  className="min-h-0 flex-1"
                />
              </motion.div>
            ) : (
              <motion.div
                key="out"
                className={cn(
                  "absolute inset-0 min-h-0",
                  phone ? "flex flex-col overflow-y-auto overscroll-contain" : "grid grid-cols-[400px_1fr]",
                )}
                initial={{ opacity: 0, y: 40, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -60, scale: 0.94 }}
                transition={{ duration: 0.5, ease: [0.7, 0, 0.3, 1] }}
              >
                <LoginPane
                  organizationId={organizationId}
                  deviceId={deviceId}
                  members={members}
                  active={!idleLocked}
                  onLogin={handleLogin}
                  compact={phone}
                  className={phone ? "shrink-0 border-b" : "min-h-0"}
                />
                <RosterPages orgName={orgName} entries={onShift.entries} closingTime={closingTime} className={phone ? "h-[440px] shrink-0" : "min-h-0"} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>


        <IdleLock
          active={idleLocked}
          onUnlock={unlock}
          card={<StoreClockCard orgName={orgName} count={onShift.entries.length} closingTime={closingTime} className="w-full" />}
        />
        </div>
    </MiniAppSurface>
  );
}
