import React, { useEffect, useState } from "react";
import { Text } from "ink";
import { theme } from "../theme.ts";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function Spinner({ label }: { label?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % FRAMES.length), 80);
    return () => clearInterval(t);
  }, []);
  return (
    <Text color={theme.accent}>
      {FRAMES[i]}
      {label ? <Text color={theme.muted}> {label}</Text> : null}
    </Text>
  );
}
