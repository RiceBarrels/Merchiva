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
6. **All app links use `/~/` prefix.** Internal navigation: `/~/dashboard`, `/~/inventory`, etc.
7. **Test builds before deploying.** `bun run build` must pass clean.

## Style Guide

- Sharp corners (`0.3rem`), solid borders, Stone/Slate palette, no glow effects.
- Font: Inter for UI, Geist Mono for data.
- Compact density, data-rich tables, minimal whitespace.
- Icons: Lucide React, `h-4 w-4` default.

## Common Tasks

### Add a new page
1. Create `app/~/newpage/page.tsx` (client component with loading state)
2. Add nav item to `components/sidebar.tsx` and `components/bottom-bar.tsx`
3. Wrap content in `<PermissionGuard section="newpage">`
4. Add to a `PageTabs` group if it belongs to a tab cluster
5. Add i18n keys to all 6 locale files in `messages/`

### Add a SpacetimeDB table
1. Define table + reducers in the SpacetimeDB module
2. Run `spacetime generate` — output goes to `lib/spacetimedb/generated/`
3. Add subscription hook in `lib/spacetimedb/hooks.ts` or domain hook in `hooks/`
4. Add action wrappers in `lib/spacetimedb/actions.ts`

### Fix a loading bug
- Check `useEffect` has `.catch()` and `.finally(() => setLoading(false))`
- Check SpacetimeDB connection status in provider
- Check permissions — user may not have access
- Check if the SpacetimeDB subscription is set up correctly

### Build native app
1. `npx cap sync` — sync web assets
2. `npx cap open ios` / `npx cap open android`
3. App loads from Vercel deployment URL
