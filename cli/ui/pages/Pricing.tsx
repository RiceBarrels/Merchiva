import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { Gate } from "../components/Gate.tsx";
import { Table, type Column } from "../components/Table.tsx";
import { Form, type Field } from "../components/Form.tsx";
import { useProducts, type Prod } from "../data/hooks.ts";
import { useMutations } from "../data/mutations.ts";
import { usePerms } from "../data/permissions.tsx";
import { theme, money } from "../theme.ts";

// Pricing (Products → Pricing tab): price-focused view of the catalog with a
// quick price/cost editor. Reuses the product data + updateProduct reducer.
export function Pricing({ height, focused, setCapturing }: { height: number; focused: boolean; setCapturing: (b: boolean) => void }) {
  const [products, ready] = useProducts();
  const mut = useMutations();
  const canEdit = usePerms().can("products", "edit");

  const [sel, setSel] = useState(0);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (sel > products.length - 1) setSel(Math.max(0, products.length - 1));
  }, [products.length, sel]);
  useEffect(() => {
    setCapturing(editing);
    return () => setCapturing(false);
  }, [editing, setCapturing]);

  useInput(
    (input, key) => {
      if (editing || !focused) return;
      if (key.downArrow) return setSel((i) => Math.min(products.length - 1, i + 1));
      if (key.upArrow) return setSel((i) => Math.max(0, i - 1));
      if (canEdit && input === "e" && products[sel]) setEditing(true);
    },
    { isActive: focused && !editing },
  );

  const markup = (p: Prod) => (p.cost > 0 ? `${Math.round((p.margin / p.cost) * 100)}%` : "—");

  const columns: Column<Prod>[] = [
    { header: "Product", width: 24, render: (r) => r.name },
    { header: "Cost", width: 9, align: "right", render: (r) => money(r.cost) },
    { header: "Price", width: 9, align: "right", render: (r) => money(r.price) },
    { header: "Margin", width: 9, align: "right", render: (r) => money(r.margin), color: (r) => (r.margin >= 0 ? theme.good : theme.bad) },
    { header: "Markup", width: 8, align: "right", render: markup },
  ];

  if (editing && products[sel]) {
    const p = products[sel];
    const fields: Field[] = [
      { key: "price", label: "Price", type: "number", required: true, initial: String(p.price) },
      { key: "cost", label: "Cost", type: "number", initial: String(p.cost) },
    ];
    return (
      <Form
        title={`Reprice ${p.name}`}
        submitLabel="Update"
        fields={fields}
        onCancel={() => setEditing(false)}
        onSubmit={async (v) => {
          await mut.updateProduct(p, {
            name: p.name,
            category: p.category,
            price: Number(v.price),
            cost: Number(v.cost || 0),
          });
          setEditing(false);
        }}
      />
    );
  }

  return (
    <Gate ready={ready}>
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Text color={theme.dim}>{products.length} products · price &amp; margin</Text>
          {canEdit ? (
            <Text color={theme.dim}>
              <Text color={theme.accent}>e</Text> reprice
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
            emptyText="No products yet."
          />
        </Box>
      </Box>
    </Gate>
  );
}
