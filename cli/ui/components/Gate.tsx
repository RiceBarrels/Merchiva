import React from "react";
import { Box, Text } from "ink";
import { Spinner } from "./Spinner.tsx";
import { useConnState } from "../data/provider.tsx";
import { theme } from "../theme.ts";

// Wraps data-backed page bodies: shows connection / loading state until the
// table subscription is ready, mirroring the web's connecting screen.
export function Gate({ ready, children }: { ready: boolean; children: React.ReactNode }) {
  const conn = useConnState();

  if (conn.status === "error") {
    return (
      <Box flexDirection="column">
        <Text color={theme.bad}>✗ SpacetimeDB connection error</Text>
        <Text color={theme.dim}>{conn.error}</Text>
        <Text color={theme.dim}>Check NEXT_PUBLIC_SPACETIMEDB_URI / token, then restart.</Text>
      </Box>
    );
  }

  if (conn.status !== "connected" && !conn.hasToken) {
    return (
      <Box flexDirection="column">
        <Text color={theme.warn}>! Not connected — please sign in</Text>
        <Text color={theme.dim}>Quit (q) and run: merchiva login</Text>
        <Text color={theme.dim}>(or run from the repo so SPACETIMEDB_SERVICE_TOKEN in .env.local is used)</Text>
      </Box>
    );
  }

  if (!ready) return <Spinner label="Loading live data…" />;

  return <>{children}</>;
}
