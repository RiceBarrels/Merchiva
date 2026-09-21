import type { ShellContextEditable } from "./context-menu";

/*
 * Cut / Copy / Paste / Select all for the shell context menu. A menu item is not a real
 * Mod+X keypress, so every one of these has to be performed by hand.
 *
 * `document.execCommand` is deprecated but still the only path that keeps the field's native
 * undo stack and emits the `input` event React's controlled components listen for; the same
 * call backs Edit ▸ Cut in components/docs/editor/clipboard.ts. Where it is refused (it returns
 * false rather than throwing in most browsers) the input / textarea fallback writes through the
 * prototype's value setter — assigning `el.value` directly is swallowed by React's value
 * tracker, and the field would silently snap back on the next render.
 *
 * Paste reads the clipboard, which the web asks the user to allow once per origin; a refusal
 * surfaces as a toast rather than a silent no-op. Tauri and Capacitor grant it outright.
 */

/** A DOM write was refused (clipboard permission, or a field that rejected the edit). */
export type EditResult = "ok" | "denied";

function isField(el: HTMLElement): el is HTMLInputElement | HTMLTextAreaElement {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}

function exec(command: string, value?: string): boolean {
  try {
    return document.execCommand(command, false, value);
  } catch {
    return false;
  }
}

/** Writes through the prototype setter so React's value tracker sees the change. */
function setFieldValue(el: HTMLInputElement | HTMLTextAreaElement, value: string, caret: number): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.setSelectionRange(caret, caret);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/** The selected text inside `target`, or "" when nothing is selected. */
export function selectedTextIn(target: ShellContextEditable): string {
  const el = target.element;
  if (isField(el)) {
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    return start === end ? "" : el.value.slice(start, end);
  }
  return window.getSelection()?.toString() ?? "";
}

function writeClipboard(text: string): Promise<EditResult> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return Promise.resolve("denied");
  return navigator.clipboard.writeText(text).then((): EditResult => "ok", (): EditResult => "denied");
}

/** Copies the field's selection. Refocusing first keeps the selection the click was made on. */
export function copyFromField(target: ShellContextEditable): Promise<EditResult> {
  const text = selectedTextIn(target);
  if (!text) return Promise.resolve("denied");
  return writeClipboard(text);
}

/** Copies the selection, then deletes it. */
export function cutFromField(target: ShellContextEditable): Promise<EditResult> {
  const text = selectedTextIn(target);
  if (!text) return Promise.resolve("denied");
  return writeClipboard(text).then((result) => {
    if (result !== "ok") return result;
    const el = target.element;
    el.focus();
    if (exec("delete")) return "ok";
    if (!isField(el)) return "denied";
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    setFieldValue(el, el.value.slice(0, start) + el.value.slice(end), start);
    return "ok";
  });
}

/** Reads the clipboard and inserts it at the caret, replacing any selection. */
export function pasteIntoField(target: ShellContextEditable): Promise<EditResult> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.readText) return Promise.resolve("denied");
  return navigator.clipboard.readText().then(
    (text): EditResult => {
      if (!text) return "ok"; // An empty clipboard is not a failure worth a toast.
      const el = target.element;
      el.focus();
      if (exec("insertText", text)) return "ok";
      if (!isField(el)) return "denied";
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? start;
      setFieldValue(el, el.value.slice(0, start) + text + el.value.slice(end), start + text.length);
      return "ok";
    },
    (): EditResult => "denied",
  );
}

/** Selects the field's whole contents. */
export function selectAllIn(target: ShellContextEditable): EditResult {
  const el = target.element;
  el.focus();
  if (isField(el)) {
    el.select();
    return "ok";
  }
  const selection = window.getSelection();
  if (!selection) return "denied";
  selection.removeAllRanges();
  const range = document.createRange();
  range.selectNodeContents(el);
  selection.addRange(range);
  return "ok";
}
