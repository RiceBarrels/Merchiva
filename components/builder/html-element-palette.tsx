"use client";

import {
  Heading,
  Type,
  Square,
  Image as ImageIcon,
  Layers,
  Minus,
  Link as LinkIcon,
  List,
  Space,
  ArrowRight,
  Quote,
  Table2,
} from "lucide-react";
import { useT } from "@/lib/i18n/context";
import { Eyebrow } from "@/components/ui/eyebrow";

interface PaletteItem {
  id: string;
  labelKey: string;
  icon: React.ReactNode;
  // Snippet inserted into the canvas. Self-contained, semantic, inline-styled
  // so it renders sensibly inside the editor's iframe (no app CSS available).
  html: string;
}

const ITEMS: PaletteItem[] = [
  {
    id: "h2",
    labelKey: "heading",
    icon: <Heading className="h-3.5 w-3.5" />,
    html: '<h2 style="font-size:32px;font-weight:700;letter-spacing:-0.01em;margin:0 0 16px;color:#1c1917">Section heading</h2>',
  },
  {
    id: "p",
    labelKey: "text",
    icon: <Type className="h-3.5 w-3.5" />,
    html: '<p style="font-size:16px;line-height:1.65;color:#57534e;margin:0 0 16px;max-width:640px">Write something specific here — a real sentence, not lorem ipsum.</p>',
  },
  {
    id: "button",
    labelKey: "button",
    icon: <Square className="h-3.5 w-3.5" />,
    html: '<button style="padding:12px 24px;background:#1c1917;color:#fff;border-radius:8px;border:0;font-weight:500;cursor:pointer">Get in touch</button>',
  },
  {
    id: "link",
    labelKey: "link",
    icon: <LinkIcon className="h-3.5 w-3.5" />,
    html: '<a href="#" style="color:#0ea5e9;text-decoration:underline;font-weight:500">Learn more</a>',
  },
  {
    id: "img",
    labelKey: "image",
    icon: <ImageIcon className="h-3.5 w-3.5" />,
    html: '<img src="https://images.unsplash.com/photo-1497436072909-60f360e1d4b1?auto=format&fit=crop&w=1600&q=80" alt="Mountain landscape" style="width:100%;height:auto;border-radius:12px;display:block" />',
  },
  {
    id: "section",
    labelKey: "section",
    icon: <Layers className="h-3.5 w-3.5" />,
    html: '<section style="padding:80px 24px"><div style="max-width:1100px;margin:0 auto"></div></section>',
  },
  {
    id: "row",
    labelKey: "row",
    icon: <ArrowRight className="h-3.5 w-3.5" />,
    html: '<div style="display:flex;gap:24px;align-items:center"></div>',
  },
  {
    id: "grid3",
    labelKey: "grid",
    icon: <Table2 className="h-3.5 w-3.5" />,
    html: '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:24px"></div>',
  },
  {
    id: "ul",
    labelKey: "list",
    icon: <List className="h-3.5 w-3.5" />,
    html: '<ul style="line-height:1.7;padding-left:20px;color:#1c1917"><li>First point</li><li>Second point</li><li>Third point</li></ul>',
  },
  {
    id: "quote",
    labelKey: "quote",
    icon: <Quote className="h-3.5 w-3.5" />,
    html: '<blockquote style="border-left:3px solid #1c1917;padding:8px 0 8px 20px;margin:24px 0;font-size:18px;line-height:1.5;font-style:italic;color:#1c1917">A line worth quoting.<cite style="display:block;margin-top:8px;font-size:13px;color:#78716c;font-style:normal">— Author</cite></blockquote>',
  },
  {
    id: "divider",
    labelKey: "divider",
    icon: <Minus className="h-3.5 w-3.5" />,
    html: '<hr style="border:0;border-top:1px solid #e7e5e4;margin:32px 0" />',
  },
  {
    id: "spacer",
    labelKey: "spacer",
    icon: <Space className="h-3.5 w-3.5" />,
    html: '<div style="height:48px" aria-hidden="true"></div>',
  },
];

interface HtmlElementPaletteProps {
  // Click handler — inserts relative to the currently selected element (or
  // appends to root when nothing is selected). HtmlBuilderEditor decides where.
  onInsert: (html: string) => void;
  // Item ids to hide. Used by the design surface to suppress link insertion
  // (designs are static artwork — no navigation targets).
  hideItems?: string[];
}

// MIME type used to ferry insert payloads from this palette into the iframe's
// drop handler. Anything else dropped (in-iframe drag, files) is ignored by
// the external-drop branch.
export const PALETTE_DRAG_TYPE = "application/x-merchiva-insert";

export function HtmlElementPalette({ onInsert, hideItems }: HtmlElementPaletteProps) {
  const t = useT();
  const hidden = hideItems && hideItems.length > 0 ? new Set(hideItems) : null;
  const items = hidden ? ITEMS.filter((i) => !hidden.has(i.id)) : ITEMS;
  return (
    <div className="flex items-center gap-1 overflow-x-auto px-2 py-1.5 border-b border-border bg-background shrink-0">
      <Eyebrow as="span" size="xs" className="shrink-0 mr-2 ml-1">
        {t("builder.htmlPalette.insert")}
      </Eyebrow>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "copy";
            e.dataTransfer.setData(PALETTE_DRAG_TYPE, item.html);
            // Fallback for browsers that filter unknown MIME types.
            e.dataTransfer.setData("text/plain", item.html);
          }}
          onClick={() => onInsert(item.html)}
          className="inline-flex items-center gap-1.5 h-7 px-2 rounded text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent hover:border-border transition-colors shrink-0 cursor-grab active:cursor-grabbing"
          title={t("builder.htmlPalette.tooltip")}
        >
          {item.icon}
          <span>{t(`builder.htmlPalette.${item.labelKey}`)}</span>
        </button>
      ))}
    </div>
  );
}
