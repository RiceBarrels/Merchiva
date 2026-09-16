"use client";

import { useSyncExternalStore } from "react";
import { useShellInfo } from "@/lib/browser-shell";

const QUERY = "(pointer: coarse)";

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/** Touch-first pointer (shell info when inside the browser shell, otherwise a media query). */
export function useCoarsePointer(): boolean {
  const shell = useShellInfo();
  const media = useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
  return shell ? shell.coarse : media;
}
