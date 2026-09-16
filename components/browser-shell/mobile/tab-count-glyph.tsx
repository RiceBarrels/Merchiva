import { cn } from "@/lib/utils";

/** Safari's tab-count square (spec §6.3). Shows ∞ past 99 tabs. Decorative: the button carries the label. */
export function TabCountGlyph({ count, className }: { count: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-[3px] border-[1.75px] border-current px-[3px] font-mono text-[10.5px] font-semibold leading-none tabular-nums",
        className,
      )}
    >
      {count > 99 ? "∞" : Math.max(0, count)}
    </span>
  );
}
