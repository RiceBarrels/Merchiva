"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Drives the "Punch in now?" prompt on the personal phone. The screen boots
 * locked, so `request()` is called after every unlock; it resolves once the
 * shift roster is ready and asks whenever the member has a punch code and is
 * off shift. There is no snooze on purpose: skipping the prompt only lasts
 * until the next unlock, so an unpunched member is reminded every time.
 */
export function usePunchAsk({ ready, myCode, onShift }: { ready: boolean; myCode: string | null; onShift: boolean }) {
  const [pending, setPending] = useState(false);
  const [ask, setAsk] = useState(false);

  useEffect(() => {
    if (!pending || !ready) return;
    const shouldAsk = !!myCode && !onShift;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot: consume the queued check once the roster has streamed in
    setPending(false);
    if (shouldAsk) setAsk(true);
  }, [pending, ready, myCode, onShift]);

  const request = useCallback(() => setPending(true), []);
  const dismiss = useCallback(() => setAsk(false), []);
  const resolve = useCallback(() => setAsk(false), []);

  return { ask, request, dismiss, resolve };
}
