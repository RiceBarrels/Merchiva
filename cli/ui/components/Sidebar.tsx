import React from "react";
import { Box, Text } from "ink";
import { sectionForPage, type NavSection } from "../nav.ts";
import { theme } from "../theme.ts";

interface SidebarProps {
  nav: NavSection[];
  page: string;
  focused: boolean;
  width: number;
  height: number;
  orgName: string;
  connLabel: string;
  connColor: string;
  userEmail?: string;
}

export function Sidebar({ nav, page, focused, width, height, orgName, connLabel, connColor, userEmail }: SidebarProps) {
  const activeSection = sectionForPage(page);
  return (
    <Box flexDirection="column" width={width} height={height} borderStyle="round" borderColor={theme.border} paddingX={1}>
      <Box flexDirection="column" marginBottom={1}>
        <Text color={theme.brand} bold>
          ◆ Merchiva
        </Text>
        <Text color={theme.dim}>{orgName ? orgName.slice(0, width - 4) : "—"}</Text>
        <Text color={connColor}>● {connLabel}</Text>
      </Box>

      {nav.map((s) => {
        const active = activeSection?.page === s.page;
        const marker = active ? (focused ? "▶" : "›") : " ";
        const color = active ? theme.accent : theme.muted;
        return (
          <Text key={s.page} color={color} bold={active}>
            {marker} {s.icon} {s.label}
          </Text>
        );
      })}

      <Box flexGrow={1} />
      {userEmail ? <Text color={theme.dim}>{userEmail.slice(0, width - 4)}</Text> : null}
      <Text color={theme.dim}>↑↓ move · ↵ open</Text>
    </Box>
  );
}
