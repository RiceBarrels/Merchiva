import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { Spinner } from "./Spinner.tsx";
import { theme } from "../theme.ts";

export interface Field {
  key: string;
  label: string;
  type?: "text" | "number";
  required?: boolean;
  placeholder?: string;
  initial?: string;
}

interface FormProps {
  title: string;
  fields: Field[];
  submitLabel?: string;
  onSubmit: (values: Record<string, string>) => Promise<void>;
  onCancel: () => void;
}

// Modal-style form. Owns the keyboard while mounted (the parent sets the global
// input-capture flag): ↑↓/Tab move between fields, Enter advances / submits on
// the last field, Esc cancels. Number fields are validated on submit.
export function Form({ title, fields, submitLabel = "Save", onSubmit, onCancel }: FormProps) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, f.initial ?? ""])),
  );
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const setVal = (key: string, v: string) => setValues((s) => ({ ...s, [key]: v }));

  const submit = async () => {
    for (const f of fields) {
      const raw = (values[f.key] ?? "").trim();
      if (f.required && !raw) {
        setError(`${f.label} is required`);
        setIndex(fields.findIndex((x) => x.key === f.key));
        return;
      }
      if (f.type === "number" && raw && Number.isNaN(Number(raw))) {
        setError(`${f.label} must be a number`);
        setIndex(fields.findIndex((x) => x.key === f.key));
        return;
      }
    }
    setBusy(true);
    setError("");
    try {
      await onSubmit(values);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  useInput((_input, key) => {
    if (busy) return;
    if (key.escape) return onCancel();
    if (key.downArrow || (key.tab && !key.shift)) return setIndex((i) => (i + 1) % fields.length);
    if (key.upArrow || (key.tab && key.shift)) return setIndex((i) => (i - 1 + fields.length) % fields.length);
    if (key.return) {
      if (index < fields.length - 1) setIndex((i) => i + 1);
      else void submit();
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.accent} paddingX={1}>
      <Text color={theme.brand} bold>
        {title}
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {fields.map((f, i) => (
          <Box key={f.key}>
            <Box width={14}>
              <Text color={i === index ? theme.accent : theme.dim}>
                {i === index ? "▸ " : "  "}
                {f.label}
                {f.required ? <Text color={theme.dim}>*</Text> : null}
              </Text>
            </Box>
            <Box
              flexGrow={1}
              borderStyle="round"
              borderColor={i === index ? theme.accent : theme.border}
              paddingX={1}
            >
              <TextInput
                value={values[f.key] ?? ""}
                onChange={(v) => setVal(f.key, v)}
                focus={i === index && !busy}
                placeholder={f.placeholder ?? (f.type === "number" ? "0" : "")}
              />
            </Box>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        {busy ? (
          <Spinner label="Saving…" />
        ) : error ? (
          <Text color={theme.bad}>✗ {error}</Text>
        ) : (
          <Text color={theme.dim}>
            ↑↓/Tab move · Enter {submitLabel.toLowerCase()} on last field · Esc cancel
          </Text>
        )}
      </Box>
    </Box>
  );
}
