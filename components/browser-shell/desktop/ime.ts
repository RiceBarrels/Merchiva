/**
 * True when a key event belongs to an IME composition and must not run chrome commands
 * (Enter committing a CJK candidate, arrows moving through candidates).
 *
 * `isComposing` alone is not enough: WebKit (Safari, and the Tauri macOS app's WKWebView) fires
 * `compositionend` before the keydown of the Enter that commits a candidate, so that keydown has
 * `isComposing === false`. Its `keyCode` is still 229 ("Process"), the same check ProseMirror uses.
 */
export function isImeComposing(event: { readonly isComposing: boolean; readonly keyCode: number }): boolean {
  return event.isComposing || event.keyCode === 229;
}
