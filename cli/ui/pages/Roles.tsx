// Personnel → Roles tab (page key "roles"). Lists staff roles for the active
// org and lets managers add new ones via the addStaffRole reducer. Mirrors the
// list + Table + Form + permission-gating pattern from Products/Inventory.
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

interface Role {
  id: string;
  name: string;
  color: string;
  icon: string;
  description: string;
  members: number;
}

const FIELDS: Field[] = [
  { key: "name", label: "Name", required: true },
  { key: "description", label: "Description" },
  { key: "icon", label: "Icon", placeholder: "•" },
  { key: "color", label: "Color", placeholder: "stone" },
];

interface Props {
  height: number;
  focused: boolean;
  setCapturing: (b: boolean) => void;
}

export function Roles({ height, focused, setCapturing }: Props) {
  const { orgId } = useOrg();
  const state = useSpacetimeDB() as any;
  const perms = usePerms();
  const canEdit = perms.can("staffing", "edit");

  const [rawRoles, ready] = useTable(tables.staffRole as any);
  const [rawStaff] = useTable(tables.staffMember as any);

  function call(name: string, args: any) {
    const c = state?.getConnection?.();
    if (!c) throw new Error("Not connected");
    if (!orgId) throw new Error("No org");
    return c.reducers[name]({ organizationId: orgId, ...args });
  }

  const roles = useMemo<Role[]>(() => {
    if (!orgId) return [];
    const counts = new Map<string, number>();
    for (const s of rawStaff as any[]) {
      if (s.organizationId !== orgId) continue;
      const key = String(s.role ?? "");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return (rawRoles as any[])
      .filter((r) => r.organizationId === orgId)
      .map((r) => ({
        id: String(r.id),
        name: String(r.name ?? ""),
        color: String(r.color ?? ""),
        icon: String(r.icon ?? ""),
        description: String(r.description ?? ""),
        members: counts.get(String(r.name ?? "")) ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rawRoles, rawStaff, orgId]);

  const [sel, setSel] = useState(0);
  const [mode, setMode] = useState<"list" | "add">("list");

  useEffect(() => {
    if (sel > roles.length - 1) setSel(Math.max(0, roles.length - 1));
  }, [roles.length, sel]);

  // Form open/close drives the global input-capture flag so q/x/c don't fire
  // while typing.
  useEffect(() => {
    setCapturing(mode !== "list");
    return () => setCapturing(false);
  }, [mode, setCapturing]);

  useInput(
    (input, key) => {
      if (mode !== "list" || !focused) return;
      if (key.downArrow) return setSel((i) => Math.min(roles.length - 1, i + 1));
      if (key.upArrow) return setSel((i) => Math.max(0, i - 1));
      if (!canEdit) return;
      if (input === "a") return setMode("add");
    },
    { isActive: focused && mode === "list" },
  );

  const columns: Column<Role>[] = [
    { header: "Role", width: 18, render: (r) => r.name },
    { header: "Icon", width: 6, render: (r) => r.icon },
    { header: "Color", width: 10, render: (r) => r.color },
    { header: "Description", width: 26, render: (r) => r.description },
    { header: "Members", width: 8, align: "right", render: (r) => String(r.members) },
  ];

  if (mode === "add") {
    return (
      <Form
        title="Add role"
        fields={FIELDS}
        onCancel={() => setMode("list")}
        onSubmit={async (v) => {
          await call("addStaffRole", {
            name: v.name.trim(),
            color: v.color.trim() || "stone",
            icon: v.icon.trim() || "•",
            description: v.description.trim() || "",
            permissions: "{}",
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
          <Text color={theme.dim}>{roles.length} roles · sorted by name</Text>
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
            rows={roles}
            selectedIndex={focused ? sel : undefined}
            maxRows={Math.max(5, height - 6)}
            emptyText="No roles yet. Press a to add one."
          />
        </Box>
      </Box>
    </Gate>
  );
}
