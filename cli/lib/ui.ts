// Tiny ANSI styling + spinner helpers. Zero dependencies (Bun/Node tty only).

const ON = process.stdout.isTTY && process.env.NO_COLOR === undefined;

function wrap(open: number, close: number) {
  return (s: string) => (ON ? `\x1b[${open}m${s}\x1b[${close}m` : s);
}

export const c = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  italic: wrap(3, 23),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
  gray: wrap(90, 39),
};

export const sym = {
  ok: c.green("✓"),
  err: c.red("✗"),
  warn: c.yellow("!"),
  info: c.cyan("•"),
  arrow: c.gray("›"),
};

export function info(msg: string) {
  console.log(`${sym.info} ${msg}`);
}
export function ok(msg: string) {
  console.log(`${sym.ok} ${msg}`);
}
export function warn(msg: string) {
  console.log(`${sym.warn} ${c.yellow(msg)}`);
}
export function fail(msg: string) {
  console.error(`${sym.err} ${c.red(msg)}`);
}

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// A minimal spinner that lives on a single TTY line. No-op when piped.
export function spinner(text: string) {
  let i = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  const render = () => {
    if (!process.stdout.isTTY) return;
    process.stdout.write(`\r${c.cyan(FRAMES[i++ % FRAMES.length])} ${text} `);
  };
  if (process.stdout.isTTY) {
    render();
    timer = setInterval(render, 80);
  }
  const clear = () => {
    if (timer) clearInterval(timer);
    if (process.stdout.isTTY) process.stdout.write("\r\x1b[2K");
  };
  return {
    stop() {
      clear();
    },
    succeed(msg?: string) {
      clear();
      if (msg) ok(msg);
    },
    setText(t: string) {
      text = t;
    },
  };
}

export function banner() {
  console.log();
  console.log(`  ${c.bold(c.magenta("Merchiva"))} ${c.dim("CLI")}`);
  console.log(`  ${c.dim("daily management, from your terminal")}`);
  console.log();
}
