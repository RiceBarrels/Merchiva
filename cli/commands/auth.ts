// `merchiva login`   — email/password sign-in (WorkOS), saves the token
// `merchiva logout`  — clears the saved token
// `merchiva whoami`  — shows the signed-in user + token freshness

import { createInterface, type Interface } from "node:readline";
import { login, logout, ensureFreshToken, tokenExp, isExpired, AuthError } from "../lib/auth.ts";
import { loadConfig } from "../lib/config.ts";
import { c, ok, fail, info, banner } from "../lib/ui.ts";

function ask(rl: Interface, q: string): Promise<string> {
  return new Promise((res) => rl.question(q, res));
}

// Read a line without echoing keystrokes (for passwords).
function askHidden(rl: Interface, q: string): Promise<string> {
  return new Promise((res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rlAny = rl as any;
    process.stdout.write(q);
    const restore = rlAny._writeToOutput;
    rlAny._writeToOutput = () => {};
    rl.question("", (val: string) => {
      rlAny._writeToOutput = restore;
      process.stdout.write("\n");
      res(val);
    });
  });
}

export async function loginCommand(args: string[]) {
  banner();
  const cfg = loadConfig();
  info(`Signing in to ${c.bold(cfg.baseUrl)}`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const email = (args[0] || (await ask(rl, `${c.cyan("email")} ${c.dim("›")} `))).trim();
    const password = await askHidden(rl, `${c.cyan("password")} ${c.dim("›")} `);
    rl.close();
    if (!email || !password) return fail("Email and password are required.");

    const user = await login(email, password);
    ok(`Signed in as ${c.bold(user.email || email)}`);
    info("Your token is saved and will be used by the UI and chat.");
    info(`Open the app with ${c.bold("merchiva")} or ask a question with ${c.bold('merchiva ask "…"')}.`);
  } catch (e) {
    rl.close();
    if (e instanceof AuthError) {
      fail(e.message);
      if (e.kind === "credentials") info("Double-check the email/password, or sign up in the web app first.");
    } else {
      fail(e instanceof Error ? e.message : String(e));
    }
    process.exit(1);
  }
}

export function logoutCommand() {
  logout();
  ok("Signed out. Saved token cleared.");
}

export async function whoamiCommand() {
  const cfg = loadConfig();
  banner();
  if (!cfg.token) {
    info("Not signed in.");
    info(`Run ${c.bold("merchiva login")} — or rely on SPACETIMEDB_SERVICE_TOKEN when run from the repo.`);
    return;
  }
  console.log(`  ${c.dim("user  ")}  ${c.bold(cfg.userEmail || "(unknown)")}`);
  const exp = tokenExp(cfg.token);
  if (exp) {
    const secs = exp - Math.floor(Date.now() / 1000);
    const state = isExpired(cfg.token)
      ? c.yellow("expired — will refresh on next use")
      : c.green(`valid for ~${Math.max(0, Math.round(secs / 60))} min`);
    console.log(`  ${c.dim("token ")}  ${state}`);
  } else {
    console.log(`  ${c.dim("token ")}  ${c.green("set")}`);
  }
  console.log(`  ${c.dim("refresh")} ${cfg.refreshToken ? c.green("available") : c.dim("none")}`);
  // Proactively refresh so the next launch is instant.
  await ensureFreshToken();
}
