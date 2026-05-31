#!/usr/bin/env bun
// Merchiva CLI — daily management from your terminal.
//
//   merchiva chat                 talk to Mr. Merchiva (interactive)
//   merchiva ask "<question>"     one-shot question
//   merchiva new page <name>      scaffold an authenticated /~/ page
//   merchiva new hook <name>      scaffold a SpacetimeDB domain hook
//   merchiva config [...]         view / set base URL + language
//   merchiva doctor               check connectivity to the app
//
// Connects to a running Merchiva app over HTTP (default http://localhost:3000).

import { chatCommand, askCommand } from "./commands/chat.ts";
import { newCommand } from "./commands/new.ts";
import { loginCommand, logoutCommand, whoamiCommand } from "./commands/auth.ts";
import { ensureFreshToken } from "./lib/auth.ts";
import { loadConfig, saveConfig, configPath, LOCALES, type Locale } from "./lib/config.ts";
import { ping } from "./lib/api.ts";
import { c, ok, fail, info, banner, spinner } from "./lib/ui.ts";

// --- tiny arg parser: separates `--flags`/`-f` from positional args ----------
function parseArgs(argv: string[]) {
  const args: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith("-")) {
        flags[a.slice(2)] = argv[++i];
      } else {
        flags[a.slice(2)] = true;
      }
    } else if (a.startsWith("-") && a.length > 1) {
      flags[a.slice(1)] = true;
    } else {
      args.push(a);
    }
  }
  return { args, flags };
}

function printHelp() {
  banner();
  console.log(`  ${c.bold("Usage")}  merchiva <command> [options]
`);
  console.log(`  ${c.bold("Commands")}`);
  const rows: [string, string][] = [
    ["(no args)", "Open the full-screen TUI (same as `ui`)"],
    ["login", "Sign in (email/password) and save your token"],
    ["logout", "Clear the saved token"],
    ["whoami", "Show the signed-in user + token freshness"],
    ["chat", "Interactive chat with Mr. Merchiva"],
    ['ask "<q>"', "Ask one question and exit"],
    ["new page <name>", "Scaffold app/~/<name>/page.tsx + i18n + nav"],
    ["new hook <name>", "Scaffold lib/spacetimedb/hooks/use<Name>.ts"],
    ["config", "Show current config"],
    ["config set url <origin>", "Set the app base URL"],
    ["config set lang <locale>", `Set default language (${LOCALES.join(", ")})`],
    ["doctor", "Check connectivity to the app"],
  ];
  for (const [cmd, desc] of rows) {
    console.log(`    ${c.cyan(cmd.padEnd(26))} ${c.dim(desc)}`);
  }
  console.log(`
  ${c.bold("Options")}
    ${c.cyan("--lang <locale>".padEnd(26))} ${c.dim("Override language for this chat/ask")}
`);
  console.log(`  ${c.bold("Environment")}`);
  console.log(`    ${c.dim("MERCHIVA_API_URL")}   base URL (overrides config)`);
  console.log(`    ${c.dim("MERCHIVA_LANG")}      default language`);
  console.log(`    ${c.dim("MERCHIVA_TOKEN")}     SpacetimeDB user token (authed endpoints)`);
  console.log();
}

function configCommand(args: string[]) {
  const [action, key, value] = args;
  if (!action || action === "show" || action === "get") {
    const cfg = loadConfig();
    banner();
    console.log(`  ${c.dim("config file")}  ${configPath()}`);
    console.log(`  ${c.dim("base url   ")}  ${c.bold(cfg.baseUrl)}`);
    console.log(`  ${c.dim("language   ")}  ${c.bold(cfg.lang)}`);
    console.log(`  ${c.dim("token      ")}  ${cfg.token ? c.green("set") : c.dim("not set")}`);
    console.log();
    return;
  }
  if (action === "set") {
    if (key === "url") {
      if (!value) return fail("Usage: merchiva config set url <origin>");
      const cfg = saveConfig({ baseUrl: value.replace(/\/+$/, "") });
      return ok(`base url → ${c.bold(cfg.baseUrl)}`);
    }
    if (key === "lang") {
      if (!value || !(LOCALES as readonly string[]).includes(value)) {
        return fail(`lang must be one of: ${LOCALES.join(", ")}`);
      }
      const cfg = saveConfig({ lang: value as Locale });
      return ok(`language → ${c.bold(cfg.lang)}`);
    }
    if (key === "token") {
      if (!value) return fail("Usage: merchiva config set token <token>");
      saveConfig({ token: value });
      return ok("token saved");
    }
    if (key === "org") {
      if (!value) return fail("Usage: merchiva config set org <organizationId>");
      saveConfig({ orgId: value });
      return ok(`org → ${c.bold(value)}`);
    }
    return fail(`Unknown config key: "${key}". Try: url, lang, token, org`);
  }
  fail(`Unknown config action: "${action}". Try: show, set`);
}

async function doctorCommand() {
  const cfg = loadConfig();
  banner();
  info(`Target: ${c.bold(cfg.baseUrl)}`);
  const spin = spinner("Pinging /api/store-ai…");
  const res = await ping(cfg);
  spin.stop();
  if (res.ok) {
    ok(`Reachable (HTTP ${res.status}). Mr. Merchiva is online.`);
  } else if (res.status) {
    fail(`App responded HTTP ${res.status}. Endpoint reached but returned an error.`);
  } else {
    fail(`Unreachable: ${res.error}`);
    info(`Start the app with ${c.bold("bun run dev")}, or set the URL:`);
    info(`  merchiva config set url https://www.merchiva.com`);
  }
}

async function main() {
  const { args, flags } = parseArgs(process.argv.slice(2));
  const [cmd, ...rest] = args;

  // Bare `merchiva` (or `merchiva ui`) opens the full-screen TUI.
  if (!cmd || cmd === "ui") {
    await ensureFreshToken(); // refresh a near-expiry login before connecting
    const { launchUI } = await import("./ui/launch.tsx");
    await launchUI();
    return;
  }

  if (flags.help || flags.h || cmd === "help") {
    printHelp();
    return;
  }
  if (flags.version || flags.v || cmd === "version") {
    console.log("merchiva-cli 0.1.0");
    return;
  }

  switch (cmd) {
    case "login":
      await loginCommand(rest);
      break;
    case "logout":
      logoutCommand();
      break;
    case "whoami":
      await whoamiCommand();
      break;
    case "chat":
      await ensureFreshToken();
      await chatCommand(rest, flags);
      break;
    case "ask":
      await ensureFreshToken();
      await askCommand(rest, flags);
      break;
    case "new":
      newCommand(rest);
      break;
    case "config":
      configCommand(rest);
      break;
    case "doctor":
      await doctorCommand();
      break;
    default:
      fail(`Unknown command: "${cmd}"`);
      info("Run `merchiva help` to see available commands.");
      process.exit(1);
  }
}

main().catch((e) => {
  fail(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
