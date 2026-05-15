"use client";

import { useMemo, useState, useEffect } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import type { HtmlSelectionInfo } from "./html-canvas";

interface DomTreeProps {
  html: string;
  selectedSelector?: string | null;
  onSelect: (info: HtmlSelectionInfo) => void;
}

interface TreeNode {
  selector: string;
  tag: string;
  id?: string;
  className?: string;
  textPreview?: string;
  outerHtml: string;
  attrs: Record<string, string>;
  children: TreeNode[];
}

const ROOT_ID = "__merchiva_root";

// Mirrors the selector format buildSrcDoc's in-iframe buildSelector uses, so
// selecting from the tree resolves to the same DOM node when the iframe runs
// document.querySelector(SELECTED_SELECTOR).
function buildSelector(el: Element): string {
  if (el.id) return "#" + CSS.escape(el.id);
  const path: string[] = [];
  let cur: Element | null = el;
  while (cur && cur.id !== ROOT_ID && path.length < 8) {
    let part = cur.tagName.toLowerCase();
    const parent: Element | null = cur.parentElement;
    if (parent) {
      const sameTag = Array.from(parent.children).filter((c) => c.tagName === cur!.tagName);
      if (sameTag.length > 1) {
        part += `:nth-of-type(${sameTag.indexOf(cur) + 1})`;
      }
    }
    path.unshift(part);
    cur = parent;
  }
  return `#${ROOT_ID} > ${path.join(" > ")}`;
}

function firstTextSnippet(el: Element): string {
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === 3) {
      const t = (child.textContent || "").trim();
      if (t) return t.slice(0, 32);
    }
  }
  return "";
}

function buildTree(el: Element): TreeNode {
  const attrs: Record<string, string> = {};
  for (const a of Array.from(el.attributes)) attrs[a.name] = a.value;
  return {
    selector: buildSelector(el),
    tag: el.tagName.toLowerCase(),
    id: el.id || undefined,
    className: el.className || undefined,
    textPreview: firstTextSnippet(el),
    outerHtml: el.outerHTML.slice(0, 4000),
    attrs,
    children: Array.from(el.children).map(buildTree),
  };
}

export function DomTree({ html, selectedSelector, onSelect }: DomTreeProps) {
  const t = useT();
  const tree = useMemo<TreeNode[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(
        `<!DOCTYPE html><html><body><div id="${ROOT_ID}">${html}</div></body></html>`,
        "text/html",
      );
      const root = doc.getElementById(ROOT_ID);
      if (!root) return [];
      return Array.from(root.children).map(buildTree);
    } catch {
      return [];
    }
  }, [html]);

  if (tree.length === 0) {
    return <div className="px-3 py-2 text-[11px] text-muted-foreground">{t("builder.domTree.noElements")}</div>;
  }

  return (
    <ul className="text-[11px] font-mono select-none">
      {tree.map((node) => (
        <TreeItem
          key={node.selector}
          node={node}
          depth={0}
          selectedSelector={selectedSelector ?? null}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}

function TreeItem({
  node,
  depth,
  selectedSelector,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedSelector: string | null;
  onSelect: (info: HtmlSelectionInfo) => void;
}) {
  // Auto-expand the path to the selected node so it's always visible.
  const containsSelected = selectedSelector ? selectorIsDescendant(node, selectedSelector) : false;
  const [open, setOpen] = useState(depth < 1 || containsSelected);
  useEffect(() => {
    if (containsSelected && !open) setOpen(true);
    // intentionally not depending on `open` — only react to selection changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containsSelected]);

  const isSelected = selectedSelector === node.selector;
  const hasKids = node.children.length > 0;

  return (
    <li>
      <div
        className={cn(
          "group flex items-center gap-0.5 py-0.5 cursor-pointer transition-colors",
          isSelected ? "bg-accent text-foreground" : "hover:bg-accent/50",
        )}
        style={{ paddingLeft: 6 + depth * 10, paddingRight: 6 }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect({
            selector: node.selector,
            tag: node.tag,
            outerHtml: node.outerHtml,
            attrs: node.attrs,
          });
        }}
      >
        {hasKids ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
            className="h-3 w-3 inline-flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
          >
            {open ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
          </button>
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <span className="text-stone-700 dark:text-stone-300 shrink-0">{node.tag}</span>
        {node.id && <span className="text-rose-600 dark:text-rose-400 truncate shrink-0">#{node.id}</span>}
        {node.className && (
          <span className="text-sky-600 dark:text-sky-400 truncate shrink-0">
            .{String(node.className).split(/\s+/)[0]}
          </span>
        )}
        {node.textPreview && (
          <span className="text-muted-foreground truncate ml-1 italic">&quot;{node.textPreview}&quot;</span>
        )}
      </div>
      {hasKids && open && (
        <ul>
          {node.children.map((c) => (
            <TreeItem
              key={c.selector}
              node={c}
              depth={depth + 1}
              selectedSelector={selectedSelector}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function selectorIsDescendant(node: TreeNode, target: string): boolean {
  if (node.selector === target) return true;
  for (const c of node.children) if (selectorIsDescendant(c, target)) return true;
  return false;
}
