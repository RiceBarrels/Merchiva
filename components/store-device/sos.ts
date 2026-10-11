// The store SOS button (login-pane.tsx) calls sendStoreSos, which alerts every
// owner and manager by in-app alert, push and email. The module refuses with a
// message a person can act on; this names the copy for it.

/** The i18n key for a failed SOS: the per-store cooldown, an unknown or turned-off device, or anything else. */
export function sosErrorKey(err: unknown): string {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (message.includes("less than 2 minutes ago")) return "storeDevice.sosCooldown";
  if (message.includes("not registered or is turned off")) return "storeDevice.sosUnregistered";
  return "storeDevice.sosFailed";
}
