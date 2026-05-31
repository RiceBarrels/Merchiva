import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.ts";
import { pad } from "../theme.ts";

export interface Column<T> {
  header: string;
  width: number;
  align?: "left" | "right";
  render: (row: T) => string;
  color?: (row: T) => string | undefined;
}

interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  maxRows?: number;
  emptyText?: string;
  /** Highlighted row index (for keyboard selection). */
  selectedIndex?: number;
}

// Compact, data-dense table mirroring the web's bordered tables. Columns are
// fixed-width and padded so values line up like Geist Mono data cells.
export function Table<T>({ columns, rows, maxRows = 100, emptyText = "No data.", selectedIndex }: TableProps<T>) {
  // Keep the selected row within the visible window.
  const hasSel = typeof selectedIndex === "number" && selectedIndex >= 0;
  let start = 0;
  if (hasSel && rows.length > maxRows) {
    start = Math.min(Math.max(0, (selectedIndex as number) - Math.floor(maxRows / 2)), rows.length - maxRows);
  }
  const visible = rows.slice(start, start + maxRows);
  return (
    <Box flexDirection="column">
      <Box>
        <Text>{"  "}</Text>
        {columns.map((c, i) => (
          <Text key={i} color={theme.dim} bold>
            {pad(c.header.toUpperCase(), c.width, c.align)}
            {i < columns.length - 1 ? " " : ""}
          </Text>
        ))}
      </Box>
      {visible.length === 0 ? (
        <Text color={theme.dim}>{emptyText}</Text>
      ) : (
        visible.map((row, ri) => {
          const absolute = start + ri;
          const selected = hasSel && absolute === selectedIndex;
          return (
            <Box key={absolute}>
              <Text color={selected ? theme.accent : theme.dim}>{selected ? "▸ " : "  "}</Text>
              {columns.map((c, i) => (
                <Text key={i} color={c.color?.(row) ?? (selected ? theme.fg : theme.muted)} bold={selected}>
                  {pad(c.render(row), c.width, c.align)}
                  {i < columns.length - 1 ? " " : ""}
                </Text>
              ))}
            </Box>
          );
        })
      )}
      {rows.length > visible.length ? (
        <Text color={theme.dim}>… +{rows.length - visible.length} more</Text>
      ) : null}
    </Box>
  );
}
