"use client";

/**
 * Human labels for editor shortcuts written in ProseMirror/Tiptap key notation ("Mod-Alt-m", "Mod-Shift-8").
 * macOS: symbols in ⌃⌥⇧⌘ order ("⌘⌥M"); elsewhere: "Ctrl+Alt+M". Labels are rendered `dir="ltr"`.
 *
 * Editor shortcuts never use shell-reserved keys (plan §B7.4): Mod+T/W/L/R, Mod+1..9, Ctrl+Tab,
 * Mod+Shift+T/D/A/H/B/R.
 */
import { useSyncExternalStore } from "react";

export function detectMac(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform || nav.platform || nav.userAgent || "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/**
 * Whether a keydown is AltGr typing a character rather than a Ctrl+Alt shortcut. Windows reports AltGr as
 * Ctrl+Alt, so AltGr+F ('[' on Czech, Slovak and Hungarian layouts) would otherwise match Mod+Alt+F and swallow the
 * character (prosemirror-keymap skips Windows Ctrl+Alt for the same reason). A non-letter character with Ctrl+Alt
 * held, or the AltGraph modifier, means AltGr; Ctrl+Alt on a Latin or non-Latin layout still yields a letter.
 */
export function isAltGraphChord(
  event: Pick<KeyboardEvent, "ctrlKey" | "altKey" | "metaKey" | "key"> & { getModifierState?: (key: string) => boolean },
  isMac: boolean,
): boolean {
  if (isMac || !event.ctrlKey || !event.altKey || event.metaKey) return false;
  if (event.getModifierState?.("AltGraph")) return true;
  return event.key.length === 1 && !/\p{L}/u.test(event.key);
}

const KEY_NAMES: Readonly<Record<string, { mac: string; other: string }>> = {
  enter: { mac: "↩", other: "Enter" },
  backspace: { mac: "⌫", other: "Backspace" },
  escape: { mac: "⎋", other: "Esc" },
  tab: { mac: "⇥", other: "Tab" },
  space: { mac: "Space", other: "Space" },
  arrowup: { mac: "↑", other: "↑" },
  arrowdown: { mac: "↓", other: "↓" },
  arrowleft: { mac: "←", other: "←" },
  arrowright: { mac: "→", other: "→" },
};

/** Formats a Tiptap key string such as `"Mod-Alt-Shift-h"`. */
export function formatDocShortcut(keys: string, isMac: boolean): string {
  const parts = keys.split("-");
  // "Mod--" (minus) and "Mod-," style keys: the key itself may be the empty tail after a trailing dash.
  let key = parts.pop() ?? "";
  if (key === "" && keys.endsWith("-")) key = "-";
  const mods = new Set(parts.map((p) => p.toLowerCase()));
  const named = KEY_NAMES[key.toLowerCase()];
  const keyLabel = named ? (isMac ? named.mac : named.other) : key.length === 1 ? key.toUpperCase() : key;
  if (isMac) {
    let label = "";
    if (mods.has("ctrl")) label += "⌃";
    if (mods.has("alt")) label += "⌥";
    if (mods.has("shift")) label += "⇧";
    if (mods.has("mod") || mods.has("meta") || mods.has("cmd")) label += "⌘";
    return label + keyLabel;
  }
  const out: string[] = [];
  if (mods.has("mod") || mods.has("ctrl")) out.push("Ctrl");
  if (mods.has("meta") || mods.has("cmd")) out.push("Win");
  if (mods.has("alt")) out.push("Alt");
  if (mods.has("shift")) out.push("Shift");
  out.push(keyLabel);
  return out.join("+");
}

/** Every editor shortcut shown in menus and tooltips, keyed by action. */
export const DOC_SHORTCUTS = {
  undo: "Mod-z",
  redo: "Mod-Shift-z",
  cut: "Mod-x",
  copy: "Mod-c",
  paste: "Mod-v",
  pastePlain: "Mod-Shift-v",
  selectAll: "Mod-a",
  find: "Mod-f",
  findReplace: "Mod-Alt-f",
  open: "Mod-o",
  print: "Mod-p",
  seeVersions: "Mod-Alt-Shift-h",
  link: "Mod-k",
  pageBreak: "Mod-Enter",
  comment: "Mod-Alt-m",
  bold: "Mod-b",
  italic: "Mod-i",
  underline: "Mod-u",
  strike: "Mod-Shift-s",
  superscript: "Mod-.",
  subscript: "Mod-,",
  normal: "Mod-Alt-0",
  h1: "Mod-Alt-1",
  h2: "Mod-Alt-2",
  h3: "Mod-Alt-3",
  alignLeft: "Mod-Shift-l",
  alignCenter: "Mod-Shift-e",
  alignJustify: "Mod-Shift-j",
  bulletList: "Mod-Shift-8",
  orderedList: "Mod-Shift-7",
  taskList: "Mod-Shift-9",
  clear: "Mod-\\",
  wordCount: "Mod-Shift-c",
} as const;

export type DocShortcutId = keyof typeof DOC_SHORTCUTS;

function subscribeNever(): () => void {
  return () => {};
}

/** Whether the viewer is on macOS/iOS (false during SSR). */
export function useIsMac(): boolean {
  return useSyncExternalStore(subscribeNever, detectMac, () => false);
}

/** Formatter bound to the current platform: `label("bold")` → "⌘B". */
export function useDocShortcutLabels(): (id: DocShortcutId) => string {
  const isMac = useIsMac();
  return (id) => formatDocShortcut(DOC_SHORTCUTS[id], isMac);
}
