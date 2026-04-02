# CLAUDE.md — BizOps Project Instructions

@AGENTS.md

## Quick Context

This is **BizOps**, a Next.js 16 + Supabase + Square app for small business daily management. The UI uses shadcn/ui v4 with Tailwind CSS v4.

## Critical Rules

1. **Read Next.js docs first.** This is Next.js 16 — APIs differ from your training data. Check `node_modules/next/dist/docs/` before writing any code.
2. **Never use `any` freely.** Only in Supabase row mappers, marked with `eslint-disable`.
3. **Never call Supabase from components directly.** Always go through `lib/db/*.ts`.
4. **Always handle async errors.** Every `useEffect` data fetch must have `.catch()` and `.finally()`.
5. **Never expose secrets.** `SUPABASE_SERVICE_ROLE_KEY` is server-only. Square tokens live in the DB, not env vars.
6. **RLS is non-negotiable.** Every table has it. Every new table must have it.
7. **Test builds before deploying.** `bun run build` must pass clean.

## Style Guide

- Anti-AI aesthetics: sharp corners (`0.3rem`), solid borders, Stone/Slate palette, no glow effects.
- Font: Inter for UI, Geist Mono for data/code.
- Compact density: tight spacing, data-rich tables, minimal whitespace.
- Icons: Lucide React only, `h-4 w-4` default size.

## Current Architecture

- **Auth:** Supabase Auth (email/password), session via cookies (@supabase/ssr)
- **Multi-tenant:** Organizations → org_members (owner/manager/staff roles)
- **Permissions:** JSONB on org_members, checked via `usePermissions()` hook
- **Square:** Opt-in integration via Settings page, syncs to Supabase tables
- **Pages:** Dashboard, Inventory, Sales, Staffing, Products, Team, Settings
- **Deploy:** Vercel at `project-management-phi-red.vercel.app`

## Common Tasks

### Add a new page
1. Create `app/(app)/newpage/page.tsx` (client component with loading state)
2. Add nav item to `components/sidebar.tsx` (with permission check)
3. Wrap content in `<PermissionGuard section="newpage">`
4. Add permission key to `Permissions` type in `lib/types.ts`
5. Update `ownerPermissions()` and `defaultPermissions()` in `lib/db/team.ts`

### Add a new DB table
1. Write migration SQL with RLS policy (user_id + organization_id pattern)
2. Run via Supabase SQL Editor or MCP
3. Add TypeScript interface to `lib/types.ts`
4. Create `lib/db/newtable.ts` with query functions
5. Update `supabase/schema.sql` for reference

### Fix a loading bug
- Check if `useEffect` has `.catch()` and `.finally(() => setLoading(false))`
- Check RLS policies — user must match `user_id` or be an active org member
- Check if the Supabase client is correct (server vs browser)
