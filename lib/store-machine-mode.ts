"use client";

import { useEffect, useState } from "react";

const KEY = "store_machine_mode";
const NAME_KEY = "store_machine_device_name";
const EVENT = "store-machine-mode-change";

export function getStoreMachineMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setStoreMachineMode(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // localStorage may be unavailable — ignore.
  }
}

export function getDeviceName(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setDeviceName(name: string): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = name.trim();
    if (trimmed) localStorage.setItem(NAME_KEY, trimmed);
    else localStorage.removeItem(NAME_KEY);
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // ignore
  }
}

export function useStoreMachineMode(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(getStoreMachineMode());
    const handler = () => setOn(getStoreMachineMode());
    window.addEventListener(EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const update = (next: boolean) => {
    setStoreMachineMode(next);
    setOn(next);
  };

  return [on, update];
}

export function useDeviceName(): [string, (name: string) => void] {
  const [name, setName] = useState("");

  useEffect(() => {
    setName(getDeviceName());
    const handler = () => setName(getDeviceName());
    window.addEventListener(EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const update = (next: string) => {
    setDeviceName(next);
    setName(next.trim());
  };

  return [name, update];
}
