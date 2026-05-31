import React from "react";
import { Box, Text } from "ink";
import { Gate } from "../components/Gate.tsx";
import { Table, type Column } from "../components/Table.tsx";
import { useSales, type Sale } from "../data/hooks.ts";
import { theme, money } from "../theme.ts";

export function Sales({ height }: { height: number }) {
  const [sales, ready] = useSales();
  const total = sales.reduce((a, s) => a + s.total, 0);
  const columns: Column<Sale>[] = [
    { header: "Date", width: 12, render: (r) => r.date || "—" },
    { header: "Source", width: 8, render: (r) => r.source, color: (r) => (r.source === "pos" ? theme.accent : theme.muted) },
    { header: "Items", width: 7, align: "right", render: (r) => String(r.items) },
    { header: "Total", width: 12, align: "right", render: (r) => money(r.total), color: () => theme.good },
  ];
  return (
    <Gate ready={ready}>
      <Box flexDirection="column">
        <Text color={theme.dim}>
          {sales.length} transactions · total {money(total)}
        </Text>
        <Box marginTop={1}>
          <Table columns={columns} rows={sales} maxRows={Math.max(5, height - 6)} emptyText="No sales recorded yet." />
        </Box>
      </Box>
    </Gate>
  );
}
