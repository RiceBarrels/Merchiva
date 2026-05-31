// Suppliers page (Inventory → Suppliers tab). Lists suppliers for the active
// org and supports add/edit, mirroring the Products/Inventory page pattern.
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { useSpacetimeDB, useTable } from "spacetimedb/react";
import { tables } from "../../../lib/spacetimedb/generated/index.ts";
import { useOrg } from "../data/provider.tsx";
import { usePerms } from "../data/permissions.tsx";
import { Gate } from "../components/Gate.tsx";
import { Table, type Column } from "../components/Table.tsx";
import { Form, type Field } from "../components/Form.tsx";
import { theme } from "../theme.ts";

interface Supplier {
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  paymentTerms: string;
  notes: string;
  rating: number;
}

const FIELDS: Field[] = [
  { key: "name", label: "Name", required: true },
  { key: "contactName", label: "Contact" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "paymentTerms", label: "Terms", placeholder: "Net 30" },
];

export function Suppliers({
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
  function call(name: string, args: any) {
    const c = state?.getConnection?.();
    if (!c) throw new Error("Not connected");
    if (!orgId) throw new Error("No org");
    return c.reducers[name]({ organizationId: orgId, ...args });
  }

  const [rows, ready] = useTable(tables.supplier as any);
  const perms = usePerms();
  const canEdit = perms.can("inventory", "edit");

  const suppliers = useMemo<Supplier[]>(() => {
    if (!orgId) return [];
    return (rows as any[])
      .filter((r) => r.organizationId === orgId)
      .map((r) => ({
        id: String(r.id),
        name: r.name,
        contactName: r.contactName ?? "",
        email: r.email ?? "",
        phone: r.phone ?? "",
        address: r.address ?? "",
        paymentTerms: r.paymentTerms ?? "",
        notes: r.notes ?? "",
        rating: Number(r.rating ?? 0),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, orgId]);

  const [sel, setSel] = useState(0);
  const [mode, setMode] = useState<"list" | "add" | "edit">("list");

  useEffect(() => {
    if (sel > suppliers.length - 1) setSel(Math.max(0, suppliers.length - 1));
  }, [suppliers.length, sel]);

  useEffect(() => {
    setCapturing(mode !== "list");
    return () => setCapturing(false);
  }, [mode, setCapturing]);

  useInput(
    (input, key) => {
      if (mode !== "list" || !focused) return;
      if (key.downArrow) return setSel((i) => Math.min(suppliers.length - 1, i + 1));
      if (key.upArrow) return setSel((i) => Math.max(0, i - 1));
      if (!canEdit) return;
      if (input === "a") return setMode("add");
      if (input === "e" && suppliers[sel]) return setMode("edit");
    },
    { isActive: focused && mode === "list" },
  );

  const columns: Column<Supplier>[] = [
    { header: "Name", width: 22, render: (r) => r.name },
    { header: "Contact", width: 16, render: (r) => r.contactName ?? "" },
    { header: "Phone", width: 14, render: (r) => r.phone ?? "" },
    { header: "Terms", width: 12, render: (r) => r.paymentTerms ?? "" },
    { header: "Rating", width: 7, align: "right", render: (r) => r.rating.toFixed(1) },
  ];

  if (mode === "add") {
    return (
      <Form
        title="Add supplier"
        fields={FIELDS}
        onCancel={() => setMode("list")}
        onSubmit={async (v) => {
          await call("addSupplier", {
            name: v.name.trim(),
            contactName: v.contactName.trim() || undefined,
            email: v.email.trim() || undefined,
            phone: v.phone.trim() || undefined,
            address: undefined,
            paymentTerms: v.paymentTerms.trim() || undefined,
            notes: undefined,
          });
          setMode("list");
        }}
      />
    );
  }

  if (mode === "edit" && suppliers[sel]) {
    const s = suppliers[sel];
    const initials: Record<string, string> = {
      name: s.name,
      contactName: s.contactName,
      email: s.email,
      phone: s.phone,
      paymentTerms: s.paymentTerms,
    };
    return (
      <Form
        title={`Edit ${s.name}`}
        submitLabel="Update"
        fields={FIELDS.map((f) => ({ ...f, initial: initials[f.key] ?? "" }))}
        onCancel={() => setMode("list")}
        onSubmit={async (v) => {
          await call("updateSupplier", {
            supplierId: s.id,
            name: v.name.trim(),
            contactName: v.contactName.trim() || undefined,
            email: v.email.trim() || undefined,
            phone: v.phone.trim() || undefined,
            address: undefined,
            paymentTerms: v.paymentTerms.trim() || undefined,
            notes: undefined,
            rating: s.rating,
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
          <Text color={theme.dim}>{suppliers.length} suppliers · sorted by name</Text>
          {canEdit ? (
            <Text color={theme.dim}>
              <Text color={theme.accent}>a</Text> add{" "}
              <Text color={theme.accent}>e</Text> edit
            </Text>
          ) : (
            <Text color={theme.dim}>read-only</Text>
          )}
        </Box>
        <Box marginTop={1}>
          <Table
            columns={columns}
            rows={suppliers}
            selectedIndex={focused ? sel : undefined}
            maxRows={Math.max(5, height - 6)}
            emptyText="No suppliers yet. Press a to add one."
          />
        </Box>
      </Box>
    </Gate>
  );
}
