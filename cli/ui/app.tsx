// Merchiva TUI — full-screen Ink app mirroring the web layout:
//   [ sidebar nav ] [ page header + tabs / content ]
//   [ status / keybinding bar ]
//
// Keyboard:
//   ↑/↓  move between sections      ↵/→  open section (focus content)
//   tab  cycle sub-tabs             esc/←  back to menu
//   c    jump to Mr. Merchiva chat  o    switch org      q  quit

import React, { useEffect, useState } from "react";
import { Box, useApp, useInput, useStdout } from "ink";
import { DataProvider, useOrg, useConnState } from "./data/provider.tsx";
import { PermsProvider, usePerms } from "./data/permissions.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { Header } from "./components/Header.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { Login } from "./pages/Login.tsx";
import { NoAccess } from "./pages/NoAccess.tsx";
import { NAV, sectionForPage } from "./nav.ts";
import { renderPage } from "./pages/registry.tsx";
import { theme } from "./theme.ts";
import { loadConfig } from "../lib/config.ts";
import { logout } from "../lib/auth.ts";

function useDimensions() {
  const { stdout } = useStdout();
  const [dim, setDim] = useState({
    cols: stdout?.columns || 100,
    rows: stdout?.rows || 30,
  });
  useEffect(() => {
    if (!stdout) return;
    const on = () => setDim({ cols: stdout.columns || 100, rows: stdout.rows || 30 });
    stdout.on("resize", on);
    return () => {
      stdout.off("resize", on);
    };
  }, [stdout]);
  return dim;
}

function Shell({ onSignOut }: { onSignOut: () => void }) {
  const { exit } = useApp();
  const { cols, rows } = useDimensions();
  const conn = useConnState();
  const { orgName, orgs, orgId, select } = useOrg();
  const perms = usePerms();
  const [page, setPage] = useState("dashboard");
  const [focus, setFocus] = useState<"nav" | "page">("nav");
  // True while a page-level form/text-entry owns the keyboard.
  const [capturing, setCapturing] = useState(false);

  // Only sections the current account may view, mirroring the web sidebar's
  // permission-aware filtering.
  const visibleNav = NAV.filter((s) => perms.can(s.perm, "view"));

  // If the active page became inaccessible (org switch / perms loaded), fall
  // back to the first section the user can see.
  const activeSection = sectionForPage(page);
  const pageAllowed = visibleNav.some((s) => s.page === activeSection?.page);
  useEffect(() => {
    if (!pageAllowed && visibleNav.length > 0) {
      setPage(visibleNav[0].page);
      setFocus("nav");
    }
  }, [pageAllowed, visibleNav.length]);

  const sidebarW = 24;
  const contentW = Math.max(24, cols - sidebarW - 2);
  const bodyH = Math.max(8, rows - 2);
  const chatTyping = focus === "page" && page === "chat";

  useInput((input, key) => {
    if (key.ctrl && input === "c") return exit();
    // A page form owns the keyboard — let it (and its TextInputs) handle everything.
    if (capturing) return;
    if (chatTyping) {
      if (key.escape) setFocus("nav");
      return;
    }
    if (input === "q") return exit();
    if (input === "x") return onSignOut();
    if (input === "c") {
      setPage("chat");
      setFocus("page");
      return;
    }
    if (input === "o" && orgs.length > 1) {
      const i = orgs.findIndex((o) => o.id === orgId);
      select(orgs[(i + 1) % orgs.length].id);
      return;
    }

    const list = visibleNav.length > 0 ? visibleNav : NAV;
    const section = sectionForPage(page) ?? list[0];

    // Sub-tab switching works in both nav and page focus.
    if (key.tab && section.tabs && section.tabs.length) {
      const ti = section.tabs.findIndex((t) => t.page === page);
      const delta = key.shift ? -1 : 1;
      const next = section.tabs[(ti + delta + section.tabs.length) % section.tabs.length];
      return setPage(next.page);
    }

    if (focus === "page") {
      // Content is focused: Esc/← return to the menu; arrows belong to the page
      // (e.g. row selection), so don't move the sidebar here.
      if (key.escape || key.leftArrow) setFocus("nav");
      return;
    }

    // Nav focused: arrows move between sections.
    const idx = Math.max(0, list.findIndex((s) => s.page === section.page));
    if (key.upArrow) return setPage(list[(idx - 1 + list.length) % list.length].page);
    if (key.downArrow) return setPage(list[(idx + 1) % list.length].page);
    if (key.return || key.rightArrow) return setFocus("page");
  });

  const connLabel =
    conn.status === "connected"
      ? "Connected"
      : conn.status === "error"
        ? "Error"
        : conn.hasToken
          ? "Connecting…"
          : "No token";
  const connColor =
    conn.status === "connected" ? theme.good : conn.status === "error" ? theme.bad : theme.warn;

  const hints: [string, string][] = chatTyping
    ? [
        ["↵", "send"],
        ["esc", "back"],
        ["^C", "quit"],
      ]
    : focus === "page"
      ? [
          ["esc", "menu"],
          ["tab", "sub-tab"],
          ["c", "chat"],
          ["q", "quit"],
        ]
      : [
          ["↑↓", "move"],
          ["↵", "open"],
          ["tab", "sub-tab"],
          ["c", "chat"],
          ["o", "org"],
          ["x", "sign out"],
          ["q", "quit"],
        ];

  return (
    <Box flexDirection="column" width={cols} height={rows}>
      <Box flexDirection="row" flexGrow={1}>
        <Sidebar
          nav={visibleNav}
          page={page}
          focused={focus === "nav"}
          width={sidebarW}
          height={bodyH}
          orgName={orgName}
          connLabel={connLabel}
          connColor={connColor}
          userEmail={loadConfig().userEmail}
        />
        <Box
          flexDirection="column"
          width={contentW}
          height={bodyH}
          borderStyle="round"
          borderColor={focus === "page" ? theme.accent : theme.border}
        >
          <Header page={page} width={contentW - 2} />
          <Box flexGrow={1} paddingX={1} flexDirection="column">
            {perms.ready && activeSection?.perm && !perms.can(activeSection.perm, "view") ? (
              <NoAccess section={activeSection.label} role={perms.role} />
            ) : (
              renderPage({
                page,
                focused: focus === "page",
                width: contentW - 4,
                height: bodyH - 6,
                setCapturing,
              })
            )}
          </Box>
        </Box>
      </Box>
      <StatusBar
        width={cols}
        hints={hints}
        right={conn.status === "connected" ? `${orgs.length} org${orgs.length === 1 ? "" : "s"}` : ""}
      />
    </Box>
  );
}

export function App() {
  const [authed, setAuthed] = useState<boolean>(Boolean(loadConfig().token));
  const serviceAvailable = Boolean(process.env.SPACETIMEDB_SERVICE_TOKEN || process.env.MERCHIVA_TOKEN);

  if (!authed) {
    return (
      <Login
        serviceAvailable={serviceAvailable}
        onSuccess={() => setAuthed(true)}
        onUseService={() => setAuthed(true)}
      />
    );
  }

  return (
    <DataProvider>
      <PermsProvider>
        <Shell
          onSignOut={() => {
            logout();
            setAuthed(false);
          }}
        />
      </PermsProvider>
    </DataProvider>
  );
}
