/**
 * Remote caret / selection rendering for CollaborationCaret (docs-editor-ui spec §4.5).
 * Same DOM as the default renderer plus `data-member-id`, so presence avatars can scroll to a collaborator.
 */
import type { DecorationAttrs } from "@tiptap/pm/view";

const HEX_RE = /^#[0-9a-f]{6}$/i;
const NEUTRAL = "#57534e";

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function renderCaret(user: Record<string, unknown>): HTMLElement {
  const color = HEX_RE.test(readString(user.color)) ? readString(user.color) : NEUTRAL;
  const caret = document.createElement("span");
  caret.classList.add("collaboration-carets__caret");
  caret.style.borderColor = color;
  const memberId = readString(user.memberId);
  if (memberId) caret.setAttribute("data-member-id", memberId);

  const label = document.createElement("div");
  label.classList.add("collaboration-carets__label");
  label.style.backgroundColor = color;
  label.textContent = readString(user.name) || "·";
  caret.appendChild(label);
  return caret;
}

export function renderSelection(user: Record<string, unknown>): DecorationAttrs {
  const color = readString(user.color);
  if (!HEX_RE.test(color)) return {};
  return {
    nodeName: "span",
    class: "collaboration-carets__selection",
    style: `background-color: ${color}33`,
  };
}
