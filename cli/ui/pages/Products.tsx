import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { Gate } from "../components/Gate.tsx";
import { Table, type Column } from "../components/Table.tsx";
import { Form, type Field } from "../components/Form.tsx";
import { useProducts, type Prod } from "../data/hooks.ts";
import { useMutations } from "../data/mutations.ts";
import { usePerms } from "../data/permissions.tsx";
import { theme, money } from "../theme.ts";

const FIELDS: Field[] = [
  { key: "name", label: "Name", required: true },
  { key: "category", label: "Category", required: true, placeholder: "Drinks" },
  { key: "price", label: "Price", type: "number", required: true },
  { key: "cost", label: "Cost", type: "number" },
];

interface Props {
  height: number;
  focused: boolean;
  setCapturing: (b: boolean) => void;
}

export function Products({ height, focused, setCapturing }: Props) {
  const [products, ready] = useProducts();
  const mut = useMutations();
  const perms = usePerms();
  const canEdit = perms.can("products", "edit");

  const [sel, setSel] = useState(0);
  const [mode, setMode] = useState<"list" | "add" | "edit">("list");

  useEffect(() => {
    if (sel > products.length - 1) setSel(Math.max(0, products.length - 1));
  }, [products.length, sel]);

  // Form open/close drives the global input-capture flag so q/x/c don't fire
  // while typing.
  useEffect(() => {
    setCapturing(mode !== "list");
    return () => setCapturing(false);
  }, [mode, setCapturing]);

  useInput(
    (input, key) => {
      if (mode !== "list" || !focused) return;
      if (key.downArrow) return setSel((i) => Math.min(products.length - 1, i + 1));
      if (key.upArrow) return setSel((i) => Math.max(0, i - 1));
      if (!canEdit) return;
      if (input === "a") return setMode("add");
      if (input === "e" && products[sel]) return setMode("edit");
    },
    { isActive: focused && mode === "list" },
  );

  const columns: Column<Prod>[] = [
    { header: "Product", width: 22, render: (r) => r.name },
    { header: "Category", width: 12, render: (r) => r.category },
    { header: "Price", width: 9, align: "right", render: (r) => money(r.price) },
    { header: "Margin", width: 9, align: "right", render: (r) => money(r.margin), color: (r) => (r.margin >= 0 ? theme.good : theme.bad) },
    { header: "Sold/mo", width: 8, align: "right", render: (r) => String(r.soldThisMonth) },
  ];

  if (mode === "add") {
    return (
      <Form
        title="Add product"
        fields={FIELDS}
        onCancel={() => setMode("list")}
        onSubmit={async (v) => {
          await mut.addProduct({
            name: v.name.trim(),
            category: v.category.trim(),
            price: Number(v.price),
            cost: Number(v.cost || 0),
          });
          setMode("list");
        }}
      />
    );
  }

  if (mode === "edit" && products[sel]) {
    const p = products[sel];
    return (
      <Form
        title={`Edit ${p.name}`}
        submitLabel="Update"
        fields={FIELDS.map((f) => ({
          ...f,
          initial:
            f.key === "name"
              ? p.name
              : f.key === "category"
                ? p.category
                : f.key === "price"
                  ? String(p.price)
                  : String(p.cost),
        }))}
        onCancel={() => setMode("list")}
        onSubmit={async (v) => {
          await mut.updateProduct(p, {
            name: v.name.trim(),
            category: v.category.trim(),
            price: Number(v.price),
            cost: Number(v.cost || 0),
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
          <Text color={theme.dim}>{products.length} products · sorted by units sold</Text>
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
            rows={products}
            selectedIndex={focused ? sel : undefined}
            maxRows={Math.max(5, height - 6)}
            emptyText="No products yet. Press a to add one."
          />
        </Box>
      </Box>
    </Gate>
  );
}
