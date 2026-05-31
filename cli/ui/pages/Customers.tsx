import React from "react";
import { Box, Text } from "ink";
import { Gate } from "../components/Gate.tsx";
import { Table, type Column } from "../components/Table.tsx";
import { useCustomers, type Customer } from "../data/hooks.ts";
import { theme, money } from "../theme.ts";

export function Customers({ height }: { height: number }) {
  const [customers, ready] = useCustomers();
  const columns: Column<Customer>[] = [
    { header: "Name", width: 24, render: (r) => r.name },
    { header: "Email", width: 28, render: (r) => r.email || "—" },
    { header: "Spent", width: 12, align: "right", render: (r) => money(r.totalSpent), color: () => theme.good },
  ];
  return (
    <Gate ready={ready}>
      <Box flexDirection="column">
        <Text color={theme.dim}>{customers.length} customers · sorted by lifetime spend</Text>
        <Box marginTop={1}>
          <Table columns={columns} rows={customers} maxRows={Math.max(5, height - 6)} emptyText="No customers yet." />
        </Box>
      </Box>
    </Gate>
  );
}
