# CLAUDE.md — Merchiva

@AGENTS.md

## Quick Context

Merchiva is a Next.js 16 + SpacetimeDB + Square/Clover app for small business management. No Supabase — SpacetimeDB is the sole data layer. The UI uses shadcn/ui v4 with Tailwind CSS v4. Native builds via Capacitor. Drive (files), Sheets and Slides live under `/manager/drive`; Docs, Sheets and Slides are installable editor plugins; file bytes are in a private Vercel Blob store.

## Critical Rules

1. **Read Next.js docs first.** This is Next.js 16 — check `node_modules/next/dist/docs/` before writing any code.
2. **No free `any`.** Only in SpacetimeDB row mappers, marked with `eslint-disable`.
3. **No direct DB calls from components.** Use `lib/spacetimedb/hooks.ts` for reads, `lib/spacetimedb/actions.ts` for writes (or an area file in `lib/spacetimedb/actions/`, e.g. `drive.ts`, `sheets.ts`).
4. **Handle async errors.** Every `useEffect` data fetch needs `.catch()` and `.finally()`.
5. **No secrets in client code.** `WORKOS_API_KEY` is server-only.
6. **All app links use `/manager/` prefix.** Internal navigation: `/manager/dashboard`, `/manager/inventory`, etc. Device surfaces are the exception: `/store` (shared store tablet) and `/personal` (employee phone) live at the root and are picked at `/choose` (`lib/app-mode.ts`: admin → `/manager`, personal → `/personal`, store → `/store`).
7. **Test builds before deploying.** `bun run build` must pass clean.
8. **Schema changes follow the Schema Migration Rules in AGENTS.md.** New columns go at the very end; never reorder columns; never use `--delete-data` without asking the user; never hand-edit `lib/spacetimedb/generated/`. Use `t.option(...)` **except** for anything that will be filtered/joined/used in an RLS rule — option columns are permanently unfilterable; use `t.string().default('')` there.
9. **New table ⇒ new RLS rule.** `public: true` means world-readable by anyone with the module id (which is in the client bundle). Add the table to a list in `spacetimedb/src/index.ts` and verify with `bun run check:rls`.
10. **Read money via `lib/money.ts`.** Currency columns have exact `*Cents` siblings; sum in cents, convert once.
9. **Every new feature ships on three surfaces.** `/manager` (full page) + `/store` (lite app) + `/personal` (lite app), registered in the `/manager/apps` catalog. The manager page alone is an unfinished feature. See "Every New Feature Ships on Three Surfaces" in AGENTS.md for the exact files; if a surface truly doesn't fit, ask the user before skipping it.
10. **Chinese to the user, English in the repo.** Reply, explain and ask in 中文; write all code, identifiers, comments, commit messages and docs in English. User-facing strings go through i18n, not hardcoded.
11. **Verify before claiming done.** `bun test`, `bunx tsc --noEmit`, and `bunx eslint <changed paths>` — there is no CI, so nothing runs them for you.
12. **File bytes never go into SpacetimeDB.** Drive bytes live in the private Vercel Blob store under ASCII keys; API routes only authorize. Tell users their store's management can see what they store (`drive.disclosure.*`). See "Drive & File Storage" in AGENTS.md.
13. **Licenses are guarded.** Never add `@univerjs-pro/*`, `@univerjs/preset-*-advanced|collaboration`, `hyperformula`, `handsontable` or npm `xlsx`; keep office deps pinned exactly; after any dependency change run `bun scripts/licenses/generate.ts` and `bun test scripts/tests/legal`.

## Common Tasks

Step-by-step procedures live in project skills under `.claude/skills/`:

- `add-page` — new `/manager/` page: nav entries, PermissionGuard, PageTabs, i18n keys.
- `spacetimedb-schema-change` — add a table, or add a column to an existing table, and publish safely.
- `debug-loading` — checklist for a page stuck on its loading state.
- `stripe-billing-setup` — Stripe products, price ids, webhook endpoint, local `stripe listen`.
