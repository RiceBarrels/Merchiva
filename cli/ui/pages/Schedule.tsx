/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { useTable, useSpacetimeDB } from "spacetimedb/react";
import { tables } from "../../../lib/spacetimedb/generated/index.ts";
import { Gate } from "../components/Gate.tsx";
import { Table, type Column } from "../components/Table.tsx";
import { Form, type Field } from "../components/Form.tsx";
import { useOrg } from "../data/provider.tsx";
import { usePerms } from "../data/permissions.tsx";
import { theme } from "../theme.ts";

interface ShiftRow {
  id: string;
  staffName: string;
  staffRole: string;
  shiftType: string;
  date: string;
  startTime: string;
  endTime: string;
}

const FIELDS: Field[] = [
  { key: "staffName", label: "Staff", required: true },
  { key: "date", label: "Date", required: true, initial: new Date().toISOString().slice(0, 10) },
  { key: "shiftType", label: "Type", required: true, placeholder: "morning" },
  { key: "startTime", label: "Start", required: true, placeholder: "07:00" },
  { key: "endTime", label: "End", required: true, placeholder: "14:00" },
];

interface Props {
  height: number;
  focused: boolean;
  setCapturing: (b: boolean) => void;
}

export function Schedule({ height, focused, setCapturing }: Props) {
  const state = useSpacetimeDB() as any;
  const { orgId } = useOrg();
  const perms = usePerms();
  const canEdit = perms.can("staffing", "edit");

  function call(name: string, args: any) {
    const c = state?.getConnection?.();
    if (!c) throw new Error("Not connected");
    if (!orgId) throw new Error("No org");
    return c.reducers[name]({ organizationId: orgId, ...args });
  }

  const [rawShifts, ready] = useTable(tables.shift as any);
  const [rawStaff] = useTable(tables.staffMember as any);

  const shifts = useMemo<ShiftRow[]>(() => {
    if (!orgId) return [];
    return (rawShifts as any[])
      .filter((r) => r.organizationId === orgId)
      .map((r) => ({
        id: String(r.id),
        staffName: String(r.staffName ?? ""),
        staffRole: r.staffRole ?? "",
        shiftType: String(r.shiftType ?? ""),
        date: String(r.date ?? ""),
        startTime: String(r.startTime ?? ""),
        endTime: String(r.endTime ?? ""),
      }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  }, [rawShifts, orgId]);

  const staffNames = useMemo<string[]>(() => {
    if (!orgId) return [];
    return (rawStaff as any[])
      .filter((r) => r.organizationId === orgId)
      .map((r) => String(r.name ?? ""))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [rawStaff, orgId]);

  const today = new Date().toISOString().slice(0, 10);
  const todayCount = shifts.filter((s) => s.date === today).length;

  const [sel, setSel] = useState(0);
  const [mode, setMode] = useState<"list" | "add">("list");

  useEffect(() => {
    if (sel > shifts.length - 1) setSel(Math.max(0, shifts.length - 1));
  }, [shifts.length, sel]);

  // Form open/close drives the global input-capture flag so q/x/c don't fire
  // while typing.
  useEffect(() => {
    setCapturing(mode !== "list");
    return () => setCapturing(false);
  }, [mode, setCapturing]);

  useInput(
    (input, key) => {
      if (mode !== "list" || !focused) return;
      if (key.downArrow) return setSel((i) => Math.min(shifts.length - 1, i + 1));
      if (key.upArrow) return setSel((i) => Math.max(0, i - 1));
      if (!canEdit) return;
      if (input === "a") return setMode("add");
    },
    { isActive: focused && mode === "list" },
  );

  const columns: Column<ShiftRow>[] = [
    { header: "Date", width: 12, render: (r) => r.date },
    { header: "Staff", width: 18, render: (r) => r.staffName },
    { header: "Role", width: 12, render: (r) => r.staffRole ?? "" },
    { header: "Type", width: 10, render: (r) => r.shiftType },
    { header: "Time", width: 13, render: (r) => `${r.startTime}–${r.endTime}` },
  ];

  if (mode === "add") {
    return (
      <Form
        title="Add shift"
        fields={FIELDS}
        onCancel={() => setMode("list")}
        onSubmit={async (v) => {
          await call("addShift", {
            memberId: undefined,
            staffName: v.staffName.trim(),
            staffRole: undefined,
            staffRoles: "[]",
            date: v.date.trim(),
            shiftType: v.shiftType.trim(),
            startTime: v.startTime.trim(),
            endTime: v.endTime.trim(),
            predictedDemand: "",
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
            {shifts.length} shifts · {todayCount} today
          </Text>
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
            rows={shifts}
            selectedIndex={focused ? sel : undefined}
            maxRows={Math.max(5, height - 7)}
            emptyText="No shifts yet. Press a to add one."
          />
        </Box>
        {staffNames.length > 0 ? (
          <Text color={theme.dim}>Staff: {staffNames.join(", ")}</Text>
        ) : null}
      </Box>
    </Gate>
  );
}
