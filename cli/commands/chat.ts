// `merchiva chat`  — interactive REPL with Mr. Merchiva
// `merchiva ask "<question>"` — one-shot question, prints reply and exits

import { createInterface } from "node:readline";
import { loadConfig, LOCALES, type Locale } from "../lib/config.ts";
import { streamChat, type ChatTurn } from "../lib/api.ts";
import { c, spinner, banner, fail, info } from "../lib/ui.ts";

function pickLang(flags: Record<string, string | boolean>): Locale | undefined {
  const v = flags.lang;
  if (typeof v === "string" && (LOCALES as readonly string[]).includes(v)) {
    return v as Locale;
  }
  return undefined;
}

function renderActions(actions: unknown[]) {
  if (!actions.length) return;
  console.log();
  console.log(c.dim(`  ${actions.length} action${actions.length > 1 ? "s" : ""} suggested:`));
  for (const a of actions) {
    const obj = a as Record<string, unknown>;
    const name = typeof obj.action === "string" ? obj.action : "action";
    console.log(`  ${c.yellow("⚡")} ${c.bold(name)} ${c.dim(JSON.stringify(a))}`);
  }
  console.log(c.dim("  (run actions from the app — the CLI only previews them)"));
}

async function runTurn(
  message: string,
  history: ChatTurn[],
  lang: Locale | undefined,
): Promise<string> {
  const config = loadConfig();
  const spin = spinner("Mr. Merchiva is thinking…");
  let started = false;
  let ackShown = false;

  try {
    const result = await streamChat({
      config,
      message,
      history,
      lang,
      onText: (chunk) => {
        if (!started) {
          spin.stop();
          process.stdout.write(`${c.magenta("Merchiva")} ${c.dim("›")} `);
          started = true;
        }
        process.stdout.write(chunk);
      },
    });

    if (!started) {
      // No prose streamed (pure ack/action reply) — still close the spinner.
      spin.stop();
      const head = result.ack || result.text || "(no reply)";
      process.stdout.write(`${c.magenta("Merchiva")} ${c.dim("›")} ${head}`);
    }
    if (!process.stdout.write("") || !result.text.endsWith("\n")) console.log();

    if (result.ack && !ackShown && !result.text) {
      info(result.ack);
    }
    if (result.kaomoji) console.log(c.dim(`  ${result.kaomoji}`));
    renderActions(result.actions);

    return result.text || result.ack || "";
  } catch (e) {
    spin.stop();
    fail(e instanceof Error ? e.message : String(e));
    return "";
  }
}

export async function askCommand(args: string[], flags: Record<string, string | boolean>) {
  const question = args.join(" ").trim();
  if (!question) {
    fail('Usage: merchiva ask "your question"');
    process.exit(1);
  }
  await runTurn(question, [], pickLang(flags));
}

export async function chatCommand(_args: string[], flags: Record<string, string | boolean>) {
  const lang = pickLang(flags);
  banner();
  console.log(
    c.dim(`  Chatting with Mr. Merchiva. Type ${c.bold("/exit")} to quit, ${c.bold("/reset")} to clear context.`),
  );
  console.log();

  const history: ChatTurn[] = [];
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const prompt = () => rl.setPrompt(`${c.cyan("you")} ${c.dim("›")} `);
  prompt();
  rl.prompt();

  rl.on("line", async (line) => {
    const text = line.trim();
    if (!text) {
      rl.prompt();
      return;
    }
    if (text === "/exit" || text === "/quit") {
      rl.close();
      return;
    }
    if (text === "/reset") {
      history.length = 0;
      info("Context cleared.");
      rl.prompt();
      return;
    }
    rl.pause();
    const reply = await runTurn(text, history, lang);
    if (reply) {
      history.push({ role: "user", content: text });
      history.push({ role: "assistant", content: reply });
      // Keep the rolling window small to stay within token budgets.
      if (history.length > 20) history.splice(0, history.length - 20);
    }
    console.log();
    rl.resume();
    rl.prompt();
  });

  rl.on("close", () => {
    console.log(c.dim("\n  See you next shift. 〜"));
    process.exit(0);
  });
}
