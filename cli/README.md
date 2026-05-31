# Merchiva CLI

Daily management from your terminal. A zero-dependency Bun + TypeScript CLI that
talks to a running Merchiva app over HTTP and scaffolds new code that follows the
project's conventions.

## Install / run

```bash
# from the repo
bun run cli help          # via the package.json script
bun cli/index.ts help     # directly

# global command (optional)
bun link                  # exposes `merchiva` on your PATH
merchiva help
```

## Commands

| Command | What it does |
|---|---|
| `merchiva chat` | Interactive REPL with Mr. Merchiva (streaming). `/exit`, `/reset`. |
| `merchiva ask "<question>"` | One-shot question, prints the reply and exits. |
| `merchiva new page <name>` | Scaffold `app/~/<name>/page.tsx` + `nav.<name>` i18n key in all 6 locales + nav snippets to paste. |
| `merchiva new hook <name>` | Scaffold `lib/spacetimedb/hooks/use<Name>.ts` using the `useTable` idiom. |
| `merchiva config` | Show current config (base URL, language, token). |
| `merchiva config set url <origin>` | Point the CLI at an app (`http://localhost:3000`, `https://www.merchiva.com`). |
| `merchiva config set lang <locale>` | Default reply language: `en zh es fr ar hi`. |
| `merchiva doctor` | Ping `/api/store-ai` and report reachability. |

Flags: `--lang <locale>` overrides the language for a single `chat`/`ask`.

## How it connects

The CLI calls the app's Next.js API routes — it does **not** open a SpacetimeDB
connection itself. Mr. Merchiva runs through `POST /api/store-ai` (streaming text,
with `X-Merchiva-Ack` / `X-Merchiva-Kaomoji` headers). Action blocks that the web
client would execute are previewed in the terminal, not run.

Base URL resolution (highest priority first):

1. `MERCHIVA_API_URL` env var
2. `~/.merchiva/config.json`
3. `NEXT_PUBLIC_APP_URL` env var
4. `http://localhost:3000`

## Layout

```
cli/
├── index.ts            # entry: arg parsing, command router, help
├── commands/
│   ├── chat.ts         # chat REPL + one-shot ask
│   └── new.ts          # page / hook scaffolding
├── lib/
│   ├── api.ts          # streaming store-ai client + action stripper
│   ├── config.ts       # config resolution + ~/.merchiva/config.json
│   ├── repo.ts         # repo-root discovery + name casing helpers
│   └── ui.ts           # ANSI styling + spinner
└── tsconfig.json       # allows .ts import extensions (Bun style)
```

The `cli/` directory is excluded from the Next.js typecheck (like `scripts/`), so
it never affects `bun run build`.

## Write actions (in the TUI)

Gated by the account's `edit` permission for the section (owner/service = full).
When a section's content is focused (`Enter` from the sidebar):

| Page | Keys |
|---|---|
| Inventory | `a` add item · `e` edit · `+`/`-` adjust stock · `r` restock to max · `↑↓` select |
| Products | `a` add · `e` edit · `↑↓` select |

Forms: `↑↓`/`Tab` move between fields, `Enter` submits on the last field, `Esc`
cancels. Writes call the same SpacetimeDB reducers as the web (`addProduct`,
`addInventoryItem`, `updateInventoryItem`, …).

## Notes

- **CJK / IME input** (Chinese, Japanese, Korean): the TUI launches with Ink's
  kitty-keyboard protocol disabled (`kittyKeyboard: { mode: "disabled" }`). On
  terminals that support kitty, the protocol reports keystrokes as escape-code
  sequences which corrupt multibyte input and crash the parser — disabling it
  keeps input on the reliable classic UTF-8 path. A render error boundary plus
  an `uncaughtException` net also restore the terminal instead of wedging it.
