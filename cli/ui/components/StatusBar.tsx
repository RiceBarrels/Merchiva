import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.ts";

interface StatusBarProps {
  width: number;
  hints: [string, string][];
  right?: string;
}

// Bottom hint bar, like a terminal app's keybinding strip.
export function StatusBar({ width, hints, right }: StatusBarProps) {
  return (
    <Box width={width} paddingX={1} justifyContent="space-between">
      <Box>
        {hints.map(([key, label], i) => (
          <Text key={key}>
            {i > 0 ? <Text color={theme.border}>  ·  </Text> : null}
            <Text color={theme.accent} bold>
              {key}
            </Text>
            <Text color={theme.dim}> {label}</Text>
          </Text>
        ))}
      </Box>
      {right ? <Text color={theme.dim}>{right}</Text> : null}
    </Box>
  );
}
