import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { Spinner } from "../components/Spinner.tsx";
import { streamChat, type ChatTurn } from "../../lib/api.ts";
import { loadConfig } from "../../lib/config.ts";
import { useOrg } from "../data/provider.tsx";
import { theme } from "../theme.ts";

interface Msg {
  role: "user" | "assistant";
  content: string;
  kaomoji?: string;
}

export function Chat({ focused, height }: { focused: boolean; height: number }) {
  // The store picked in the TUI; the server answers only an active member of it.
  const { orgId } = useOrg();
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState("");
  const [ack, setAck] = useState("");

  const submit = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    setStreaming("");
    setAck("");
    const history: ChatTurn[] = msgs.slice(-10).map((m) => ({ role: m.role, content: m.content }));
    setMsgs((m) => [...m, { role: "user", content: q }]);
    try {
      const res = await streamChat({
        config: loadConfig(),
        message: q,
        history,
        organizationId: orgId ?? undefined,
        onText: (chunk) => setStreaming((s) => s + chunk),
      });
      if (res.ack && !res.text) setAck(res.ack);
      setMsgs((m) => [...m, { role: "assistant", content: res.text || res.ack || "(no reply)", kaomoji: res.kaomoji }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", content: "⚠ " + (e instanceof Error ? e.message : String(e)) }]);
    }
    setStreaming("");
    setBusy(false);
  };

  const visible = msgs.slice(-Math.max(3, height - 6));

  return (
    <Box flexDirection="column" height={height}>
      <Box flexDirection="column" flexGrow={1}>
        {visible.length === 0 && !busy ? (
          <Text color={theme.dim}>Ask Mr. Merchiva anything — sales, schedules, inventory, advice.</Text>
        ) : null}
        {visible.map((m, i) => (
          <Box key={i} flexDirection="column" marginBottom={1}>
            <Text color={m.role === "user" ? theme.accent : theme.brand} bold>
              {m.role === "user" ? "you" : "Merchiva"} <Text color={theme.dim}>›</Text>
            </Text>
            <Text color={theme.fg}>{m.content}</Text>
            {m.kaomoji ? <Text color={theme.dim}>{m.kaomoji}</Text> : null}
          </Box>
        ))}
        {busy ? (
          <Box flexDirection="column">
            <Text color={theme.brand} bold>
              Merchiva <Text color={theme.dim}>›</Text>
            </Text>
            {streaming ? <Text color={theme.fg}>{streaming}</Text> : <Spinner label={ack || "thinking…"} />}
          </Box>
        ) : null}
      </Box>

      <Box borderStyle="round" borderColor={focused ? theme.accent : theme.border} paddingX={1}>
        <Text color={theme.accent} bold>
          ›{" "}
        </Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={submit}
          focus={focused && !busy}
          placeholder={focused ? "type a message, ↵ to send" : "press ↵ to focus chat"}
        />
      </Box>
    </Box>
  );
}
