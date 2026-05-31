import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.ts";

// Sections whose web feature exists but whose TUI view isn't built yet. Keeps
// the same header/tabs frame so navigation feels complete; describes parity.
const NOTES: Record<string, string> = {
  pos: "Point-of-sale terminal: ring up sales, take payments. (web: /~/pos)",
  suppliers: "Supplier directory & purchase orders. (web: /~/suppliers)",
  waste: "Waste log: track spoilage & shrinkage. (web: /~/inventory/waste)",
  pricing: "Pricing rules & price changes. (web: /~/pricing)",
  reports: "Sales & finance reports, charts. (web: /~/reports)",
  finances: "Expenses, P&L, cash flow. (web: /~/finances)",
  schedule: "Shift schedule & rota. (web: /~/personnel/schedule)",
  roles: "Staff roles & task assignment. (web: /~/personnel/roles)",
  training: "Training days & objectives. (web: /~/personnel/training)",
  marketing: "Campaigns, coupons, loyalty. (web: /~/marketing)",
  website: "Website builder (Craft.js). (web: /~/builder)",
  design: "Brand & design system. (web: /~/design)",
  membership: "Plan & billing (Stripe). (web: /~/membership)",
  settings: "Org & account settings. (web: /~/settings)",
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
