import React from "react";
import { Box, Text } from "ink";
import { useOrg } from "../data/provider.tsx";
import { usePerms } from "../data/permissions.tsx";
import { useConnState } from "../data/provider.tsx";
import { loadConfig } from "../../lib/config.ts";
import { theme } from "../theme.ts";

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Box>
      <Box width={16}>
        <Text color={theme.dim}>{label}</Text>
      </Box>
      <Text color={color ?? theme.fg}>{value}</Text>
    </Box>
  );
}

// Settings — read-only account/org/connection overview for the TUI. Mutating
// org settings stays in the web app for now.
export function Settings() {
  const { orgName, orgId, orgs } = useOrg();
  const perms = usePerms();
  const conn = useConnState();
  const cfg = loadConfig();

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" borderStyle="round" borderColor={theme.border} paddingX={2} paddingY={1} width={56}>
        <Text color={theme.dim} bold>
          ACCOUNT
        </Text>
        <Row label="Signed in" value={cfg.userEmail ?? (perms.serviceMode ? "service token" : "—")} />
        <Row label="Role" value={perms.role} color={perms.isOwner ? theme.good : theme.fg} />
        <Box marginTop={1}>
          <Text color={theme.dim} bold>
            ORGANIZATION
          </Text>
        </Box>
        <Row label="Active org" value={orgName || "—"} />
        <Row label="Org id" value={orgId ? orgId.slice(0, 8) + "…" : "—"} />
        <Row label="Your orgs" value={String(orgs.length)} />
        <Box marginTop={1}>
          <Text color={theme.dim} bold>
            CONNECTION
          </Text>
        </Box>
        <Row
          label="SpacetimeDB"
          value={conn.status}
          color={conn.status === "connected" ? theme.good : conn.status === "error" ? theme.bad : theme.warn}
        />
        <Row label="API base" value={cfg.baseUrl} />
        <Row label="Language" value={cfg.lang} />
      </Box>
      <Box marginTop={1}>
        <Text color={theme.dim}>Press </Text>
        <Text color={theme.accent}>x</Text>
        <Text color={theme.dim}> to sign out · org settings live in the web app.</Text>
      </Box>
    </Box>
  );
}
