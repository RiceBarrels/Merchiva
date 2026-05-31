import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.ts";

interface State {
  error: Error | null;
}

// Catches render-time throws (e.g. width measurement on unusual input) so a
// single bad frame shows a message instead of tearing down the whole TUI and
// leaving the terminal in raw mode.
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <Box flexDirection="column" padding={1}>
          <Text color={theme.bad} bold>
            ✗ Something went wrong rendering this view
          </Text>
          <Text color={theme.dim}>{this.state.error.message}</Text>
          <Box marginTop={1}>
            <Text color={theme.muted}>Press </Text>
            <Text color={theme.accent} bold>
              q
            </Text>
            <Text color={theme.muted}> to quit, then reopen with </Text>
            <Text color={theme.accent} bold>
              merchiva
            </Text>
            <Text color={theme.muted}>.</Text>
          </Box>
        </Box>
      );
    }
    return <>{this.props.children}</>;
  }
}
