# CLAUDE.md — Merchiva

@AGENTS.md

## Quick Context

Merchiva is a Next.js 16 + SpacetimeDB + Square/Clover app for small business management. No Supabase — SpacetimeDB is the sole data layer. The UI uses shadcn/ui v4 with Tailwind CSS v4. Native builds via Capacitor.

## Critical Rules

1. **Read Next.js docs first.** This is Next.js 16 — check `node_modules/next/dist/docs/` before writing any code.
2. **No free `any`.** Only in SpacetimeDB row mappers, marked with `eslint-disable`.
3. **No direct DB calls from components.** Use `lib/spacetimedb/hooks.ts` for reads, `lib/spacetimedb/actions.ts` for writes.
4. **Handle async errors.** Every `useEffect` data fetch needs `.catch()` and `.finally()`.
5. **No secrets in client code.** `WORKOS_API_KEY` is server-only.
6. **All app links use `/manager/` prefix.** Internal navigation: `/manager/dashboard`, `/manager/inventory`, etc. Device surfaces are the exception: `/store` (shared store tablet) and `/personal` (employee phone) live at the root and are picked at `/choose` (`lib/app-mode.ts`: admin → `/manager`, personal → `/personal`, store → `/store`).
7. **Test builds before deploying.** `bun run build` must pass clean.
8. **Schema changes follow the Schema Migration Rules in AGENTS.md.** New columns go at the very end as `t.option(...)`; never reorder columns; never use `--delete-data` without asking the user; never hand-edit `lib/spacetimedb/generated/`.

## Common Tasks

Step-by-step procedures live in project skills under `.claude/skills/`:

- `add-page` — new `/manager/` page: nav entries, PermissionGuard, PageTabs, i18n keys.
- `spacetimedb-schema-change` — add a table, or add a column to an existing table, and publish safely.
- `debug-loading` — checklist for a page stuck on its loading state.
- `stripe-billing-setup` — Stripe products, price ids, webhook endpoint, local `stripe listen`.
