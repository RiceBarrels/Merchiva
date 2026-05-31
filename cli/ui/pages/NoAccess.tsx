import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.ts";

// Shown when the signed-in account lacks `view` permission for a section —
// the TUI equivalent of the web's <PermissionGuard> redirect.
export function NoAccess({ section, role }: { section: string; role: string }) {
  return (
    <Box flexDirection="column">
      <Text color={theme.warn} bold>
        ⚠ No access to {section}
      </Text>
      <Text color={theme.dim}>Your role ({role}) doesn&apos;t have permission to view this section.</Text>
      <Box marginTop={1}>
        <Text color={theme.dim}>Ask an owner/manager to grant access, or press </Text>
        <Text color={theme.accent}>↑↓</Text>
        <Text color={theme.dim}> to pick another section.</Text>
      </Box>
    </Box>
  );
}
