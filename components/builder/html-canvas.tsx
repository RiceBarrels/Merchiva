"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Code2, Eye, MousePointer2, RefreshCw, AlignLeft } from "lucide-react";
import { useDefaultLayout } from "react-resizable-panels";
import { cn } from "@/lib/utils";
import { resolveValuesPreview } from "@/lib/builder/site-values";
import { prettyPrintHtml } from "@/lib/builder/html-format";
import { CodeEditor } from "./code-editor";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

export interface HtmlSelectionInfo {
  selector: string;
  tag: string;
  outerHtml: string;
  attrs: Record<string, string>;
}

export interface CanvasContextMenuEvent {
  selector: string;
  tag: string;
  isText: boolean;
  attrs: Record<string, string>;
  outerHtml: string;
  // Viewport coords (already translated from iframe-relative)
  x: number;
  y: number;
}

interface HtmlCanvasProps {
  html: string;
  themeCss?: string;
  selectedSelector: string | null;
  onChange: (html: string) => void;
  onSelect: (info: HtmlSelectionInfo | null) => void;
  // Site-level custom values (from ValuePanel). System values use sample data
  // in the editor preview so {userName} etc. show plausible content.
  customValues?: Record<string, string>;
  // Right-click on any element in the iframe surfaces here so the parent can
  // show its own menu (with delete/duplicate/etc. actions).
  onContextMenu?: (e: CanvasContextMenuEvent) => void;
  // Selectors for which the parent wants to trigger inline text editing.
  // When this changes to a non-empty string, the iframe enters edit mode.
  editTextSelector?: string | null;
  // Hide the Preview/Split/Code switcher (and Format/Reload buttons next to it).
  // Used by surfaces like the design editor where the canvas lives inside a
  // scaled fixed-size stage — Split/Code wouldn't render correctly and editing
  // raw HTML isn't part of the design workflow.
  hideViewToolbar?: boolean;
}

// Wrap the user's HTML body into a full document with theme CSS, a click
// reporter, hover/selected outlines, drag-to-reorder, and inline text editing.
// Communication with the parent uses window.postMessage so the iframe can stay
// sandboxed. The user's content is wrapped in #__merchiva_root so we can
// capture only that subtree (not the injected <script>) when sending edits back.
//
// NOTE: selectedSelector is intentionally NOT baked into srcDoc. If it were,
// every click in the canvas would change the srcDoc string and force the iframe
// to fully reload — scrolling the canvas back to the top each time. Instead the
// initial value is "" and the parent pushes the current selection via
// postMessage right after the iframe's `load` event fires.
function buildSrcDoc(html: string, themeCss: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<base target="_parent" />
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: Inter, system-ui, sans-serif; }
  ${themeCss}
  /* Editor-only overlays */
  [data-merchiva-hover] { outline: 1px dashed rgba(99, 102, 241, 0.6) !important; outline-offset: -1px !important; }
  [data-merchiva-selected] { outline: 2px solid rgba(244, 63, 94, 0.85) !important; outline-offset: -2px !important; }
  [data-merchiva-editing] { outline: 2px solid rgba(59, 130, 246, 0.85) !important; outline-offset: -1px !important; cursor: text !important; }
  [data-merchiva-dragging] { opacity: 0.4 !important; }
  #__merchiva_drop_indicator {
    position: fixed; height: 3px; background: #3b82f6; pointer-events: none;
    z-index: 999999; border-radius: 2px; box-shadow: 0 0 0 1px rgba(59,130,246,0.3);
  }
</style>
</head>
<body>
<div id="__merchiva_root">
${html}
</div>
<script>
(function() {
  var SELECTED_SELECTOR = "";
  var lastHover = null;
  var dragSrc = null;
  var editing = null;
  var editingOriginalText = "";
  var dropIndicator = null;
  var ROOT_ID = "__merchiva_root";

  // Tags whose text we let users edit inline via dblclick — these stay
  // non-draggable so text selection works on them.
  var TEXT_TAGS = { P:1, H1:1, H2:1, H3:1, H4:1, H5:1, H6:1, SPAN:1, A:1, BUTTON:1, LI:1, STRONG:1, EM:1, B:1, I:1, SMALL:1, LABEL:1, BLOCKQUOTE:1, CITE:1, CODE:1, FIGCAPTION:1, TD:1, TH:1, DT:1, DD:1, SUMMARY:1 };
  var SKIP_TAGS = { SCRIPT:1, STYLE:1, META:1, LINK:1, BASE:1, HEAD:1, HTML:1, BODY:1 };

  function root() { return document.getElementById(ROOT_ID); }
  function isInRoot(el) { var r = root(); return r && r !== el && r.contains(el); }

  // ── Selector building (escape ids/classes; nth-of-type for repeats) ──
  function buildSelector(el) {
    if (!el || el === document.body) return "body";
    if (el.id) return "#" + CSS.escape(el.id);
    var path = [];
    var cur = el;
    while (cur && cur !== document.body && cur.id !== ROOT_ID && path.length < 8) {
      var part = cur.tagName.toLowerCase();
      var parent = cur.parentElement;
      if (parent) {
        var sameTag = Array.prototype.filter.call(parent.children, function(c) { return c.tagName === cur.tagName; });
        if (sameTag.length > 1) {
          var idx = sameTag.indexOf(cur) + 1;
          part += ":nth-of-type(" + idx + ")";
        }
      }
      path.unshift(part);
      cur = parent;
    }
    return "#" + ROOT_ID + " > " + path.join(" > ");
  }

  function applySelected() {
    document.querySelectorAll("[data-merchiva-selected]").forEach(function(el) {
      el.removeAttribute("data-merchiva-selected");
    });
    if (!SELECTED_SELECTOR) return;
    try {
      var el = document.querySelector(SELECTED_SELECTOR);
      if (el) el.setAttribute("data-merchiva-selected", "");
    } catch (e) {}
  }

  // ── Mark every visible element draggable so the user can reorder anything,
  // including headings and paragraphs. The dblclick-to-edit handler removes
  // draggable on the element being edited, so text-selection inside
  // contenteditable still works while editing.
  function applyDraggable() {
    var r = root(); if (!r) return;
    var all = r.querySelectorAll("*");
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (SKIP_TAGS[el.tagName]) continue;
      el.setAttribute("draggable", "true");
    }
  }

  // ── Send the current root HTML back to the parent (strip editor-only attrs).
  function notifyHtmlChanged() {
    var r = root(); if (!r) return;
    var clone = r.cloneNode(true);
    var ed = clone.querySelectorAll("[data-merchiva-hover], [data-merchiva-selected], [data-merchiva-editing], [data-merchiva-dragging], [contenteditable]");
    for (var i = 0; i < ed.length; i++) {
      ed[i].removeAttribute("data-merchiva-hover");
      ed[i].removeAttribute("data-merchiva-selected");
      ed[i].removeAttribute("data-merchiva-editing");
      ed[i].removeAttribute("data-merchiva-dragging");
      ed[i].removeAttribute("contenteditable");
    }
    // Also strip the draggable="true" we injected on every container
    var dr = clone.querySelectorAll("[draggable]");
    for (var j = 0; j < dr.length; j++) dr[j].removeAttribute("draggable");
    window.parent.postMessage({ type: "merchiva:html-changed", payload: clone.innerHTML.trim() }, "*");
  }

  // ── Hover outline ──
  document.addEventListener("mouseover", function(e) {
    if (editing) return;
    if (lastHover) lastHover.removeAttribute("data-merchiva-hover");
    var t = e.target;
    if (t && isInRoot(t) && t.setAttribute) {
      t.setAttribute("data-merchiva-hover", "");
      lastHover = t;
    }
  }, true);

  document.addEventListener("mouseout", function() {
    if (lastHover) { lastHover.removeAttribute("data-merchiva-hover"); lastHover = null; }
  }, true);

  // ── Click-to-select ──
  document.addEventListener("click", function(e) {
    if (editing) return; // let clicks through during edit
    e.preventDefault();
    e.stopPropagation();
    var el = e.target;
    if (!el || !isInRoot(el)) {
      SELECTED_SELECTOR = "";
      applySelected();
      window.parent.postMessage({ type: "merchiva:select", payload: null }, "*");
      return;
    }
    var attrs = {};
    for (var i = 0; i < el.attributes.length; i++) {
      var a = el.attributes[i];
      if (a.name.indexOf("data-merchiva") === 0) continue;
      if (a.name === "draggable" && a.value === "true") continue;
      if (a.name === "contenteditable") continue;
      attrs[a.name] = a.value;
    }
    var s = buildSelector(el);
    SELECTED_SELECTOR = s;
    applySelected();
    window.parent.postMessage({
      type: "merchiva:select",
      payload: { selector: s, tag: el.tagName.toLowerCase(), outerHtml: el.outerHTML.slice(0, 4000), attrs: attrs },
    }, "*");
  }, true);

  // ── Inline text editing (dblclick on text-tag elements) ──
  document.addEventListener("dblclick", function(e) {
    var t = e.target;
    if (!t || !isInRoot(t)) return;
    if (!TEXT_TAGS[t.tagName]) return;
    e.preventDefault();
    e.stopPropagation();
    if (editing && editing !== t) commitEdit(true);
    editing = t;
    editingOriginalText = t.innerText;
    t.setAttribute("contenteditable", "true");
    t.setAttribute("data-merchiva-editing", "");
    t.removeAttribute("draggable");
    t.focus();
    // Select all text inside
    try {
      var range = document.createRange();
      range.selectNodeContents(t);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (err) {}
  }, true);

  document.addEventListener("blur", function(e) {
    if (e.target === editing) commitEdit(true);
  }, true);

  document.addEventListener("keydown", function(e) {
    if (!editing) return;
    if (e.key === "Escape") {
      e.preventDefault();
      editing.innerText = editingOriginalText;
      commitEdit(false);
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commitEdit(true);
    }
  }, true);

  // ── Forward editor shortcuts to the parent ─────────────────────────────
  // When focus is inside the iframe, the parent's window-level keydown won't
  // fire, so we relay the keys we care about up. We skip while contenteditable
  // is active (the user is typing into an element).
  document.addEventListener("keydown", function(e) {
    if (editing) return;
    var key = e.key;
    var meta = e.metaKey || e.ctrlKey;
    var shouldForward = false;
    if (key === "Delete" || key === "Backspace") shouldForward = true;
    else if (meta && (key === "z" || key === "Z" || key === "y" || key === "Y")) shouldForward = true;
    else if (meta && (key === "c" || key === "C" || key === "x" || key === "X" ||
                      key === "v" || key === "V" || key === "d" || key === "D")) shouldForward = true;
    else if (!meta && (key === "t" || key === "T")) shouldForward = true;
    if (!shouldForward) return;
    e.preventDefault();
    e.stopPropagation();
    window.parent.postMessage({
      type: "merchiva:shortcut",
      payload: { key: key, meta: meta, shift: e.shiftKey },
    }, "*");
  }, true);

  function commitEdit(notify) {
    if (!editing) return;
    var changed = editing.innerText !== editingOriginalText;
    editing.removeAttribute("contenteditable");
    editing.removeAttribute("data-merchiva-editing");
    var was = editing;
    editing = null;
    editingOriginalText = "";
    // Restore draggable state on parents (dblclick may have shifted user focus)
    applyDraggable();
    if (notify && changed) {
      // Re-emit selection so the right-side properties refresh with new outerHtml
      try {
        var s = buildSelector(was);
        window.parent.postMessage({
          type: "merchiva:select",
          payload: { selector: s, tag: was.tagName.toLowerCase(), outerHtml: was.outerHTML.slice(0, 4000), attrs: {} },
        }, "*");
      } catch (err) {}
      notifyHtmlChanged();
    }
  }

  // ── Drag-to-reorder ──
  // Decide whether the parent lays its children out horizontally — flex-row /
  // row-reverse and grid with auto-flow column. In that case the drop indicator
  // is a vertical bar (left/right of target) and we compare x-midpoint.
  function isHorizontalLayout(parent) {
    if (!parent || parent.nodeType !== 1) return false;
    var cs = window.getComputedStyle(parent);
    var disp = cs.display;
    if (disp === "flex" || disp === "inline-flex") {
      var dir = cs.flexDirection;
      // Initial value of flex-direction is "row" — this is what computedStyle
      // returns even when the author didn't write it explicitly, so a div
      // styled display:flex (no direction) correctly resolves as horizontal.
      return dir === "row" || dir === "row-reverse";
    }
    if (disp === "grid" || disp === "inline-grid") {
      var flow = cs.gridAutoFlow || "";
      if (flow.indexOf("column") !== -1) return true;
      // Heuristic for a single-row multi-column grid: if all children share the
      // same top, treat as horizontal so left/right indicator looks right.
      if (parent.children && parent.children.length > 1) {
        var first = parent.children[0].getBoundingClientRect();
        var second = parent.children[1].getBoundingClientRect();
        if (Math.abs(first.top - second.top) < 4 && first.left !== second.left) return true;
      }
    }
    return false;
  }

  // Refine the hover target so it's a meaningful sibling of dragSrc:
  //   1) walk UP from e.target until our parent is a flex/grid container
  //      (so hovering deep inside a card in a flex row resolves to the card,
  //      not the inner h3/span);
  //   2) if no such ancestor, and target itself is a container with children,
  //      pick the child closest to the cursor (so hovering on the gap inside
  //      a flex container still targets a real sibling).
  function findDropSibling(target, x, y) {
    if (!target) return null;
    var cur = target;
    while (cur && cur.parentNode && cur.id !== ROOT_ID && cur !== document.body) {
      if (cur === dragSrc || (dragSrc && cur.contains(dragSrc))) break;
      var parent = cur.parentNode;
      if (parent && parent.nodeType === 1 && parent !== document.body) {
        var cs = window.getComputedStyle(parent);
        var disp = cs.display;
        if (disp === "flex" || disp === "inline-flex" || disp === "grid" || disp === "inline-grid") {
          return cur;
        }
      }
      cur = parent;
    }
    if (target.children && target.children.length > 0) {
      var horizontal = isHorizontalLayout(target);
      var bestChild = null;
      var bestDist = Infinity;
      for (var i = 0; i < target.children.length; i++) {
        var c = target.children[i];
        if (c === dragSrc || (dragSrc && c.contains(dragSrc))) continue;
        var rect = c.getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;
        var dist = horizontal ? Math.abs(x - cx) : Math.abs(y - cy);
        if (dist < bestDist) { bestDist = dist; bestChild = c; }
      }
      if (bestChild) return bestChild;
    }
    return target;
  }

  // position: "before" → above (vertical layout) or left (horizontal layout)
  //          "after"  → below or right
  function showDropIndicator(target, position, horizontal) {
    if (!target || !isInRoot(target)) { hideDropIndicator(); return; }
    var rect = target.getBoundingClientRect();
    if (!dropIndicator) {
      dropIndicator = document.createElement("div");
      dropIndicator.id = "__merchiva_drop_indicator";
      document.body.appendChild(dropIndicator);
    }
    if (horizontal) {
      // Vertical bar at left or right edge of target
      dropIndicator.style.width = "3px";
      dropIndicator.style.height = rect.height + "px";
      dropIndicator.style.top = rect.top + "px";
      dropIndicator.style.left = (position === "before" ? rect.left - 1 : rect.right - 1) + "px";
    } else {
      // Horizontal bar at top or bottom edge of target
      dropIndicator.style.height = "3px";
      dropIndicator.style.width = rect.width + "px";
      dropIndicator.style.left = rect.left + "px";
      dropIndicator.style.top = (position === "before" ? rect.top - 1 : rect.bottom - 1) + "px";
    }
  }

  function hideDropIndicator() {
    if (dropIndicator) { dropIndicator.remove(); dropIndicator = null; }
  }

  // Computes whether to drop before or after the target, picking the axis
  // based on the parent's layout direction.
  function dropPosition(target, clientX, clientY) {
    var horizontal = isHorizontalLayout(target.parentNode);
    var rect = target.getBoundingClientRect();
    var before;
    if (horizontal) {
      before = clientX < rect.left + rect.width / 2;
    } else {
      before = clientY < rect.top + rect.height / 2;
    }
    return { position: before ? "before" : "after", horizontal: horizontal };
  }

  document.addEventListener("dragstart", function(e) {
    if (editing) { e.preventDefault(); return; }
    var t = e.target;
    if (!t || !isInRoot(t)) { e.preventDefault(); return; }
    if (t.getAttribute("draggable") !== "true") { e.preventDefault(); return; }
    dragSrc = t;
    t.setAttribute("data-merchiva-dragging", "");
    try {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", "merchiva-move");
    } catch (err) {}
  }, true);

  // External drop detection: drags coming from the parent's element palette
  // carry "application/x-merchiva-insert" on dataTransfer.types. We can't
  // read getData() during dragover (browsers redact it for security), so
  // detect via types alone, then read the payload only on drop.
  function isExternalInsertDrag(e) {
    if (!e.dataTransfer || !e.dataTransfer.types) return false;
    var types = e.dataTransfer.types;
    for (var i = 0; i < types.length; i++) {
      if (types[i] === "application/x-merchiva-insert") return true;
    }
    return false;
  }

  document.addEventListener("dragover", function(e) {
    var external = isExternalInsertDrag(e);
    if (!dragSrc && !external) return;
    var t = e.target;
    if (!t || !isInRoot(t)) return;
    t = findDropSibling(t, e.clientX, e.clientY);
    if (!t || !isInRoot(t)) return;
    if (dragSrc && (t === dragSrc || dragSrc.contains(t) || t.contains(dragSrc))) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = external ? "copy" : "move";
    var info = dropPosition(t, e.clientX, e.clientY);
    showDropIndicator(t, info.position, info.horizontal);
  }, true);

  document.addEventListener("dragend", function() {
    if (dragSrc) dragSrc.removeAttribute("data-merchiva-dragging");
    dragSrc = null;
    hideDropIndicator();
  }, true);

  document.addEventListener("drop", function(e) {
    // ── External drop from the element palette ──────────────────────────
    if (!dragSrc && isExternalInsertDrag(e)) {
      var html = e.dataTransfer.getData("application/x-merchiva-insert");
      if (!html) return;
      e.preventDefault();
      e.stopPropagation();
      var dt = e.target;
      var ins = document.createElement("div");
      ins.innerHTML = html;
      var nodes = Array.prototype.slice.call(ins.childNodes);
      var firstInserted = null;
      if (!dt || !isInRoot(dt)) {
        // Empty area / canvas chrome — append into root
        var r = root();
        if (!r) { hideDropIndicator(); return; }
        for (var i = 0; i < nodes.length; i++) {
          r.appendChild(nodes[i]);
          if (!firstInserted && nodes[i].nodeType === 1) firstInserted = nodes[i];
        }
      } else {
        var sib = findDropSibling(dt, e.clientX, e.clientY);
        if (!sib || !isInRoot(sib)) { hideDropIndicator(); return; }
        var info2 = dropPosition(sib, e.clientX, e.clientY);
        var sp = sib.parentNode;
        if (!sp) { hideDropIndicator(); return; }
        for (var j = 0; j < nodes.length; j++) {
          var n = nodes[j];
          if (info2.position === "before") sp.insertBefore(n, sib);
          else sp.insertBefore(n, sib.nextSibling);
          if (!firstInserted && n.nodeType === 1) firstInserted = n;
          // Each subsequent node should be inserted after the previous one we
          // just placed so order is preserved.
          sib = n;
          info2 = { position: "after", horizontal: info2.horizontal };
        }
      }
      hideDropIndicator();
      applyDraggable();
      if (firstInserted) {
        SELECTED_SELECTOR = buildSelector(firstInserted);
        applySelected();
      }
      notifyHtmlChanged();
      return;
    }

    // ── In-iframe reorder drop ──────────────────────────────────────────
    if (!dragSrc) return;
    e.preventDefault();
    e.stopPropagation();
    var t = e.target;
    if (!t || !isInRoot(t)) {
      dragSrc.removeAttribute("data-merchiva-dragging");
      dragSrc = null;
      hideDropIndicator();
      return;
    }
    t = findDropSibling(t, e.clientX, e.clientY);
    if (!t || t === dragSrc || dragSrc.contains(t) || t.contains(dragSrc) || !isInRoot(t)) {
      dragSrc.removeAttribute("data-merchiva-dragging");
      dragSrc = null;
      hideDropIndicator();
      return;
    }
    var info = dropPosition(t, e.clientX, e.clientY);
    var parent = t.parentNode;
    if (parent) {
      if (info.position === "before") parent.insertBefore(dragSrc, t);
      else parent.insertBefore(dragSrc, t.nextSibling);
    }
    dragSrc.removeAttribute("data-merchiva-dragging");
    var moved = dragSrc;
    dragSrc = null;
    hideDropIndicator();
    // Reapply selection to the moved element so the user can keep editing it
    SELECTED_SELECTOR = buildSelector(moved);
    applySelected();
    notifyHtmlChanged();
  }, true);

  // ── Right-click → custom context menu ──
  // Cancel the browser's default menu and surface our own via postMessage.
  // The selector + iframe-relative coords let the parent position a floating
  // menu at the click point, including the relevant element metadata.
  document.addEventListener("contextmenu", function(e) {
    if (editing) return;
    var t = e.target;
    if (!t || !isInRoot(t)) return;
    e.preventDefault();
    var sel = buildSelector(t);
    SELECTED_SELECTOR = sel;
    applySelected();
    var attrs = {};
    for (var i = 0; i < t.attributes.length; i++) {
      var a = t.attributes[i];
      if (a.name.indexOf("data-merchiva") === 0) continue;
      if (a.name === "draggable" && a.value === "true") continue;
      if (a.name === "contenteditable") continue;
      attrs[a.name] = a.value;
    }
    var isText = !!TEXT_TAGS[t.tagName];
    window.parent.postMessage({
      type: "merchiva:context-menu",
      payload: {
        selector: sel,
        tag: t.tagName.toLowerCase(),
        x: e.clientX,
        y: e.clientY,
        attrs: attrs,
        outerHtml: t.outerHTML.slice(0, 4000),
        isText: isText,
      },
    }, "*");
    // Also notify select so the right-side properties stay in sync.
    window.parent.postMessage({
      type: "merchiva:select",
      payload: { selector: sel, tag: t.tagName.toLowerCase(), outerHtml: t.outerHTML.slice(0, 4000), attrs: attrs },
    }, "*");
  }, true);

  // ── Parent → iframe message router ──
  // - merchiva:set-selected → highlight + scroll into view
  // - merchiva:edit-text    → enter contenteditable mode on a text element
  window.addEventListener("message", function(e) {
    if (!e.data || typeof e.data !== "object") return;
    if (e.data.type === "merchiva:set-selected") {
      var s = String(e.data.selector || "");
      if (s === SELECTED_SELECTOR) return;
      SELECTED_SELECTOR = s;
      applySelected();
      if (s) {
        try {
          var el = document.querySelector(s);
          if (el && typeof el.scrollIntoView === "function") {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        } catch (err) {}
      }
      return;
    }
    if (e.data.type === "merchiva:edit-text") {
      var sel2 = String(e.data.selector || "");
      if (!sel2) return;
      try {
        var t2 = document.querySelector(sel2);
        if (!t2 || !TEXT_TAGS[t2.tagName]) return;
        if (editing && editing !== t2) commitEdit(true);
        editing = t2;
        editingOriginalText = t2.innerText;
        t2.setAttribute("contenteditable", "true");
        t2.setAttribute("data-merchiva-editing", "");
        t2.removeAttribute("draggable");
        t2.focus();
        try {
          var range2 = document.createRange();
          range2.selectNodeContents(t2);
          var ssel2 = window.getSelection();
          ssel2.removeAllRanges();
          ssel2.addRange(range2);
        } catch (err2) {}
      } catch (err3) {}
      return;
    }
  });

  // Init
  applyDraggable();
  applySelected();
})();
</script>
</body>
</html>`;
}

export function HtmlCanvas({
  html,
  themeCss = "",
  selectedSelector,
  onChange,
  onSelect,
  customValues,
  onContextMenu,
  editTextSelector,
  hideViewToolbar = false,
}: HtmlCanvasProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [view, setView] = useState<"split" | "preview" | "code">(
    hideViewToolbar ? "preview" : "split",
  );
  const [draftHtml, setDraftHtml] = useState(html);
  // When the iframe itself mutated the DOM (drag drop / inline text edit),
  // it already shows the new state — we MUST NOT rebuild srcDoc, or the user
  // sees a flash and loses scroll/edit context. The next external change clears
  // this flag and re-enables the reload path.
  const iframeOriginatedRef = useRef(false);
  const lastSetSrcDocRef = useRef<string | null>(null);

  // Sync external html → local draft when source changes (e.g. AI inserted via action)
  useEffect(() => {
    if (iframeOriginatedRef.current) {
      // The new html came from the iframe round-tripping through onChange;
      // local draft is already in sync, don't bounce it back.
      return;
    }
    setDraftHtml(html);
  }, [html]);

  // Debounced commit of code-editor (and iframe-originated) edits back up
  useEffect(() => {
    if (draftHtml === html) return;
    const timer = setTimeout(() => onChange(draftHtml), 350);
    return () => clearTimeout(timer);
  }, [draftHtml, html, onChange]);

  // Listen for postMessage from iframe
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (!e.data || typeof e.data !== "object") return;
      if (e.data.type === "merchiva:select") {
        onSelect(e.data.payload as HtmlSelectionInfo | null);
      } else if (e.data.type === "merchiva:html-changed") {
        // Pretty-print the iframe's serialized DOM so the code editor view
        // stays clean after a drag/inline edit. The iframe DOM itself is
        // unchanged (iframeOriginatedRef gates the re-render path), so the
        // user sees no visual jump.
        const next = prettyPrintHtml(String(e.data.payload ?? ""));
        iframeOriginatedRef.current = true;
        setDraftHtml(next);
      } else if (e.data.type === "merchiva:context-menu") {
        if (!onContextMenu) return;
        const p = e.data.payload as {
          selector: string; tag: string; isText: boolean;
          attrs: Record<string, string>; outerHtml: string;
          x: number; y: number;
        };
        // Translate iframe-local coords to viewport coords for the parent menu.
        const rect = iframeRef.current?.getBoundingClientRect();
        const offX = rect?.left ?? 0;
        const offY = rect?.top ?? 0;
        onContextMenu({
          selector: p.selector,
          tag: p.tag,
          isText: !!p.isText,
          attrs: p.attrs ?? {},
          outerHtml: p.outerHtml ?? "",
          x: p.x + offX,
          y: p.y + offY,
        });
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onSelect, onContextMenu]);

  // Parent → iframe: trigger inline edit on a specific selector. Bumps a
  // local version counter on each *new* request so re-clicking "Edit text"
  // on the same selector re-enters edit mode.
  const lastEditSelRef = useRef<string | null>(null);
  useEffect(() => {
    if (!editTextSelector) {
      lastEditSelRef.current = null;
      return;
    }
    if (lastEditSelRef.current === editTextSelector) return;
    lastEditSelRef.current = editTextSelector;
    iframeRef.current?.contentWindow?.postMessage(
      { type: "merchiva:edit-text", selector: editTextSelector },
      "*",
    );
  }, [editTextSelector]);

  // Editor preview: substitute {key} with custom values, system values use samples
  // so the canvas looks like a real published page. The code editor still shows
  // the raw {key} placeholders.
  const previewHtml = useMemo(() => resolveValuesPreview(draftHtml, customValues), [draftHtml, customValues]);

  // srcDoc deliberately excludes selectedSelector — see the comment on
  // buildSrcDoc. Clicking elements should never rebuild this string; selection
  // changes flow into the iframe via the `merchiva:set-selected` postMessage.
  // Track the latest selection in a ref so the iframe `onLoad` handler below
  // can sync the highlight right after a genuine reload (page switch, theme
  // change, etc.) without depending on the parent push effect re-firing.
  const selectedSelectorRef = useRef(selectedSelector);
  useEffect(() => {
    selectedSelectorRef.current = selectedSelector;
  }, [selectedSelector]);

  // Compute srcDoc fresh every render (no useMemo). Memoizing here would cache
  // the CONTENT of the injected script across HMR / file edits — leaving the
  // iframe running stale code even after the bundle reloaded. The content-equality
  // gate in the effect below still prevents redundant iframe reloads at runtime.
  const srcDoc = buildSrcDoc(previewHtml, themeCss);

  // Imperative srcdoc update: reload only when the change came from outside
  // the iframe (code editor, AI action, page switch, theme change).
  useEffect(() => {
    if (iframeOriginatedRef.current) {
      iframeOriginatedRef.current = false;
      lastSetSrcDocRef.current = srcDoc;
      return;
    }
    if (!iframeRef.current) return;
    if (lastSetSrcDocRef.current === srcDoc) return;
    iframeRef.current.srcdoc = srcDoc;
    lastSetSrcDocRef.current = srcDoc;
  }, [srcDoc]);

  // Push parent-driven selection changes (e.g. clicks in the DOM tree) into
  // the iframe so the highlight outline + scroll-into-view stay in sync.
  // Skip the case where selection came FROM the iframe (it already handled it).
  const lastPushedSelRef = useRef<string | null>(null);
  useEffect(() => {
    const next = selectedSelector ?? "";
    if (lastPushedSelRef.current === next) return;
    lastPushedSelRef.current = next;
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.postMessage({ type: "merchiva:set-selected", selector: next }, "*");
    } catch {}
  }, [selectedSelector]);

  // Re-sync the current selection into the iframe whenever it (re)loads —
  // initial mount, page switch, theme change, etc. The iframe starts with
  // SELECTED_SELECTOR="" (per buildSrcDoc), so without this push the highlight
  // would disappear on every legitimate reload.
  const handleIframeLoad = useCallback(() => {
    const next = selectedSelectorRef.current ?? "";
    lastPushedSelRef.current = next;
    if (!next) return;
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.postMessage({ type: "merchiva:set-selected", selector: next }, "*");
    } catch {}
  }, []);

  const reload = useCallback(() => {
    if (iframeRef.current) {
      iframeRef.current.srcdoc = srcDoc;
      lastSetSrcDocRef.current = srcDoc;
    }
  }, [srcDoc]);

  // Persist the split-view's preview / code ratio across reloads.
  const { defaultLayout: splitLayout, onLayoutChanged: onSplitLayoutChanged } =
    useDefaultLayout({ id: "merchiva-canvas-split" });

  return (
    <div className="flex h-full w-full flex-col bg-muted">
      {/* View switcher */}
      {!hideViewToolbar && (
        <div className="flex items-center gap-1 border-b border-border bg-background px-2 py-1.5 shrink-0">
          <ViewButton active={view === "preview"} onClick={() => setView("preview")} icon={<Eye className="h-3.5 w-3.5" />} label="Preview" />
          <ViewButton active={view === "split"} onClick={() => setView("split")} icon={<MousePointer2 className="h-3.5 w-3.5" />} label="Split" />
          <ViewButton active={view === "code"} onClick={() => setView("code")} icon={<Code2 className="h-3.5 w-3.5" />} label="Code" />
          <div className="flex-1" />
          {selectedSelector && (
            <span className="font-mono text-[10.5px] text-muted-foreground truncate max-w-[280px]" title={selectedSelector}>
              {selectedSelector}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              const formatted = prettyPrintHtml(draftHtml);
              if (formatted !== draftHtml) setDraftHtml(formatted);
            }}
            className="h-6 w-6 rounded-[0.3rem] hover:bg-muted inline-flex items-center justify-center text-muted-foreground"
            title="Format HTML"
          >
            <AlignLeft className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={reload}
            className="h-6 w-6 rounded-[0.3rem] hover:bg-muted inline-flex items-center justify-center text-muted-foreground"
            title="Reload preview"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Split body: preview + code (resizable when in split mode) */}
      <div className="flex-1 min-h-0">
        {view === "preview" && (
          <div className="h-full w-full bg-white">
            <iframe
              ref={iframeRef}
              title="Page preview"
              sandbox="allow-same-origin allow-scripts"
              className="h-full w-full border-0"
              onLoad={handleIframeLoad}
            />
          </div>
        )}
        {view === "code" && (
          <div className="h-full w-full bg-stone-950">
            <CodeEditor
              value={draftHtml}
              onChange={setDraftHtml}
              language="html"
              className="h-full w-full"
              ariaLabel="HTML source editor"
            />
          </div>
        )}
        {view === "split" && (
          <ResizablePanelGroup
            orientation="vertical"
            defaultLayout={splitLayout}
            onLayoutChanged={onSplitLayoutChanged}
            className="h-full w-full"
          >
            <ResizablePanel id="canvas-preview" defaultSize="62%" minSize="20%">
              <div className="h-full w-full bg-white">
                <iframe
                  ref={iframeRef}
                  title="Page preview"
                  sandbox="allow-same-origin allow-scripts"
                  className="h-full w-full border-0"
                  onLoad={handleIframeLoad}
                />
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel id="canvas-code" defaultSize="38%" minSize="15%">
              <div className="h-full w-full bg-stone-950">
                <CodeEditor
                  value={draftHtml}
                  onChange={setDraftHtml}
                  language="html"
                  className="h-full w-full"
                  ariaLabel="HTML source editor"
                />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </div>
  );
}

function ViewButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-6 px-2 rounded-[0.3rem] inline-flex items-center gap-1.5 text-[11px] transition-colors",
        active ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900" : "text-muted-foreground hover:bg-muted",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
