import React from "react";
import { Box, Text } from "ink";
import { Gate } from "../components/Gate.tsx";
import { Table, type Column } from "../components/Table.tsx";
import { useSales, useProducts, type Prod } from "../data/hooks.ts";
import { theme, money, pad } from "../theme.ts";

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.border}
      paddingX={1}
      width={24}
      marginRight={1}
    >
      <Text color={theme.dim}>{label.toUpperCase()}</Text>
      <Text color={color ?? theme.fg} bold>
        {value}
      </Text>
    </Box>
  );
}

interface DayBucket {
  date: string;
  total: number;
}

export function Reports({
  height,
  focused,
  setCapturing,
}: {
  height: number;
  focused: boolean;
  setCapturing: (b: boolean) => void;
}) {
  // Read-only analytics — `focused` / `setCapturing` are intentionally unused.
  void focused;
  void setCapturing;

  const [sales, salesReady] = useSales();
  const [products, prodReady] = useProducts();
  const ready = salesReady && prodReady;

  const revenue = sales.reduce((a, s) => a + s.total, 0);
  const count = sales.length;
  const avgTicket = count > 0 ? revenue / count : 0;

  // Last 7 calendar days, oldest → newest.
  const today = new Date();
  const days: DayBucket[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const total = sales.filter((s) => s.date === iso).reduce((a, s) => a + s.total, 0);
    days.push({ date: iso, total });
  }
  const maxDay = days.reduce((m, d) => Math.max(m, d.total), 0);
  const BAR_WIDTH = 24;
  const barFor = (total: number): string => {
    if (maxDay <= 0) return "";
    const n = Math.round((total / maxDay) * BAR_WIDTH);
    return "█".repeat(Math.max(total > 0 ? 1 : 0, n));
  };

  const topProducts = [...products]
    .sort((a, b) => b.soldThisMonth - a.soldThisMonth)
    .slice(0, 5);

  const productColumns: Column<Prod>[] = [
    { header: "Product", width: 24, render: (r) => r.name || "—" },
    { header: "Sold/mo", width: 9, align: "right", render: (r) => String(r.soldThisMonth) },
    {
      header: "Revenue",
      width: 12,
      align: "right",
      render: (r) => money(r.price * r.soldThisMonth),
      color: () => theme.good,
    },
  ];

  return (
    <Gate ready={ready}>
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Stat label="Total revenue" value={money(revenue)} color={theme.good} />
          <Stat label="Transactions" value={String(count)} />
          <Stat label="Avg ticket" value={money(avgTicket)} color={theme.accent} />
        </Box>

        <Text color={theme.dim} bold>
          REVENUE — LAST 7 DAYS
        </Text>
        {days.map((d) => (
          <Box key={d.date}>
            <Text color={theme.muted}>{pad(d.date, 12)}</Text>
            <Text color={theme.accent}>{pad(barFor(d.total), BAR_WIDTH)}</Text>
            <Text color={theme.good}> {money(d.total)}</Text>
          </Box>
        ))}

        <Box marginTop={1} flexDirection="column">
          <Text color={theme.dim} bold>
            TOP PRODUCTS
          </Text>
          <Table
            columns={productColumns}
            rows={topProducts}
            maxRows={Math.max(5, height - 18)}
            emptyText="No product sales yet."
          />
        </Box>
      </Box>
    </Gate>
  );
}
