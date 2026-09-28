/*
 * ⌘⇧M (Ctrl+Shift+M elsewhere) is the only way to open Mr. Merchiva in /manager. Pure so it is
 * testable without the React tree.
 *
 * The key matches on `event.key`, like every letter shortcut the user reads off the keycap, so
 * AZERTY's M works where it is printed. Layouts with no Latin M on that key (Arabic, Hindi,
 * Cyrillic…) fall back to the physical key. Mod+Shift+M is kept out of the browser shell's
 * shortcut table (lib/browser-shell/shortcuts.ts), so nothing else claims it.
 */

export type MerchivaShortcutEvent = Pick<
  KeyboardEvent,
  "key" | "code" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "repeat" | "isComposing"
>;

export function isMerchivaShortcut(event: MerchivaShortcutEvent): boolean {
  if (event.repeat || event.isComposing) return false;
  if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.altKey) return false;
  const key = event.key.length === 1 ? event.key.toLowerCase() : "";
  if (key === "m") return true;
  return key !== "" && key.charCodeAt(0) > 0x7f && event.code === "KeyM";
}

export function merchivaShortcutLabel(isMac: boolean): string {
  return isMac ? "⌘⇧M" : "Ctrl+Shift+M";
}

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent || "");
}
