import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.ts";

// Sections whose web feature exists but whose TUI view isn't built yet. Keeps
// the same header/tabs frame so navigation feels complete; describes parity.
const NOTES: Record<string, string> = {
  pos: "Point-of-sale terminal: ring up sales, take payments. (web: /manager/pos)",
  suppliers: "Supplier directory & purchase orders. (web: /manager/suppliers)",
  waste: "Waste log: track spoilage & shrinkage. (web: /manager/inventory/waste)",
  pricing: "Pricing rules & price changes. (web: /manager/pricing)",
  reports: "Sales & finance reports, charts. (web: /manager/reports)",
  finances: "Expenses, P&L, cash flow. (web: /manager/finances)",
  schedule: "Shift schedule & rota. (web: /manager/personnel/schedule)",
  roles: "Staff roles & task assignment. (web: /manager/personnel/roles)",
  training: "Training days & objectives. (web: /manager/personnel/training)",
  marketing: "Campaigns, coupons, loyalty. (web: /manager/marketing)",
  website: "Website builder (Craft.js). (web: /manager/builder)",
  design: "Brand & design system. (web: /manager/design)",
  membership: "Plan & billing (Stripe). (web: /manager/membership)",
  settings: "Org & account settings. (web: /manager/settings)",
};

export function Placeholder({ page }: { page: string }) {
  return (
    <Box flexDirection="column">
      <Text color={theme.muted}>{NOTES[page] ?? `${page} — mirrors the web app.`}</Text>
      <Box marginTop={1}>
        <Text color={theme.dim}>This section is on the TUI roadmap. Data is live in the web app today.</Text>
      </Box>
      <Text color={theme.dim}>Press </Text>
      <Text color={theme.accent}>c</Text>
      <Text color={theme.dim}> to ask Mr. Merchiva about it from here.</Text>
    </Box>
  );
}
