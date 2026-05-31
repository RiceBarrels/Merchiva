import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { useTable, useSpacetimeDB } from "spacetimedb/react";
import { tables } from "../../../lib/spacetimedb/generated/index.ts";
import { useOrg } from "../data/provider.tsx";
import { usePerms } from "../data/permissions.tsx";
import { Gate } from "../components/Gate.tsx";
import { Form, type Field } from "../components/Form.tsx";
import { theme } from "../theme.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Day {
  id: string;
  dayNumber: number;
  title: string;
  description: string;
  sortOrder: number;
}

interface Objective {
  id: string;
  dayId: string;
  text: string;
  sortOrder: number;
}

// One rendered output line — either a day header or one of its objectives.
type Line = { kind: "day"; day: Day } | { kind: "obj"; obj: Objective };

export function Training({
  height,
  focused,
  setCapturing,
}: {
  height: number;
  focused: boolean;
  setCapturing: (b: boolean) => void;
}) {
  const { orgId } = useOrg();
  const state = useSpacetimeDB() as any;
  const canEdit = usePerms().can("staffing", "edit");

  const [dayRows, daysReady] = useTable(tables.trainingDay as any);
  const [objRows, objsReady] = useTable(tables.trainingObjective as any);
  const ready = daysReady && objsReady;

  const [mode, setMode] = useState<"list" | "add">("list");
  const [offset, setOffset] = useState(0);

  function call(name: string, args: any) {
    const c = state?.getConnection?.();
    if (!c) throw new Error("Not connected");
    if (!orgId) throw new Error("No org");
    return c.reducers[name]({ organizationId: orgId, ...args });
  }

  const days = useMemo<Day[]>(() => {
    if (!orgId) return [];
    return (dayRows as any[])
      .filter((r) => r.organizationId === orgId)
      .map((r) => ({
        id: String(r.id),
        dayNumber: Number(r.dayNumber ?? 0),
        title: String(r.title ?? ""),
        description: String(r.description ?? ""),
        sortOrder: Number(r.sortOrder ?? 0),
      }))
      .sort((a, b) => a.dayNumber - b.dayNumber || a.sortOrder - b.sortOrder);
  }, [dayRows, orgId]);

  const objectives = useMemo<Objective[]>(() => {
    if (!orgId) return [];
    return (objRows as any[])
      .filter((r) => r.organizationId === orgId)
      .map((r) => ({
        id: String(r.id),
        dayId: String(r.dayId ?? ""),
        text: String(r.text ?? ""),
        sortOrder: Number(r.sortOrder ?? 0),
      }));
  }, [objRows, orgId]);

  // Flatten days + their objectives into a single scrollable line list.
  const lines = useMemo<Line[]>(() => {
    const out: Line[] = [];
    for (const day of days) {
      out.push({ kind: "day", day });
      const own = objectives
        .filter((o) => o.dayId === day.id)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      for (const obj of own) out.push({ kind: "obj", obj });
    }
    return out;
  }, [days, objectives]);

  const window = Math.max(3, height - 4);
  const maxOffset = Math.max(0, lines.length - window);

  useEffect(() => {
    if (offset > maxOffset) setOffset(maxOffset);
  }, [maxOffset, offset]);

  // Form open/close drives the global input-capture flag so list keys don't
  // fire while typing.
  useEffect(() => {
    setCapturing(mode !== "list");
    return () => setCapturing(false);
  }, [mode, setCapturing]);

  useInput(
    (input, key) => {
      if (mode !== "list" || !focused) return;
      if (key.downArrow) return setOffset((o) => Math.min(maxOffset, o + 1));
      if (key.upArrow) return setOffset((o) => Math.max(0, o - 1));
      if (!canEdit) return;
      if (input === "a") return setMode("add");
    },
    { isActive: focused && mode === "list" },
  );

  if (mode === "add") {
    const nextDay = days.reduce((m, d) => Math.max(m, d.dayNumber), 0) + 1;
    const fields: Field[] = [
      { key: "title", label: "Title", required: true },
      { key: "dayNumber", label: "Day #", type: "number", initial: String(nextDay) },
      { key: "description", label: "Description" },
    ];
    return (
      <Form
        title="Add training day"
        fields={fields}
        onCancel={() => setMode("list")}
        onSubmit={async (v) => {
          await call("addTrainingDay", {
            dayNumber: Number(v.dayNumber),
            title: v.title.trim(),
            description: v.description || undefined,
            sortOrder: Number(v.dayNumber),
          });
          setMode("list");
        }}
      />
    );
  }

  const visible = lines.slice(offset, offset + window);

  return (
    <Gate ready={ready}>
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Text color={theme.dim}>
            {days.length} day{days.length === 1 ? "" : "s"} · {objectives.length} objective
            {objectives.length === 1 ? "" : "s"}
          </Text>
          {canEdit ? (
            <Text color={theme.dim}>
              <Text color={theme.accent}>a</Text> add day
            </Text>
          ) : (
            <Text color={theme.dim}>read-only</Text>
          )}
        </Box>
        <Box marginTop={1} flexDirection="column">
          {lines.length === 0 ? (
            <Text color={theme.dim}>
              No training days yet.{canEdit ? " Press a to add one." : ""}
            </Text>
          ) : (
            visible.map((line) =>
              line.kind === "day" ? (
                <Text key={`d-${line.day.id}`} color={theme.accent} bold>
                  Day {line.day.dayNumber}: {line.day.title}
                </Text>
              ) : (
                <Text key={`o-${line.obj.id}`} color={theme.muted}>
                  {"   • "}
                  {line.obj.text}
                </Text>
              ),
            )
          )}
          {lines.length > visible.length ? (
            <Text color={theme.dim}>
              … showing {offset + 1}–{offset + visible.length} of {lines.length} (↑↓ scroll)
            </Text>
          ) : null}
        </Box>
      </Box>
    </Gate>
  );
}
