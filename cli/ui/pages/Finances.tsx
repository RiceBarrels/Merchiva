// Finances page (Sales → Finances tab). Lists expenses for the active org and
// shows Revenue / Expenses / Net stat boxes (revenue from useSales). Adds
// expenses via the same addExpense reducer the web uses.
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { useSpacetimeDB, useTable } from "spacetimedb/react";
import { Gate } from "../components/Gate.tsx";
import { Table, type Column } from "../components/Table.tsx";
import { Form, type Field } from "../components/Form.tsx";
import { tables } from "../../../lib/spacetimedb/generated/index.ts";
import { useOrg } from "../data/provider.tsx";
import { useSales } from "../data/hooks.ts";
import { usePerms } from "../data/permissions.tsx";
import { theme, money } from "../theme.ts";

interface ExpenseRow {
  id: string;
  category: string;
  description: string;
  amount: number;
  date: string;
}

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

const FIELDS: Field[] = [
  { key: "category", label: "Category", required: true, placeholder: "Rent" },
  { key: "description", label: "Description", required: true },
  { key: "amount", label: "Amount", type: "number", required: true },
  { key: "date", label: "Date", required: true, initial: new Date().toISOString().slice(0, 10) },
];

interface Props {
  height: number;
  focused: boolean;
  setCapturing: (b: boolean) => void;
}

export function Finances({ height, focused, setCapturing }: Props) {
  const state = useSpacetimeDB() as any;
  const { orgId } = useOrg();
  function call(name: string, args: any) {
    const c = state?.getConnection?.();
    if (!c) throw new Error("Not connected");
    if (!orgId) throw new Error("No org");
    return c.reducers[name]({ organizationId: orgId, ...args });
  }

  const [rows, expReady] = useTable(tables.expense as any);
  const [sales, salesReady] = useSales();
  const ready = expReady && salesReady;
  const canEdit = usePerms().can("sales", "edit");

  const expenses = useMemo<ExpenseRow[]>(() => {
    if (!orgId) return [];
    return (rows as any[])
      .filter((r) => r.organizationId === orgId)
      .map((r) => ({
        id: String(r.id),
        category: String(r.category ?? ""),
        description: String(r.description ?? ""),
        amount: Number(r.amount ?? 0),
        date: String(r.date ?? ""),
      }))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [rows, orgId]);

  const totalExpenses = useMemo(() => expenses.reduce((a, e) => a + e.amount, 0), [expenses]);
  const totalRevenue = useMemo(() => sales.reduce((a, s) => a + s.total, 0), [sales]);
  const net = totalRevenue - totalExpenses;

  const [sel, setSel] = useState(0);
  const [mode, setMode] = useState<"list" | "add">("list");

  useEffect(() => {
    if (sel > expenses.length - 1) setSel(Math.max(0, expenses.length - 1));
  }, [expenses.length, sel]);

  useEffect(() => {
    setCapturing(mode !== "list");
    return () => setCapturing(false);
  }, [mode, setCapturing]);

  useInput(
    (input, key) => {
      if (mode !== "list" || !focused) return;
      if (key.downArrow) return setSel((i) => Math.min(expenses.length - 1, i + 1));
      if (key.upArrow) return setSel((i) => Math.max(0, i - 1));
      if (!canEdit) return;
      if (input === "a") return setMode("add");
    },
    { isActive: focused && mode === "list" },
  );

  const columns: Column<ExpenseRow>[] = [
    { header: "Date", width: 12, render: (r) => r.date },
    { header: "Category", width: 14, render: (r) => r.category },
    { header: "Description", width: 26, render: (r) => r.description },
    { header: "Amount", width: 11, align: "right", render: (r) => money(r.amount), color: () => theme.bad },
  ];

  if (mode === "add") {
    return (
      <Form
        title="Add expense"
        fields={FIELDS}
        onSubmit={async (v) => {
          await call("addExpense", {
            category: v.category.trim(),
            description: v.description.trim(),
            amount: Number(v.amount),
            date: v.date.trim() || new Date().toISOString().slice(0, 10),
            recurring: false,
            recurringPeriod: undefined,
            receiptUrl: undefined,
            notes: undefined,
          });
          setMode("list");
        }}
        onCancel={() => setMode("list")}
      />
    );
  }

  return (
    <Gate ready={ready}>
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Stat label="Revenue" value={money(totalRevenue)} color={theme.good} />
          <Stat label="Expenses" value={money(totalExpenses)} color={theme.bad} />
          <Stat label="Net" value={money(net)} color={net >= 0 ? theme.good : theme.bad} />
        </Box>
        <Box justifyContent="space-between">
          <Text color={theme.dim}>{expenses.length} expenses · newest first</Text>
          {canEdit ? (
            <Text color={theme.dim}>
              <Text color={theme.accent}>a</Text> add
            </Text>
          ) : (
            <Text color={theme.dim}>read-only</Text>
          )}
        </Box>
        <Box marginTop={1}>
          <Table
            columns={columns}
            rows={expenses}
            selectedIndex={focused ? sel : undefined}
            maxRows={Math.max(5, height - 10)}
            emptyText="No expenses yet. Press a to add one."
          />
        </Box>
      </Box>
    </Gate>
  );
}
