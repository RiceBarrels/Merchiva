"use client";

import { useNode, type UserComponent } from "@craftjs/core";

interface CraftColumnsProps {
  columns: number;
  gap: string;
  columnContent: string[];
}

export const CraftColumns: UserComponent<CraftColumnsProps> = ({
  columns,
  gap,
  columnContent,
}) => {
  const {
    connectors: { connect, drag },
  } = useNode();

  const count = Math.min(6, Math.max(1, columns));
  const cols = columnContent || Array(count).fill("");

  return (
    <div
      ref={(r: HTMLElement | null) => {
        if (r) connect(drag(r));
      }}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${count}, 1fr)`,
        gap,
      }}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ minHeight: "80px" }}>
          {cols[i] ? (
            <p style={{ margin: 0, fontSize: "0.875rem", whiteSpace: "pre-wrap" }}>
              {cols[i]}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
};

CraftColumns.craft = {
  displayName: "Columns",
  props: {
    columns: 2,
    gap: "1.5rem",
    columnContent: ["", ""],
  },
  related: {},
};
