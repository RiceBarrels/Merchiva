import React from "react";
import { Box, Text } from "ink";
import { sectionForPage, type NavSection } from "../nav.ts";
import { theme } from "../theme.ts";

interface HeaderProps {
  page: string;
  width: number;
}

function titleFor(section: NavSection | undefined, page: string): string {
  if (!section) return page;
  const tab = section.tabs?.find((t) => t.page === page);
  return tab?.label ?? section.label;
}

// Mirrors the web's <PageHeader> + <PageTabs>: a title line, then a row of
// sub-page tabs with the active one highlighted.
export function Header({ page, width }: HeaderProps) {
  const section = sectionForPage(page);
  const title = titleFor(section, page);
  return (
    <Box flexDirection="column" width={width} paddingX={1}>
      <Box justifyContent="space-between">
        <Text color={theme.fg} bold>
          {title}
        </Text>
        <Text color={theme.dim}>{section?.label ?? ""}</Text>
      </Box>
      {section?.tabs && section.tabs.length > 0 ? (
        <Box marginTop={0}>
          {section.tabs.map((t, i) => {
            const active = t.page === page;
            return (
              <Text key={t.page}>
                {i > 0 ? <Text color={theme.border}>  </Text> : null}
                <Text color={active ? theme.accent : theme.dim} bold={active} underline={active}>
                  {t.label}
                </Text>
              </Text>
            );
          })}
        </Box>
      ) : null}
      <Text color={theme.border}>{"─".repeat(Math.max(0, width - 2))}</Text>
    </Box>
  );
}
