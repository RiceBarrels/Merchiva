import { WebHaptics } from "web-haptics";

let instance: WebHaptics | null = null;

function get(): WebHaptics | null {
  if (typeof window === "undefined") return null;
  if (!instance) instance = new WebHaptics();
  return instance;
}

export function hapticLight() {
  try { get()?.trigger(40); } catch {}
}
export function hapticMedium() {
  try { get()?.trigger("nudge"); } catch {}
}
export function hapticHeavy() {
  try { get()?.trigger([{ duration: 100, intensity: 1 }, { delay: 50, duration: 100, intensity: 1 }]); } catch {}
}
export function hapticSuccess() {
  try { get()?.trigger("success"); } catch {}
}
export function hapticError() {
  try { get()?.trigger("error"); } catch {}
}
export function hapticWarning() {
  try { get()?.trigger([{ duration: 60, intensity: 0.7 }, { delay: 70, duration: 60, intensity: 0.7 }]); } catch {}
}
