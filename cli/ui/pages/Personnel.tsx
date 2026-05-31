import React from "react";
import { Box, Text } from "ink";
import { Gate } from "../components/Gate.tsx";
import { Table, type Column } from "../components/Table.tsx";
import { useStaff, type Staff } from "../data/hooks.ts";
import { theme, money } from "../theme.ts";

export function Personnel({ height }: { height: number }) {
  const [staff, ready] = useStaff();
  const columns: Column<Staff>[] = [
    { header: "Name", width: 24, render: (r) => r.name },
    { header: "Role", width: 18, render: (r) => r.role, color: () => theme.accent },
    { header: "Hourly", width: 10, align: "right", render: (r) => money(r.hourlyRate) },
  ];
  return (
    <Gate ready={ready}>
      <Box flexDirection="column">
        <Text color={theme.dim}>{staff.length} team members</Text>
        <Box marginTop={1}>
          <Table columns={columns} rows={staff} maxRows={Math.max(5, height - 6)} emptyText="No team members yet." />
        </Box>
      </Box>
    </Gate>
  );
}
