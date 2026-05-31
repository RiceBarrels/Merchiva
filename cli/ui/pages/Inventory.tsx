import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { Gate } from "../components/Gate.tsx";
import { Table, type Column } from "../components/Table.tsx";
import { Form, type Field } from "../components/Form.tsx";
import { useInventory, type InvItem } from "../data/hooks.ts";
import { useMutations } from "../data/mutations.ts";
import { usePerms } from "../data/permissions.tsx";
import { theme, money, stockColor } from "../theme.ts";

const STATUS_LABEL: Record<string, string> = {
  in_stock: "In stock",
  low_stock: "Low",
  out_of_stock: "Out",
};

const FIELDS: Field[] = [
  { key: "name", label: "Name", required: true },
  { key: "category", label: "Category", required: true, placeholder: "Dairy" },
  { key: "currentStock", label: "Stock", type: "number", required: true },
  { key: "minStock", label: "Min", type: "number" },
  { key: "maxStock", label: "Max", type: "number" },
  { key: "unit", label: "Unit", required: true, placeholder: "units" },
  { key: "costPerUnit", label: "Cost/unit", type: "number" },
  { key: "supplier", label: "Supplier" },
];

interface Props {
  height: number;
  focused: boolean;
  setCapturing: (b: boolean) => void;
}

export function Inventory({ height, focused, setCapturing }: Props) {
  const [items, ready] = useInventory();
  const mut = useMutations();
  const perms = usePerms();
  const canEdit = perms.can("inventory", "edit");

  const [sel, setSel] = useState(0);
  const [mode, setMode] = useState<"list" | "add" | "edit">("list");
  const [flash, setFlash] = useState("");

  useEffect(() => {
    if (sel > items.length - 1) setSel(Math.max(0, items.length - 1));
  }, [items.length, sel]);

  useEffect(() => {
    setCapturing(mode !== "list");
    return () => setCapturing(false);
  }, [mode, setCapturing]);

  const adjust = async (delta: number) => {
    const item = items[sel];
    if (!item) return;
    try {
      await mut.adjustStock(item, delta);
      setFlash(`${item.name} ${delta > 0 ? "+" : ""}${delta} ${item.unit}`);
    } catch (e) {
      setFlash(`✗ ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  useInput(
    (input, key) => {
      if (mode !== "list" || !focused) return;
      if (key.downArrow) return setSel((i) => Math.min(items.length - 1, i + 1));
      if (key.upArrow) return setSel((i) => Math.max(0, i - 1));
      if (!canEdit) return;
      if (input === "a") return setMode("add");
      if (input === "e" && items[sel]) return setMode("edit");
      if ((input === "+" || input === "=") && items[sel]) return void adjust(1);
      if ((input === "-" || input === "_") && items[sel]) return void adjust(-1);
      if (input === "r" && items[sel]) {
        // Restock to max (or +10 if no max set).
        const it = items[sel];
        const target = it.maxStock > 0 ? it.maxStock : it.currentStock + 10;
        return void adjust(target - it.currentStock);
      }
    },
    { isActive: focused && mode === "list" },
  );

  const columns: Column<InvItem>[] = [
    { header: "Item", width: 20, render: (r) => r.name },
    { header: "Category", width: 12, render: (r) => r.category },
    { header: "Stock", width: 7, align: "right", render: (r) => String(r.currentStock) },
    { header: "Unit", width: 6, render: (r) => r.unit },
    { header: "Cost", width: 8, align: "right", render: (r) => money(r.costPerUnit) },
    {
      header: "Status",
      width: 9,
      render: (r) => STATUS_LABEL[r.status] ?? r.status,
      color: (r) => stockColor(r.status),
    },
  ];

  if (mode === "add") {
    return (
      <Form
        title="Add inventory item"
        fields={FIELDS}
        onCancel={() => setMode("list")}
        onSubmit={async (v) => {
          await mut.addInventoryItem({
            name: v.name.trim(),
            category: v.category.trim(),
            currentStock: Number(v.currentStock || 0),
            minStock: Number(v.minStock || 0),
            maxStock: Number(v.maxStock || 0),
            unit: v.unit.trim() || "units",
            costPerUnit: Number(v.costPerUnit || 0),
            supplier: v.supplier.trim(),
          });
          setMode("list");
        }}
      />
    );
  }

  if (mode === "edit" && items[sel]) {
    const it = items[sel];
    const initials: Record<string, string> = {
      name: it.name,
      category: it.category,
      currentStock: String(it.currentStock),
      minStock: String(it.minStock),
      maxStock: String(it.maxStock),
      unit: it.unit,
      costPerUnit: String(it.costPerUnit),
      supplier: it.supplier,
    };
    return (
      <Form
        title={`Edit ${it.name}`}
        submitLabel="Update"
        fields={FIELDS.map((f) => ({ ...f, initial: initials[f.key] ?? "" }))}
        onCancel={() => setMode("list")}
        onSubmit={async (v) => {
          await mut.updateInventoryItem(it, {
            name: v.name.trim(),
            category: v.category.trim(),
            currentStock: Number(v.currentStock || 0),
            minStock: Number(v.minStock || 0),
            maxStock: Number(v.maxStock || 0),
            unit: v.unit.trim() || "units",
            costPerUnit: Number(v.costPerUnit || 0),
            supplier: v.supplier.trim(),
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
            {items.length} items · {items.filter((i) => i.status !== "in_stock").length} need restock
          </Text>
          {canEdit ? (
            <Text color={theme.dim}>
              <Text color={theme.accent}>a</Text> add <Text color={theme.accent}>e</Text> edit{" "}
              <Text color={theme.accent}>+/-</Text> stock <Text color={theme.accent}>r</Text> restock
            </Text>
          ) : (
            <Text color={theme.dim}>read-only</Text>
          )}
        </Box>
        <Box marginTop={1}>
          <Table
            columns={columns}
            rows={items}
            selectedIndex={focused ? sel : undefined}
            maxRows={Math.max(5, height - 7)}
            emptyText="No inventory yet. Press a to add an item."
          />
        </Box>
        {flash ? <Text color={theme.good}>{flash}</Text> : null}
      </Box>
    </Gate>
  );
}
