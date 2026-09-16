"use client";

// Tiny "paper" preview of a template, drawn as bars from the template's
// ProseMirror JSON. No Tiptap: lib/docs/templates builds plain JSON.
// Everything renders as <span> so the thumbnail can live inside a <button>.

import { useMemo } from "react";
import { Plus } from "lucide-react";
import { buildDocTemplate, type DocTemplateId, type DocTemplateNode } from "@/lib/docs/templates";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

type ThumbBlock =
  | { kind: "title" | "heading" | "text" | "empty" | "bullet" | "task"; width: number }
  | { kind: "table"; rows: number; cols: number; header: boolean };

const THUMB_MAX_BLOCKS = 10;
/** Fixed creation date so thumbnails are deterministic across renders. */
const THUMB_NOW = new Date(2026, 0, 5);
const WIDE_CHAR_RE = /[⺀-鿿가-힯豈-﫿＀-￯]/;

function nodeText(node: DocTemplateNode): string {
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(nodeText).join("");
}

/** Bar width in %, from the text length (CJK glyphs count double). */
function widthFor(text: string, min: number, max: number): number {
  let units = 0;
  for (const ch of text) units += WIDE_CHAR_RE.test(ch) ? 2 : 1;
  return Math.max(min, Math.min(max, 18 + units * 3));
}

function thumbBlocks(doc: DocTemplateNode): ThumbBlock[] {
  const blocks: ThumbBlock[] = [];
  const push = (block: ThumbBlock) => {
    if (blocks.length < THUMB_MAX_BLOCKS) blocks.push(block);
  };
  for (const node of doc.content ?? []) {
    if (blocks.length >= THUMB_MAX_BLOCKS) break;
    switch (node.type) {
      case "paragraph": {
        const text = nodeText(node);
        if (node.attrs?.docStyle === "title") push({ kind: "title", width: widthFor(text, 45, 85) });
        else if (text.trim()) push({ kind: "text", width: widthFor(text, 40, 95) });
        else push({ kind: "empty", width: 70 });
        break;
      }
      case "heading":
        push({ kind: "heading", width: widthFor(nodeText(node), 30, 70) });
        break;
      case "bulletList":
      case "orderedList":
      case "taskList":
        for (const item of node.content ?? []) {
          push({ kind: node.type === "taskList" ? "task" : "bullet", width: widthFor(nodeText(item), 35, 80) });
        }
        break;
      case "table": {
        const rows = node.content ?? [];
        const cols = rows.reduce((max, row) => Math.max(max, row.content?.length ?? 0), 1);
        push({
          kind: "table",
          rows: Math.max(1, Math.min(rows.length, 4)),
          cols: Math.min(cols, 8),
          header: rows[0]?.content?.[0]?.type === "tableHeader",
        });
        break;
      }
      default:
        break;
    }
  }
  return blocks;
}

const BAR = "block h-1 rounded-[1px]";

function ThumbBlockView({ block }: { block: ThumbBlock }) {
  switch (block.kind) {
    case "title":
      return <span className="block h-2 shrink-0 rounded-[1px] bg-neutral-800" style={{ width: `${block.width}%` }} />;
    case "heading":
      return <span className="mt-0.5 block h-1.5 shrink-0 rounded-[1px] bg-neutral-700" style={{ width: `${block.width}%` }} />;
    case "text":
      return (
        <span className="flex shrink-0 flex-col gap-0.5">
          <span className={cn(BAR, "bg-neutral-300")} style={{ width: "92%" }} />
          <span className={cn(BAR, "bg-neutral-300")} style={{ width: `${block.width}%` }} />
        </span>
      );
    case "empty":
      return <span className={cn(BAR, "shrink-0 bg-neutral-200")} style={{ width: `${block.width}%` }} />;
    case "bullet":
    case "task":
      return (
        <span className="flex shrink-0 items-center gap-1">
          {block.kind === "task" ? (
            <span className="block h-1.5 w-1.5 shrink-0 border border-neutral-400" />
          ) : (
            <span className="block h-1 w-1 shrink-0 rounded-full bg-neutral-400" />
          )}
          <span className={cn(BAR, "bg-neutral-300")} style={{ width: `${block.width}%` }} />
        </span>
      );
    case "table":
      return (
        <span
          className="grid shrink-0 border-s border-t border-neutral-300"
          style={{ gridTemplateColumns: `repeat(${block.cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: block.rows * block.cols }, (_, index) => (
            <span
              key={index}
              className={cn("block h-1.5 border-e border-b border-neutral-300", block.header && index < block.cols && "bg-neutral-200")}
            />
          ))}
        </span>
      );
  }
}

export function TemplateThumb({ id }: { id: DocTemplateId }) {
  const { t, locale } = useI18n();
  const blocks = useMemo(
    () =>
      id === "blank"
        ? []
        : thumbBlocks(buildDocTemplate(id, t, { locale, storeName: null, authorName: null, now: THUMB_NOW }).content),
    [id, t, locale],
  );

  if (id === "blank") {
    return (
      <span aria-hidden className="flex h-full items-center justify-center">
        <Plus className="h-7 w-7 text-neutral-400" strokeWidth={1.5} />
      </span>
    );
  }
  return (
    <span aria-hidden className="flex h-full flex-col gap-1 overflow-hidden">
      {blocks.map((block, index) => (
        <ThumbBlockView key={index} block={block} />
      ))}
    </span>
  );
}
