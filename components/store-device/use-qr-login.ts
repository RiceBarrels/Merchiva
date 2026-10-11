"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTable } from "spacetimedb/react";
import { toast } from "sonner";
import { tables } from "@/lib/spacetimedb/generated";
import { createDeviceLoginRequest, consumeDeviceLogin } from "@/lib/spacetimedb/actions";
import { rememberOperatorGrant } from "@/lib/spacetimedb/actions/pin";
import { uuid } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { hapticSuccess } from "@/lib/haptics";
import { useNow } from "@/components/device";
import type { StoreMember } from "./use-org-members";

const QR_TTL_SECONDS = 60;
/** How long the check (and the name) shows on the QR before the log-in lands. */
const SCAN_OK_MS = 900;

interface DeviceLoginRow {
  id: { toString(): string };
  organizationId: string;
  deviceId: string;
  nonce: string;
  status: string;
  memberId?: string | null;
  intent?: string | null;
}

/** A phone approved the QR on screen: who, and what for ("login" | "punch-in" | "punch-out"). */
interface DeviceLoginApproval {
  requestId: string;
  memberId: string;
  intent: string;
}

/**
 * Issues a fresh device-login nonce every QR_TTL_SECONDS and watches the
 * device_login_request table for its approval. The QR payload is
 * `merchiva://device-login?org=<orgId>&nonce=<nonce>`. A QR is good for one
 * scan: the moment a phone approves the nonce on screen, `onScanned` gets the
 * approval and a fresh code replaces it.
 */
function useDeviceLoginQr(
  organizationId: string,
  deviceId: string,
  enabled: boolean,
  onScanned: (approval: DeviceLoginApproval) => void,
) {
  const [nonce, setNonce] = useState<string>(() => uuid());
  const [issuedAt, setIssuedAt] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const now = useNow(1000);

  const secondsLeft = Math.max(0, QR_TTL_SECONDS - Math.floor((now.getTime() - issuedAt) / 1000));

  const issue = useCallback(() => {
    setNonce(uuid());
    setIssuedAt(Date.now());
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 400);
  }, []);

  // Publish every nonce to the server so a phone can approve it. The reducer
  // may not be published yet — PIN log-in keeps working regardless.
  useEffect(() => {
    if (!enabled || !deviceId) return;
    createDeviceLoginRequest(deviceId, nonce).catch((err) => {
      console.warn("[store-device] createDeviceLoginRequest failed:", err);
    });
  }, [enabled, deviceId, nonce]);

  // Re-issue once the TTL elapses.
  const issuedAtRef = useRef(issuedAt);
  useEffect(() => { issuedAtRef.current = issuedAt; }, [issuedAt]);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      if (Date.now() - issuedAtRef.current >= QR_TTL_SECONDS * 1000) issue();
    }, 1000);
    return () => clearInterval(id);
  }, [enabled, issue]);

  // The approval arrives as a row event, not as derived state: the tablet
  // consumes the request right away, and the row turning "consumed" must not
  // undo a log-in already under way (it once cancelled every QR log-in).
  const nonceRef = useRef(nonce);
  useEffect(() => { nonceRef.current = nonce; }, [nonce]);
  const onScannedRef = useRef(onScanned);
  useEffect(() => { onScannedRef.current = onScanned; }, [onScanned]);
  const handleRow = useCallback(
    (row: DeviceLoginRow) => {
      if (row.nonce !== nonceRef.current || row.organizationId !== organizationId) return;
      if (row.status !== "approved" || !row.memberId) return;
      nonceRef.current = "";
      issue();
      onScannedRef.current({ requestId: row.id.toString(), memberId: row.memberId, intent: row.intent || "login" });
    },
    [organizationId, issue],
  );
  const handleUpdate = useCallback((_old: DeviceLoginRow, row: DeviceLoginRow) => handleRow(row), [handleRow]);
  useTable(tables.deviceLoginRequest, { onInsert: handleRow, onUpdate: handleUpdate });

  const value = `merchiva://device-login?org=${encodeURIComponent(organizationId)}&nonce=${encodeURIComponent(nonce)}`;
  return { value, secondsLeft, refreshing, refresh: issue };
}

export interface QrLoginOptions {
  organizationId: string;
  /** This tablet's store_device id. */
  deviceId: string;
  members: StoreMember[];
  /** The log-in pane is on screen (no idle lock over it). */
  shown: boolean;
  /** Keep issuing nonces: shown, and not in PIN entry. */
  issuing: boolean;
  /** A phone logged someone in by QR (the pin is always null). */
  onLogin: (member: StoreMember, pin: null) => void;
}

/**
 * The QR half of the /store log-in. A phone's approval shows a check and the name on the QR,
 * consumes the request (which leaves the tablet the operator session and punch grant), and logs
 * the member in a moment later. A punch-out was recorded by the phone itself: nobody logs in.
 */
export function useQrLogin({ organizationId, deviceId, members, shown, issuing, onLogin }: QrLoginOptions) {
  const t = useT();
  // Who the last scan was, shown on the QR until the log-in lands.
  const [scanOk, setScanOk] = useState<string | null>(null);
  const loginTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (loginTimerRef.current) clearTimeout(loginTimerRef.current); }, []);
  const latest = useRef({ members, onLogin, shown, t });
  useEffect(() => { latest.current = { members, onLogin, shown, t }; });

  const handleScanned = useCallback(({ requestId, memberId, intent }: DeviceLoginApproval) => {
    const { members: list, shown: onScreen, t: tr } = latest.current;
    const member = list.find((m) => m.id === memberId) ?? null;
    // The idle lock already dropped this tablet's operator session: a log-in now would have none.
    if (!member || !onScreen) return;
    hapticSuccess();
    setScanOk(member.displayName);
    if (intent === "punch-out") {
      toast.success(`${tr("personalDevice.punch.punchedOut")} · ${member.displayName}`);
    } else {
      // The request id is this log-in's grant: punches name it (recordOperatorPunch).
      rememberOperatorGrant(requestId);
      consumeDeviceLogin(requestId).catch(console.error);
    }
    if (loginTimerRef.current) clearTimeout(loginTimerRef.current);
    loginTimerRef.current = setTimeout(() => {
      loginTimerRef.current = null;
      setScanOk(null);
      if (intent !== "punch-out") latest.current.onLogin(member, null);
    }, SCAN_OK_MS);
  }, []);

  const qr = useDeviceLoginQr(organizationId, deviceId, issuing, handleScanned);
  return { ...qr, scanOk };
}
