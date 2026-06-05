"use client";

import { useEffect, useState } from "react";

const KEY_TIMEOUT = "store_device_autolock_seconds";
const KEY_OPERATOR_ID = "store_device_operator_member_id";
const KEY_OPERATOR_NAME = "store_device_operator_name";
const EVENT = "store-device-lock-change";

// Allowed auto-lock intervals (seconds). 0 = never.
export const AUTOLOCK_OPTIONS = [30, 60, 120, 300, 0] as const;
export type AutolockSeconds = (typeof AUTOLOCK_OPTIONS)[number];

const DEFAULT_TIMEOUT: AutolockSeconds = 30;

export function getAutolockSeconds(): AutolockSeconds {
  if (typeof window === "undefined") return DEFAULT_TIMEOUT;
  try {
    const raw = localStorage.getItem(KEY_TIMEOUT);
    if (raw === null) return DEFAULT_TIMEOUT;
    const n = Number(raw);
    if (AUTOLOCK_OPTIONS.includes(n as AutolockSeconds)) return n as AutolockSeconds;
    return DEFAULT_TIMEOUT;
  } catch {
    return DEFAULT_TIMEOUT;
  }
}

export function setAutolockSeconds(seconds: AutolockSeconds): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY_TIMEOUT, String(seconds));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // ignore
  }
}

export function useAutolockSeconds(): [AutolockSeconds, (s: AutolockSeconds) => void] {
  const [s, setS] = useState<AutolockSeconds>(DEFAULT_TIMEOUT);
  useEffect(() => {
    setS(getAutolockSeconds());
    const handler = () => setS(getAutolockSeconds());
    window.addEventListener(EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);
  const update = (next: AutolockSeconds) => {
    setAutolockSeconds(next);
    setS(next);
  };
  return [s, update];
}

export interface CurrentOperator {
  memberId: string;
  name: string;
}

export function getCurrentOperator(): CurrentOperator | null {
  if (typeof window === "undefined") return null;
  try {
    const id = localStorage.getItem(KEY_OPERATOR_ID);
    const name = localStorage.getItem(KEY_OPERATOR_NAME);
    if (!id) return null;
    return { memberId: id, name: name ?? "" };
  } catch {
    return null;
  }
}

export function setCurrentOperator(op: CurrentOperator | null): void {
  if (typeof window === "undefined") return;
  try {
    if (op) {
      localStorage.setItem(KEY_OPERATOR_ID, op.memberId);
      localStorage.setItem(KEY_OPERATOR_NAME, op.name);
    } else {
      localStorage.removeItem(KEY_OPERATOR_ID);
      localStorage.removeItem(KEY_OPERATOR_NAME);
    }
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // ignore
  }
}

export function useCurrentOperator(): CurrentOperator | null {
  const [op, setOp] = useState<CurrentOperator | null>(null);
  useEffect(() => {
    setOp(getCurrentOperator());
    const handler = () => setOp(getCurrentOperator());
    window.addEventListener(EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);
  return op;
}
