/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { Box, Text } from "ink";
import { useTable } from "spacetimedb/react";
import { tables } from "../../../lib/spacetimedb/generated/index.ts";
import { Gate } from "../components/Gate.tsx";
import { useOrg } from "../data/provider.tsx";
import { theme } from "../theme.ts";

function tsToDate(v: unknown): string {
  if (v == null) return "—";
  const o = v as { toDate?: () => Date; microsSinceUnixEpoch?: bigint | number };
  try {
    if (typeof o.toDate === "function") return o.toDate().toISOString().slice(0, 10);
    if (typeof o.microsSinceUnixEpoch === "bigint") return new Date(Number(o.microsSinceUnixEpoch / 1000n)).toISOString().slice(0, 10);
  } catch {
    /* ignore */
  }
  return "—";
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Box>
      <Box width={18}>
        <Text color={theme.dim}>{label}</Text>
      </Box>
      <Text color={color ?? theme.fg}>{value}</Text>
    </Box>
  );
}

// Membership (billing) — read-only view of the org's Stripe subscription cache
// stored on the organization row. Stripe is canonical; this reflects the cache.
export function Membership() {
  const { orgId, orgName } = useOrg();
  const [orgs, ready] = useTable(tables.organization as any);
  const org = (orgs as any[]).find((o) => String(o.id) === orgId);

  const status = org?.subscriptionStatus ?? null;
  const isPro = status === "active" || status === "trialing";

  return (
    <Gate ready={ready}>
      <Box flexDirection="column">
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={theme.border}
          paddingX={2}
          paddingY={1}
          width={52}
        >
          <Text color={theme.brand} bold>
            {isPro ? "♔ Merchiva Pro" : "Free plan"}
          </Text>
          <Box marginTop={1} flexDirection="column">
            <Row label="Organization" value={orgName || "—"} />
            <Row
              label="Status"
              value={status ?? "no subscription"}
              color={isPro ? theme.good : theme.muted}
            />
            <Row label="Billing" value={org?.subscriptionInterval ?? "—"} />
            <Row label="Renews / ends" value={tsToDate(org?.currentPeriodEnd)} />
            <Row label="Stripe customer" value={org?.stripeCustomerId ? "linked" : "—"} />
          </Box>
        </Box>
        <Box marginTop={1}>
          <Text color={theme.dim}>Manage billing in the web app · Stripe is the source of truth.</Text>
        </Box>
      </Box>
    </Gate>
  );
}
