"use client";

// Device permissions — notifications, microphone, camera and location — are
// asked for, never required. Every app surface (/choose, /manager, /personal,
// /store) renders straight away; this component only opens the browser's own
// prompts for whatever is still unanswered:
//
//   notifications — push alerts (inventory, shift trades, team messages)
//   microphone    — walkie-talkie channels + Mr. Merchiva voice calls
//   camera        — QR log-in on the store device
//   location      — store address / weather-aware forecasting
//
// It asks once per app load, so a prompt someone dismissed comes back the next
// time they open Merchiva. A permission the browser has already blocked is left
// alone — re-requesting it can't open anything, only site / OS settings can
// undo it — and the change listener records it the moment they do. Results
// persist per device via lib/device-permissions.ts.

import { useEffect, useRef } from "react";
import {
  missingKinds,
  queryDevicePermissions,
  requestDevicePermission,
  savePermissions,
  subscribeDevicePermissionChanges,
  type DevicePermissionState,
} from "@/lib/device-permissions";

/** Only "prompt" can still open a dialog; "denied" needs site / OS settings. */
function askableKinds(state: DevicePermissionState) {
  return missingKinds(state).filter((kind) => state[kind] === "prompt");
}

export function DevicePermissionPrompt({ children }: { children: React.ReactNode }) {
  const busy = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    /** One pass: ask for everything still unanswered, then record the outcome. */
    const ask = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        let state = await queryDevicePermissions();
        // Sequential: browsers show one permission dialog at a time.
        for (const kind of askableKinds(state)) {
          if (cancelled) return;
          state = { ...state, [kind]: await requestDevicePermission(kind) };
        }
        if (!cancelled) savePermissions(state);
      } catch (err) {
        console.error("[device-permissions] ask failed", err);
      } finally {
        busy.current = false;
      }
    };

    // Firefox and Safari only open a permission dialog from a user gesture, so
    // the automatic pass is backed by one more on the first interaction.
    const onGesture = () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      void ask();
    };
    window.addEventListener("pointerdown", onGesture, { passive: true });
    window.addEventListener("keydown", onGesture);

    ask()
      .then(() => {
        // The listeners hang off the PermissionStatus objects the first query
        // cached, so this can only be armed once that query has run.
        if (cancelled) return;
        unsubscribe = subscribeDevicePermissionChanges(() => {
          queryDevicePermissions()
            .then((state) => {
              if (!cancelled) savePermissions(state);
            })
            .catch(() => {});
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      unsubscribe?.();
    };
  }, []);

  return <>{children}</>;
}
