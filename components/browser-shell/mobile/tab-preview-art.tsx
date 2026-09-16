import type { CSSProperties, ReactNode } from "react";
import type { PreviewKind } from "@/lib/browser-shell";
import { cn } from "@/lib/utils";

/*
 * Neutral placeholder art for tab cards and page ghosts (mobile-safari spec §11.4). Live page
 * snapshots are rejected (spec F2). Everything is muted / border tokens with no hue, and all
 * sizes derive from `--art-u` so the same composition works on a card and full screen.
 */

const UNIT: Record<"card" | "page", string> = { card: "3px", page: "6px" };

const line = "rounded-sm bg-muted";
const soft = "rounded-sm bg-muted-foreground/15";

function Dashboard() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[calc(var(--art-u)*2)] p-[calc(var(--art-u)*3)]">
      <div className="grid grid-cols-2 gap-[calc(var(--art-u)*2)]">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex h-[calc(var(--art-u)*10)] flex-col justify-center gap-[var(--art-u)] rounded border border-border px-[calc(var(--art-u)*2)]"
          >
            <div className={cn(line, "h-[var(--art-u)] w-1/3")} />
            <div className={cn(soft, "h-[calc(var(--art-u)*1.5)] w-1/2")} />
          </div>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 items-end gap-[var(--art-u)] rounded border border-border px-[calc(var(--art-u)*2)] pt-[calc(var(--art-u)*4)] pb-[calc(var(--art-u)*2)]">
        {[40, 65, 50, 80, 55, 70].map((height, i) => (
          <div key={i} className={cn(soft, "flex-1")} style={{ height: `${height}%` }} />
        ))}
      </div>
    </div>
  );
}

function List() {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-[calc(var(--art-u)*3)] pt-[calc(var(--art-u)*3)]">
      <div className={cn(line, "mb-[calc(var(--art-u)*2)] h-[calc(var(--art-u)*2)] w-1/2")} />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="flex min-h-0 flex-1 items-center justify-between gap-[calc(var(--art-u)*2)] border-b border-border">
          <div className={cn(line, "h-[calc(var(--art-u)*1.5)] w-2/3")} />
          <div className={cn(soft, "h-[calc(var(--art-u)*1.5)] w-1/6")} />
        </div>
      ))}
    </div>
  );
}

function Grid() {
  return (
    <div className="grid grid-cols-3 content-start gap-[calc(var(--art-u)*2)] p-[calc(var(--art-u)*3)]">
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <div key={i} className="aspect-square rounded border border-border bg-muted/60" />
      ))}
    </div>
  );
}

function Doc() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-muted/40">
      <div className="mx-[10%] my-[6%] flex min-h-0 flex-1 flex-col gap-[calc(var(--art-u)*2)] border border-border bg-background p-[calc(var(--art-u)*3)]">
        <div className={cn(soft, "mb-[var(--art-u)] h-[calc(var(--art-u)*2.5)] w-3/5")} />
        {[90, 100, 80, 95, 60, 100, 85, 70].map((width, i) => (
          <div key={i} className={cn(line, "h-[calc(var(--art-u)*1.5)]")} style={{ width: `${width}%` }} />
        ))}
      </div>
    </div>
  );
}

function Chat() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col justify-end gap-[calc(var(--art-u)*2)] p-[calc(var(--art-u)*3)]">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={cn("h-[calc(var(--art-u)*6)] rounded bg-muted", i % 2 === 0 ? "w-[60%] self-start" : "w-[45%] self-end")}
          />
        ))}
      </div>
      <div className="flex h-[calc(var(--art-u)*10)] shrink-0 items-center border-t border-border px-[calc(var(--art-u)*3)]">
        <div className="h-[calc(var(--art-u)*5)] w-full rounded border border-border" />
      </div>
    </div>
  );
}

function Calendar() {
  const blocks = new Set([8, 16, 26]);
  return (
    <div className="flex min-h-0 flex-1 flex-col p-[calc(var(--art-u)*3)]">
      <div className="mb-[calc(var(--art-u)*2)] grid grid-cols-7 gap-[var(--art-u)]">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className={cn(line, "mx-auto h-[var(--art-u)] w-1/2")} />
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-5 border-s border-t border-border">
        {Array.from({ length: 35 }, (_, i) => (
          <div key={i} className="border-e border-b border-border p-[calc(var(--art-u)*0.5)]">
            {blocks.has(i) && <div className="h-1/2 rounded-sm bg-muted" />}
          </div>
        ))}
      </div>
    </div>
  );
}

function Form() {
  return (
    <div className="flex flex-col gap-[calc(var(--art-u)*4)] p-[calc(var(--art-u)*4)]">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex flex-col gap-[calc(var(--art-u)*1.5)]">
          <div className={cn(line, "h-[calc(var(--art-u)*1.5)] w-1/4")} />
          <div className="h-[calc(var(--art-u)*7)] rounded border border-border" />
        </div>
      ))}
    </div>
  );
}

function Blank() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-[calc(var(--art-u)*3)]">
      <div className="grid grid-cols-4 gap-[calc(var(--art-u)*3)]">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="h-[calc(var(--art-u)*8)] w-[calc(var(--art-u)*8)] rounded bg-muted" />
        ))}
      </div>
    </div>
  );
}

const ART: Record<PreviewKind, () => ReactNode> = {
  dashboard: Dashboard,
  list: List,
  grid: Grid,
  doc: Doc,
  chat: Chat,
  calendar: Calendar,
  form: Form,
  blank: Blank,
};

export function TabPreviewArt({ kind, size = "card", className }: { kind: PreviewKind; size?: "card" | "page"; className?: string }) {
  const Art = ART[kind] ?? List;
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none flex min-h-0 flex-1 flex-col overflow-hidden bg-background", className)}
      style={{ "--art-u": UNIT[size] } as CSSProperties}
    >
      <Art />
    </div>
  );
}
