import React, { useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import { Spinner } from "../components/Spinner.tsx";
import { login, AuthError } from "../../lib/auth.ts";
import { loadConfig } from "../../lib/config.ts";
import { theme } from "../theme.ts";

interface LoginProps {
  onSuccess: (email?: string) => void;
  onUseService?: () => void;
  serviceAvailable: boolean;
}

// In-TUI sign-in, mirroring the web login page: centered card, email + masked
// password, submit on Enter. On success the parent swaps in the main app.
export function Login({ onSuccess, onUseService, serviceAvailable }: LoginProps) {
  const { stdout } = useStdout();
  const cols = stdout?.columns || 100;
  const rows = stdout?.rows || 30;

  const [email, setEmail] = useState(loadConfig().userEmail ?? "");
  const [password, setPassword] = useState("");
  const [field, setField] = useState<"email" | "password">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (busy) return;
    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const user = await login(email.trim(), password);
      onSuccess(user.email ?? email.trim());
    } catch (e) {
      setError(e instanceof AuthError ? e.message : e instanceof Error ? e.message : String(e));
      setPassword("");
      setField("password");
      setBusy(false);
    }
  };

  useInput((input, key) => {
    if (key.ctrl && input === "c") process.exit(0);
    if (busy) return;
    if (key.tab) {
      setField((f) => (f === "email" ? "password" : "email"));
      return;
    }
    if (key.return) {
      if (field === "email") setField("password");
      else void submit();
      return;
    }
    // Esc skips with the service token (never collides with typing).
    if (key.escape && serviceAvailable && onUseService) {
      onUseService();
    }
  });

  return (
    <Box width={cols} height={rows} alignItems="center" justifyContent="center">
      <Box
        flexDirection="column"
        width={48}
        borderStyle="round"
        borderColor={theme.border}
        paddingX={2}
        paddingY={1}
      >
        <Text color={theme.brand} bold>
          ◆ Merchiva
        </Text>
        <Text color={theme.dim}>Sign in to continue</Text>

        <Box marginTop={1} flexDirection="column">
          <Text color={field === "email" ? theme.accent : theme.dim}>Email</Text>
          <Box borderStyle="round" borderColor={field === "email" ? theme.accent : theme.border} paddingX={1}>
            <TextInput
              value={email}
              onChange={setEmail}
              focus={field === "email" && !busy}
              placeholder="you@example.com"
            />
          </Box>
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Text color={field === "password" ? theme.accent : theme.dim}>Password</Text>
          <Box borderStyle="round" borderColor={field === "password" ? theme.accent : theme.border} paddingX={1}>
            <TextInput
              value={password}
              onChange={setPassword}
              focus={field === "password" && !busy}
              mask="•"
              placeholder="••••••••"
            />
          </Box>
        </Box>

        <Box marginTop={1}>
          {busy ? (
            <Spinner label="Signing in…" />
          ) : error ? (
            <Text color={theme.bad}>✗ {error}</Text>
          ) : (
            <Text color={theme.dim}>Tab to switch · Enter to submit</Text>
          )}
        </Box>

        {serviceAvailable && !busy ? (
          <Text color={theme.dim}>
            or press <Text color={theme.accent}>esc</Text> to continue with the service token
          </Text>
        ) : null}
      </Box>
    </Box>
  );
}
