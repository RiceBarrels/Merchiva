import React from "react";
import { render } from "ink";
import { App } from "./app.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";

// Best-effort terminal restore so a crash never leaves the user's shell in raw
// mode (no echo / broken cursor). Mirrors what Ink does on a clean unmount.
function restoreTerminal() {
  try {
    if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
      process.stdin.setRawMode(false);
    }
    process.stdout.write("[?25h"); // show cursor
    process.stdout.write("[?2004l"); // disable bracketed paste
  } catch {
    /* ignore */
  }
}

// Mounts the full-screen TUI. Requires an interactive terminal.
export async function launchUI() {
  if (!process.stdout.isTTY) {
    console.error("The Merchiva UI needs an interactive terminal (TTY). Try `merchiva help` for commands.");
    process.exit(1);
  }

  const app = render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
    {
      exitOnCtrlC: false,
      // Ink 7's kitty-keyboard protocol makes some terminals report keystrokes
      // as escape-code sequences, which can corrupt multibyte (CJK/IME) input
      // and crash the input parser. Force the classic input mode — plain UTF-8
      // keystrokes — which handles Chinese/Japanese/Korean input reliably.
      kittyKeyboard: { mode: "disabled" },
    },
  );

  // Safety net: if anything throws outside React's render (e.g. in an async
  // handler or the stdin pipeline), tear down cleanly instead of wedging the
  // terminal with a raw stack dump.
  const onFatal = (err: unknown) => {
    try {
      app.unmount();
    } catch {
      /* ignore */
    }
    restoreTerminal();
    console.error("\nMerchiva UI exited:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  };
  process.on("uncaughtException", onFatal);
  process.on("unhandledRejection", onFatal);

  try {
    await app.waitUntilExit();
  } finally {
    process.off("uncaughtException", onFatal);
    process.off("unhandledRejection", onFatal);
    restoreTerminal();
  }
}
