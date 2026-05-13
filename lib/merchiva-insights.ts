import type { InventoryItem, Shift, SalesRecord } from "@/lib/types";

export interface MerchivaInsight {
  id: string;
  type: "inventory" | "staffing" | "sales" | "watchlist";
  severity: "high" | "medium" | "low";
  title: string;
  body: string;
  confidence: number;
  reasoning: string[];
  primaryAction?: { label: string };
  secondaryAction?: string;
  data?: Record<string, unknown>;
}

export function generateInsights(
  inventory: InventoryItem[],
  shifts: Shift[],
  salesHistory: SalesRecord[],
  salesHourly: SalesRecord[],
): MerchivaInsight[] {
  const insights: MerchivaInsight[] = [];
  const today = new Date().toISOString().slice(0, 10);

  // ── Inventory insights ────────────────────────────────────────────────────

  const criticalItems = inventory.filter((i) => i.currentStock <= i.minStock);
  const lowItems = inventory.filter(
    (i) => i.currentStock > i.minStock && i.currentStock <= i.minStock * 1.5,
  );

  if (criticalItems.length > 0) {
    const topItem = criticalItems.sort(
      (a, b) => a.currentStock / (a.minStock || 1) - b.currentStock / (b.minStock || 1),
    )[0];
    const daysOfCover = topItem.maxStock > 0
      ? Math.max(1, Math.round((topItem.currentStock / topItem.maxStock) * 14))
      : 1;
    const estCost = topItem.costPerUnit * (topItem.maxStock - topItem.currentStock);

    insights.push({
      id: `inv-reorder-${topItem.id}`,
      type: "inventory",
      severity: "high",
      title: `Reorder ${topItem.name} today.`,
      body: `Current stock is ${topItem.currentStock} ${topItem.unit} (min: ${topItem.minStock}). ` +
        `At current usage rate, you have ~${daysOfCover} days of cover. ` +
        (topItem.supplier
          ? `Supplier: ${topItem.supplier}. Estimated reorder cost: $${estCost.toFixed(0)}.`
          : `Estimated reorder cost: $${estCost.toFixed(0)}.`),
      confidence: Math.min(0.98, 0.85 + criticalItems.length * 0.02),
      reasoning: [
        `stock: ${topItem.currentStock}/${topItem.minStock} min`,
        `cover: ~${daysOfCover}d`,
        topItem.supplier ? `supplier: ${topItem.supplier}` : "no supplier set",
        `${criticalItems.length} items critical`,
      ],
      primaryAction: { label: `Review PO · $${estCost.toFixed(0)}` },
      secondaryAction: "Snooze 24h",
      data: {
        itemId: topItem.id,
        itemName: topItem.name,
        currentStock: topItem.currentStock,
        minStock: topItem.minStock,
        maxStock: topItem.maxStock,
        unit: topItem.unit,
        daysOfCover,
      },
    });
  }

  // ── Staffing insights ─────────────────────────────────────────────────────

  const next7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });

  const shiftsByDay = next7Days.map((date) => ({
    date,
    dayName: new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" }),
    count: shifts.filter((s) => s.date === date).length,
  }));

  const avgShiftsPerDay = shiftsByDay.length > 0
    ? shiftsByDay.reduce((s, d) => s + d.count, 0) / shiftsByDay.length
    : 0;

  const understaffedDays = shiftsByDay.filter(
    (d) => d.count > 0 && d.count < avgShiftsPerDay * 0.7,
  );
  const unstaffedDays = shiftsByDay.filter((d) => d.count === 0 && d.date !== today);

  if (unstaffedDays.length > 0) {
    insights.push({
      id: "staff-unscheduled",
      type: "staffing",
      severity: "high",
      title: `${unstaffedDays.length} day${unstaffedDays.length > 1 ? "s" : ""} with no shifts scheduled.`,
      body: `${unstaffedDays.map((d) => d.dayName).join(", ")} ha${unstaffedDays.length > 1 ? "ve" : "s"} zero shifts. ` +
        `Average is ${avgShiftsPerDay.toFixed(1)} shifts/day. Open the schedule to fill gaps.`,
      confidence: 0.95,
      reasoning: [
        `${unstaffedDays.length} days with 0 shifts`,
        `avg: ${avgShiftsPerDay.toFixed(1)} shifts/day`,
        "next 7 days scanned",
      ],
      primaryAction: { label: "Open schedule" },
      secondaryAction: "Dismiss",
    });
  } else if (understaffedDays.length > 0) {
    const worst = understaffedDays.sort((a, b) => a.count - b.count)[0];
    insights.push({
      id: "staff-gap",
      type: "staffing",
      severity: "medium",
      title: `${worst.dayName} looks understaffed.`,
      body: `Only ${worst.count} shift${worst.count !== 1 ? "s" : ""} scheduled vs ${avgShiftsPerDay.toFixed(1)} average. ` +
        `Consider adding coverage.`,
      confidence: 0.78,
      reasoning: [
        `${worst.dayName}: ${worst.count} shifts`,
        `avg: ${avgShiftsPerDay.toFixed(1)}/day`,
        `${understaffedDays.length} days below 70% staffing`,
      ],
      primaryAction: { label: "Open schedule" },
      secondaryAction: "Dismiss",
    });
  }

  // ── Sales trend insight ───────────────────────────────────────────────────

  if (salesHistory.length >= 7) {
    const sorted = [...salesHistory].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
    const recent7 = sorted.slice(0, 7);
    const prev7 = sorted.slice(7, 14);

    if (prev7.length > 0) {
      const recentAvg = recent7.reduce((s, r) => s + r.actual, 0) / recent7.length;
      const prevAvg = prev7.reduce((s, r) => s + r.actual, 0) / prev7.length;
      const change = prevAvg > 0 ? ((recentAvg - prevAvg) / prevAvg) * 100 : 0;

      if (Math.abs(change) > 5) {
        const trending = change > 0 ? "up" : "down";
        insights.push({
          id: "sales-trend",
          type: "sales",
          severity: Math.abs(change) > 15 ? "high" : "medium",
          title: `Sales trending ${trending} ${Math.abs(change).toFixed(1)}% week-over-week.`,
          body: `Last 7 days averaged $${recentAvg.toFixed(0)}/day vs $${prevAvg.toFixed(0)} the prior week. ` +
            (change > 0
              ? "Consider increasing prep and staffing to match demand."
              : "Review promotions or check for external factors."),
          confidence: 0.72,
          reasoning: [
            `7d avg: $${recentAvg.toFixed(0)}`,
            `prior 7d: $${prevAvg.toFixed(0)}`,
            `change: ${change > 0 ? "+" : ""}${change.toFixed(1)}%`,
          ],
          primaryAction: { label: "View reports" },
          secondaryAction: "Dismiss",
        });
      }
    }
  }

  // ── Watchlist ──────────────────────────────────────────────────────────────

  const watchlistItems = [...criticalItems, ...lowItems]
    .sort((a, b) => a.currentStock / (a.minStock || 1) - b.currentStock / (b.minStock || 1))
    .slice(0, 5);

  if (watchlistItems.length > 0) {
    insights.push({
      id: "watchlist",
      type: "watchlist",
      severity: criticalItems.length > 0 ? "high" : "medium",
      title: `${watchlistItems.length} SKU${watchlistItems.length !== 1 ? "s" : ""} need attention.`,
      body: watchlistItems.map((i) => i.name).join(", ") + ".",
      confidence: 0.9,
      reasoning: [
        `${criticalItems.length} critical`,
        `${lowItems.length} low`,
        `of ${inventory.length} total`,
      ],
      data: {
        items: watchlistItems.map((i) => ({
          id: i.id,
          name: i.name,
          currentStock: i.currentStock,
          minStock: i.minStock,
          maxStock: i.maxStock,
          unit: i.unit,
          status: i.status,
        })),
      },
    });
  }

  return insights.sort((a, b) => {
    const sev = { high: 0, medium: 1, low: 2 };
    return sev[a.severity] - sev[b.severity];
  });
}

export function getLastScanTime(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("merchiva_last_scan");
}

export function setLastScanTime(): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("merchiva_last_scan", new Date().toISOString());
  }
}

export function shouldScan(): boolean {
  const last = getLastScanTime();
  if (!last) return true;
  const diff = Date.now() - new Date(last).getTime();
  return diff > 4 * 60 * 60 * 1000; // rescan every 4 hours
}

export function generateGreeting(insightCount: number): string {
  const h = new Date().getHours();
  const period = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  if (insightCount === 0) {
    return `Good ${period}. Everything looks good — no issues found.`;
  }
  return `Good ${period}. I scanned your data — here ${insightCount === 1 ? "is" : "are"} ${insightCount} thing${insightCount !== 1 ? "s" : ""} to look at.`;
}
