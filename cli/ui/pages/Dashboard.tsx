import React from "react";
import { Box, Text } from "ink";
import { Gate } from "../components/Gate.tsx";
import { useInventory, useSales, useProducts, useStaff } from "../data/hooks.ts";
import { theme, money } from "../theme.ts";

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

export function Dashboard() {
  const [inv, invReady] = useInventory();
  const [sales, salesReady] = useSales();
  const [products, prodReady] = useProducts();
  const [staff, staffReady] = useStaff();
  const ready = invReady && salesReady && prodReady && staffReady;

  const today = new Date().toISOString().slice(0, 10);
  const todaySales = sales.filter((s) => s.date === today);
  const todayRevenue = todaySales.reduce((a, s) => a + s.total, 0);
  const lowStock = inv.filter((i) => i.status !== "in_stock").length;

  return (
    <Gate ready={ready}>
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Stat label="Revenue today" value={money(todayRevenue)} color={theme.good} />
          <Stat label="Sales today" value={String(todaySales.length)} />
          <Stat label="Low / out of stock" value={String(lowStock)} color={lowStock ? theme.warn : theme.good} />
        </Box>
        <Box marginBottom={1}>
          <Stat label="Inventory items" value={String(inv.length)} />
          <Stat label="Products" value={String(products.length)} />
          <Stat label="Team members" value={String(staff.length)} />
        </Box>

        <Text color={theme.dim} bold>
          NEEDS ATTENTION
        </Text>
        {lowStock === 0 ? (
          <Text color={theme.good}>✓ All stock levels healthy</Text>
        ) : (
          inv
            .filter((i) => i.status !== "in_stock")
            .slice(0, 6)
            .map((i) => (
              <Text key={i.id} color={i.status === "out_of_stock" ? theme.bad : theme.warn}>
                ● {i.name} — {i.currentStock} {i.unit} (min {i.minStock})
              </Text>
            ))
        )}
      </Box>
    </Gate>
  );
}
