import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { useSpacetimeDB, useTable } from "spacetimedb/react";
import { tables } from "../../../lib/spacetimedb/generated/index.ts";
import { Gate } from "../components/Gate.tsx";
import { Table, type Column } from "../components/Table.tsx";
import { Form, type Field } from "../components/Form.tsx";
import { useOrg } from "../data/provider.tsx";
import { usePerms } from "../data/permissions.tsx";
import { theme, money } from "../theme.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface WasteRow {
  id: string;
  itemName: string;
  quantity: number;
  unit: string;
  reason: string;
  costPerUnit: number;
  totalCost: number;
  date: string;
  notes: string;
}

const FIELDS: Field[] = [
  { key: "itemName", label: "Item", required: true },
  { key: "quantity", label: "Quantity", type: "number", required: true },
  { key: "unit", label: "Unit", required: true, placeholder: "units" },
  { key: "reason", label: "Reason", required: true, placeholder: "spoilage" },
  { key: "costPerUnit", label: "Cost/unit", type: "number" },
  { key: "date", label: "Date", required: true, initial: new Date().toISOString().slice(0, 10) },
];

export function Waste({
  height,
  focused,
  setCapturing,
}: {
  height: number;
  focused: boolean;
  setCapturing: (b: boolean) => void;
}) {
  const state = useSpacetimeDB() as any;
  const { orgId } = useOrg();
  const canEdit = usePerms().can("inventory", "edit");

  function call(name: string, args: any) {
    const c = state?.getConnection?.();
    if (!c) throw new Error("Not connected");
    if (!orgId) throw new Error("No org");
    return c.reducers[name]({ organizationId: orgId, ...args });
  }

  const [rawRows, ready] = useTable(tables.wasteLog as any);
  const rows = useMemo<WasteRow[]>(() => {
    if (!orgId) return [];
    return (rawRows as any[])
      .filter((r) => r.organizationId === orgId)
      .map((r) => {
        const quantity = Number(r.quantity ?? 0);
        const costPerUnit = Number(r.costPerUnit ?? 0);
        const totalCost = Number(r.totalCost ?? 0) || quantity * costPerUnit;
        return {
          id: String(r.id),
          itemName: String(r.itemName ?? ""),
          quantity,
          unit: String(r.unit ?? ""),
          reason: String(r.reason ?? ""),
          costPerUnit,
          totalCost,
          date: String(r.date ?? ""),
          notes: r.notes ?? "",
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [rawRows, orgId]);

  const totalWaste = useMemo(() => rows.reduce((sum, r) => sum + r.totalCost, 0), [rows]);

  const [sel, setSel] = useState(0);
  const [mode, setMode] = useState<"list" | "add">("list");

  useEffect(() => {
    if (sel > rows.length - 1) setSel(Math.max(0, rows.length - 1));
  }, [rows.length, sel]);

  useEffect(() => {
    setCapturing(mode !== "list");
    return () => setCapturing(false);
  }, [mode, setCapturing]);

  useInput(
    (input, key) => {
      if (mode !== "list" || !focused) return;
      if (key.downArrow) return setSel((i) => Math.min(rows.length - 1, i + 1));
      if (key.upArrow) return setSel((i) => Math.max(0, i - 1));
      if (!canEdit) return;
      if (input === "a") return setMode("add");
    },
    { isActive: focused && mode === "list" },
  );

  const columns: Column<WasteRow>[] = [
    { header: "Date", width: 11, render: (r) => r.date },
    { header: "Item", width: 20, render: (r) => r.itemName },
    { header: "Qty", width: 12, render: (r) => `${r.quantity} ${r.unit}` },
    { header: "Reason", width: 14, render: (r) => r.reason },
    { header: "Cost", width: 9, align: "right", render: (r) => money(r.totalCost), color: () => theme.bad },
  ];

  if (mode === "add") {
    return (
      <Form
        title="Log waste"
        fields={FIELDS}
        onCancel={() => setMode("list")}
        onSubmit={async (v) => {
          await call("addWasteLog", {
            itemId: undefined,
            itemName: v.itemName.trim(),
            quantity: Number(v.quantity),
            unit: v.unit.trim() || "units",
            reason: v.reason.trim(),
            costPerUnit: Number(v.costPerUnit || 0),
            date: v.date.trim(),
            notes: undefined,
          });
          setMode("list");
        }}
      />
    );
  }

  return (
    <Gate ready={ready}>
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Text color={theme.dim}>
            {rows.length} entries · total waste{" "}
            <Text color={theme.bad}>{money(totalWaste)}</Text>
          </Text>
          {canEdit ? (
            <Text color={theme.dim}>
              <Text color={theme.accent}>a</Text> log waste
            </Text>
          ) : (
            <Text color={theme.dim}>read-only</Text>
          )}
        </Box>
        <Box marginTop={1}>
          <Table
            columns={columns}
            rows={rows}
            selectedIndex={focused ? sel : undefined}
            maxRows={Math.max(5, height - 6)}
            emptyText="No waste logged yet. Press a to log waste."
          />
        </Box>
      </Box>
    </Gate>
  );
}
