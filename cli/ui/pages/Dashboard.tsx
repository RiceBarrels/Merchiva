import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { Gate } from "../components/Gate.tsx";
import { useInventory, useSales, useProducts, useStaff, type InvItem } from "../data/hooks.ts";
import { useMutations } from "../data/mutations.ts";
import { usePerms } from "../data/permissions.tsx";
import { theme, money } from "../theme.ts";

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.border} paddingX={1} width={24} marginRight={1}>
      <Text color={theme.dim}>{label.toUpperCase()}</Text>
      <Text color={color ?? theme.fg} bold>
        {value}
      </Text>
    </Box>
  );
}

// Suggested restock quantity for a flagged item: up to max, else a +10 nudge.
function restockQty(i: InvItem): number {
  return i.maxStock > 0 ? Math.max(0, i.maxStock - i.currentStock) : 10;
}

export function Dashboard({ focused }: { focused: boolean }) {
  const [inv, invReady] = useInventory();
  const [sales, salesReady] = useSales();
  const [products, prodReady] = useProducts();
  const [staff, staffReady] = useStaff();
  const mut = useMutations();
  const canEdit = usePerms().can("inventory", "edit");
  const ready = invReady && salesReady && prodReady && staffReady;

  const today = new Date().toISOString().slice(0, 10);
  const todaySales = sales.filter((s) => s.date === today);
  const todayRevenue = todaySales.reduce((a, s) => a + s.total, 0);
  const flagged = inv.filter((i) => i.status !== "in_stock");

  const [sel, setSel] = useState(0);
  const [flash, setFlash] = useState("");
  useEffect(() => {
    if (sel > flagged.length - 1) setSel(Math.max(0, flagged.length - 1));
  }, [flagged.length, sel]);

  const restock = async (item: InvItem) => {
    try {
      const qty = restockQty(item);
      await mut.adjustStock(item, qty);
      setFlash(`Restocked ${item.name} +${qty} ${item.unit}`);
    } catch (e) {
      setFlash(`✗ ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const approveAll = async () => {
    try {
      for (const item of flagged) await mut.adjustStock(item, restockQty(item));
      setFlash(`Approved all · restocked ${flagged.length} item${flagged.length === 1 ? "" : "s"}`);
    } catch (e) {
      setFlash(`✗ ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  useInput(
    (input, key) => {
      if (!focused || !canEdit) return;
      if (key.downArrow) return setSel((i) => Math.min(flagged.length - 1, i + 1));
      if (key.upArrow) return setSel((i) => Math.max(0, i - 1));
      if ((key.return || input === "r") && flagged[sel]) return void restock(flagged[sel]);
      if (input === "A" && flagged.length) return void approveAll();
    },
    { isActive: focused },
  );

  return (
    <Gate ready={ready}>
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Stat label="Revenue today" value={money(todayRevenue)} color={theme.good} />
          <Stat label="Sales today" value={String(todaySales.length)} />
          <Stat label="Low / out of stock" value={String(flagged.length)} color={flagged.length ? theme.warn : theme.good} />
        </Box>
        <Box marginBottom={1}>
          <Stat label="Inventory items" value={String(inv.length)} />
          <Stat label="Products" value={String(products.length)} />
          <Stat label="Team members" value={String(staff.length)} />
        </Box>

        <Box justifyContent="space-between">
          <Text color={theme.dim} bold>
            NEEDS ATTENTION{flagged.length ? ` · ${flagged.length}` : ""}
          </Text>
          {canEdit && flagged.length ? (
            <Text color={theme.dim}>
              <Text color={theme.accent}>↵/r</Text> restock <Text color={theme.accent}>A</Text> approve all
            </Text>
          ) : null}
        </Box>

        {flagged.length === 0 ? (
          <Text color={theme.good}>✓ All stock levels healthy</Text>
        ) : (
          flagged.slice(0, 8).map((i, idx) => {
            const selected = focused && canEdit && idx === sel;
            return (
              <Box key={i.id}>
                <Text color={selected ? theme.accent : theme.dim}>{selected ? "▸ " : "  "}</Text>
                <Text color={i.status === "out_of_stock" ? theme.bad : theme.warn}>● </Text>
                <Text color={selected ? theme.fg : theme.muted} bold={selected}>
                  {i.name}
                </Text>
                <Text color={theme.dim}>
                  {" "}
                  {i.currentStock}/{i.minStock} {i.unit}
                </Text>
                {canEdit ? <Text color={theme.good}> → +{restockQty(i)}</Text> : null}
              </Box>
            );
          })
        )}

        {flash ? (
          <Box marginTop={1}>
            <Text color={theme.good}>{flash}</Text>
          </Box>
        ) : null}
      </Box>
    </Gate>
  );
}
