/*
 * Swallows the click that ends a long press, and only that click (Back / Forward history
 * menus, desktop spec §3.3).
 *
 *   pointerdown ─▶ reset()                 every press starts clean
 *   press timer ─▶ arm()                   the press became a long press (menu opens)
 *   onClick     ─▶ consumeClick()          true once while armed: do not activate
 *   pointerup / pointercancel (window, capture) ─▶ disarm in a queued task
 *
 * The menu opened by the long press is modal, so its backdrop usually receives the release and
 * the button gets no click at all; a flag cleared only in onClick would then swallow the next
 * ordinary click. Browsers dispatch the release's click synchronously after pointerup in the
 * same task, so disarming from a task queued at pointerup runs after that click either way.
 */

export interface LongPressClickGuard {
  /** A new press begins: forgets any earlier long press. */
  reset(): void;
  /** The current press turned into a long press. */
  arm(): void;
  /** Call from onClick: true when this click ends an armed long press and must not activate. */
  consumeClick(): boolean;
  /** Drops listeners and pending work (unmount). The guard stays usable. */
  dispose(): void;
}

export interface LongPressClickGuardEnv {
  readonly target: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  schedule(callback: () => void): number;
  cancel(handle: number): void;
}

const RELEASE_EVENTS = ["pointerup", "pointercancel"] as const;

function browserEnv(): LongPressClickGuardEnv {
  return {
    target: window,
    schedule: (callback) => window.setTimeout(callback, 0),
    cancel: (handle) => window.clearTimeout(handle),
  };
}

export function createLongPressClickGuard(env?: LongPressClickGuardEnv): LongPressClickGuard {
  let armed = false;
  let listening = false;
  let pending: number | null = null;
  let resolved: LongPressClickGuardEnv | null = env ?? null;
  const getEnv = (): LongPressClickGuardEnv => (resolved ??= browserEnv());

  const cancelPending = () => {
    if (pending === null) return;
    getEnv().cancel(pending);
    pending = null;
  };

  const stopListening = () => {
    if (!listening) return;
    listening = false;
    const { target } = getEnv();
    for (const type of RELEASE_EVENTS) target.removeEventListener(type, onRelease, true);
  };

  function onRelease(): void {
    stopListening();
    cancelPending();
    pending = getEnv().schedule(() => {
      pending = null;
      armed = false;
    });
  }

  const clear = () => {
    stopListening();
    cancelPending();
    armed = false;
  };

  return {
    reset: clear,
    arm() {
      cancelPending();
      armed = true;
      if (listening) return;
      listening = true;
      const { target } = getEnv();
      for (const type of RELEASE_EVENTS) target.addEventListener(type, onRelease, true);
    },
    consumeClick() {
      if (!armed) return false;
      armed = false;
      return true;
    },
    dispose: clear,
  };
}
