/**
 * Lightweight skeleton placeholders — Stone palette, sharp corners,
 * no glow. Used when loading with no cached data available.
 */

export function SkeletonCard() {
  return (
    <div className="rounded-[0.3rem] border p-3 flex items-center gap-3 bg-card">
      <div className="rounded-sm h-7 w-7 bg-stone-100 animate-pulse shrink-0" />
      <div className="space-y-1.5 flex-1">
        <div className="h-5 w-10 bg-stone-100 rounded-sm animate-pulse" />
        <div className="h-3 w-20 bg-stone-100 rounded-sm animate-pulse" />
      </div>
    </div>
  );
}

export function SkeletonRow({ cols = 5 }: { cols?: number }) {
  const widths = [45, 60, 35, 55, 40, 50, 30, 65, 25];
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="p-3">
          <div
            className="h-4 bg-stone-100 rounded-sm animate-pulse"
            style={{ width: `${widths[i % widths.length]}%` }}
          />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonText({
  width = "100%",
  className = "",
}: {
  width?: string;
  className?: string;
}) {
  return (
    <div
      className={`h-4 bg-stone-100 rounded-sm animate-pulse ${className}`}
      style={{ width }}
    />
  );
}
