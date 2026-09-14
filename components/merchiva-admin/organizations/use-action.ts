"use client";

import { useCallback, useState } from "react";
import { adminCall } from "@/lib/merchiva-admin/client";
import { errorMessage } from "./types";

/**
 * Wraps adminCall with busy/error/notice state for a form or table. `run`
 * resolves true on success so callers can reset local state and reload.
 */
export function useAction(onSuccess?: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = useCallback(
    async (reducer: string, args: Record<string, unknown>, successMessage?: string): Promise<boolean> => {
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        await adminCall(reducer, args);
        if (successMessage) setNotice(successMessage);
        onSuccess?.();
        return true;
      } catch (err) {
        setError(errorMessage(err));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [onSuccess],
  );

  return { run, busy, error, notice, setError, setNotice };
}

export const labelCls = "block text-[11px] font-medium uppercase tracking-wider text-stone-500";
export const fieldCls = "space-y-1";
