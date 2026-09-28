# Agent Rules — Merchiva

## What Is This

Merchiva is a daily management platform for small businesses. It handles inventory, sales, staffing, products, pricing, finances, reports, bookings, reviews, suppliers, training — plus team chat. It connects to Square and Clover POS systems, uses SpacetimeDB as the sole data layer (no Supabase), and ships as a web app (Vercel) and native app (Capacitor / Tauri).

## Tech Stack

Dependencies are in `package.json`; these are the rules the manifest can't tell you:

| Layer | Tool | Notes |
|:---|:---|:---|
| Runtime | Bun | `bun install`, `bun run dev`. No npm/yarn. |
| Framework | Next.js 16 (App Router) | **Read `node_modules/next/dist/docs/` before writing code.** |
| Language | TypeScript (strict) | No `any` except SpacetimeDB row mappers with `eslint-disable`. |
| UI | shadcn/ui v4 + Base UI | Only import what you use. |
| Styling | Tailwind CSS v4 | Utility-first. No per-component CSS files. |
| Icons | Lucide React | `h-4 w-4` default, `h-5 w-5` for nav. |
| Database | SpacetimeDB | Sole data layer. Real-time subscriptions. Generated types in `lib/spacetimedb/generated/`. |
| File storage | Vercel Blob, private store (`@vercel/blob`) | Drive file bytes only; metadata lives in SpacetimeDB. See "Drive & File Storage". |
| Sheets | Univer OSS (`@univerjs/presets` + `preset-sheets-*`, one pinned version) | Apache-2.0 packages only, never Univer Pro. `.xlsx` via ExcelJS, loaded lazily on the client; `.csv` by `lib/sheets/xlsx/csv.ts` (formula-injection safe). |
| Slides | Own editor (`components/slides/`) on Yjs | `.pptx` import `pptxtojson`, export `pptxgenjs`; transforms `react-moveable` / `react-selecto`. |
| POS | Square SDK (v44+), Clover | OAuth flow, sync to SpacetimeDB. Credentials stored in DB, not env vars. |
| Auth | WorkOS (`lib/auth/workos.ts`) | Email/password, OAuth. Session via cookies. |
| i18n | Custom (`lib/i18n/`) | One JSON per locale in `messages/`; every key goes in every locale file. |
| Tests | `bun:test` | Suite lives in `scripts/tests/`. |
| Native | Capacitor (iOS + Android), Tauri (desktop) | Loads from Vercel URL. Haptics, safe area, status bar. |

---

## Verification — What "Done" Means

**There is no CI.** No GitHub Action runs these for you. If you don't run them, nobody does.

| Command | When | Bar |
|:---|:---|:---|
| `bun test` | After any logic change | 3318 tests, ~45s. Must stay green. Zero failures. |
| `bunx tsc --noEmit` | After any TypeScript change | Must print **nothing**. |
| `bun run build` | Before any deploy, and after routing/config/server changes | Must pass clean. |
| `bunx eslint <changed paths>` | After any change | No **new** errors on files you touched. |
| `bun test scripts/tests/legal` + `bun scripts/licenses/generate.ts --check` | After any dependency change | Must pass; notices must be fresh. |

### Gotchas that will waste your time

- **Phantom type errors from stale `.next` artifacts.** If `tsc` reports errors in files like `.next/types/routes.d 2.ts` or `cache-life.d 2.ts`, those are duplicated build artifacts (the trailing `" 2"` is a Finder/iCloud copy), not real errors. Fix: `find .next -name "* 2.*" -delete`, then re-run. Same for `bun run build` reporting a bogus "has no exported member" — `rm -rf .next` and rebuild before believing it.
- **`bun run lint` is repo-wide and currently reports ~14k problems**, because the ESLint config does not ignore `ios/`, `out/`, `.design-ref/`, or `src-tauri/target/`. Do not treat that number as a regression you caused. Scope lint to what you touched: `bunx eslint app components lib` or specific paths.
- **Known lint debt**: ~131 errors in `app/ components/ lib/ spacetimedb/src/`, mostly `@typescript-eslint/no-explicit-any` in what remains of legacy `lib/db/*` and in the module's row handling, plus `react-hooks/set-state-in-effect` in deliberate effect-driven state machines (the device lock screen, the browser-shell input). Do not add to it. Do not "fix" it as a side quest either.
- **Tests are not typechecked.** `tsconfig.json` excludes `scripts/` and `cli/`, so `tsc` never sees test files. A test can be type-broken and still run.

### Reporting rules

- Never say "done", "works", or "fixed" for something you did not run. Say what you ran and what it printed.
- If a test fails, show the failing output. Do not summarize it away.
- If you skipped a check, say which one and why.
- "The build passes" means you ran `bun run build` in this session and it exited 0.

---

## Git, Commits & PRs

### Branching

- `main` is the default branch and deploys to production.
- Never commit directly to `main`. Branch first: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`.
- Open a PR against `main`. Use `gh` for GitHub operations.

### Commit messages

Conventional-commit style, lowercase, imperative, no trailing period:

```
feat: store + personal device surfaces, single chooser, PWA home start
fix: new accounts no longer stuck on the connecting splash; entry goes to /choose
chore: remove duplicate files
```

Types in use: `feat`, `fix`, `chore`, `refactor`, `docs`. One logical change per commit. When the session supplies attribution trailers (`Co-Authored-By:` / `Claude-Session:`), keep them as the last lines of the message.

### Commit only when asked

Do not commit, push, tag, or open a PR unless the user asked for it. Staging work you weren't asked to stage is how unrelated changes ship.

### Files that look generated but ARE tracked

Do not delete or gitignore these — they are committed on purpose:

- `lib/spacetimedb/generated/**` — regenerate with `spacetime generate`, **never hand-edit**.
- `spacetimedb/dist/bundle.js` — the published module bundle.
- `bun.lock` — commit it with any dependency change.
- `public/legal/third-party-notices.json`, `public/legal/THIRD_PARTY_NOTICES.txt` — regenerate with `bun scripts/licenses/generate.ts`, never hand-edit.

### Never commit

- `.env*` — secrets. Already gitignored; keep it that way.
- Build output: `.next/`, `out/`, `dist-electron/`, `ios/`, `android/`, `src-tauri/target/`.
- Duplicate artifacts matching `* 2.*` (there are ~1279 of them in ignored directories — Finder/iCloud copies). They are junk. Never create them, never commit them.
- Anything under `.claude/`.

---

## Code Structure & Limits

### Where things live

| Path | Holds |
|:---|:---|
| `app/manager/**` | Authenticated pages. `layout.tsx` holds auth guard, SpacetimeDB provider, shell. |
| `app/[locale]/**` | Public marketing pages, locale-prefixed. |
| `app/store`, `app/personal`, `app/choose` | Bare device surfaces (see App modes). |
| `app/licenses` | Public open-source notices page (static; also in the Capacitor export). |
| `components/<feature>/**` | Feature UI, grouped by domain (`personnel/`, `docs/`, `device/`, `browser-shell/`). |
| `components/ui/**` | shadcn primitives + the 12 shared composites. Nothing feature-specific. |
| `lib/spacetimedb/**` | Data layer: client, provider, hooks, actions, generated types. |
| `lib/<domain>/**` | Domain logic with no React (`lib/docs/`, `lib/merchiva/`, `lib/i18n/`). |
| `components/drive/`, `lib/drive/` | Drive UI and domain logic. `components/device/apps/drive.tsx` is the device app. |
| `components/sheets/`, `lib/sheets/` | Spreadsheet editor (Univer host, `.xlsx` IO). |
| `components/slides/`, `lib/slides/` | Presentation editor. |
| `spacetimedb/src/drive/` | Drive module code (tables, reducers), wired into `spacetimedb/src/index.ts`. |
| `lib/drive/server/` | Server-only Blob adapter and route handlers behind `app/api/drive/*`. |
| `messages/*.json` | One per locale: `ar, en, es, fr, hi, zh-cn, zh-hk, zh-tw`. |
| `scripts/tests/**` | The whole test suite (`bun:test`). |
| `scripts/licenses/`, `public/legal/` | License policy + notices generator; generated notices (committed). |
| `cli/` | Bun + Ink terminal client. |
| `design-system/` | Design system snapshot — source of truth for visuals. |

**Shared helpers to reach for before writing your own** — each of these replaced
several hand-rolled copies, and a new copy is a bug waiting to happen:

| Helper | Use it for |
|:---|:---|
| `lib/date-key.ts` | The `YYYY-MM-DD` calendar-day key every date column stores. **Never** `toISOString().slice(0, 10)` — that is the UTC day, a different day from the store's for most of the world. |
| `lib/i18n/dates.ts` + `lib/i18n/use-date-format.ts` | Formatting a date or time for a person. Never a hardcoded `"en-US"` locale. |
| `lib/use-now.ts` (`useNow`) | A clock a component renders. Reading `Date.now()` during render is impure and never re-renders on its own. |
| `lib/money.ts` | Reading and summing money. Add in cents, convert once. |
| `lib/allowed-origins.ts` | Matching a CORS origin. Exact for http(s), scheme-prefix only for custom app schemes. |

### File size

- **Soft cap 400 lines, hard cap 800** for any new file.
- The repo has files at 4700 lines (`components/merchiva-chat-dashboard.tsx`, `components/personnel/staffing-full.tsx`). That is debt, not a precedent. Never grow a file that is already over 800 lines — split instead.
- Split pattern to follow: a feature folder with `index.tsx` plus focused siblings, like `components/personnel/team/{index,data,inspector,list-view,canvas}.tsx`.

### Naming

- Files: kebab-case (`morning-briefing-card.tsx`). Exception: `lib/spacetimedb/hooks/` uses camelCase (`useInventory.ts`) — match the folder you're in.
- Components: PascalCase. Props: camelCase. DB columns: snake_case.
- Imports: always the `@/` alias. No `../../..` chains.

### Boundaries

1. **No direct DB calls from components.** Reads go through `lib/spacetimedb/hooks.ts` (thin `useTable` wrappers) or a domain hook in `lib/spacetimedb/hooks/` (`useInventory`, `useStaffing`, `useDocs`, …). Writes go through `lib/spacetimedb/actions.ts`.
2. **`lib/db/*` is legacy Supabase-era code.** Six modules are left (`team`, `chat`, `staffing`, `availability`, `avatars`, `settings`); the seven with no importers were deleted. Never add a file there, never import it into new code.
3. Client components declare `"use client"`. Server components have no directive and never import client-only modules.
4. `WORKOS_API_KEY`, `STRIPE_SECRET_KEY`, and every other secret are server-only. Never reference them in a file that ships to the browser.
5. Every `useEffect` data fetch needs `.catch()` and `.finally()`. Every list has a loading state and an empty state.
6. **No free `any`.** Only in SpacetimeDB row mappers, with an `eslint-disable` comment on the line or block.

---

## Data Layer (SpacetimeDB)

- Real-time subscriptions via `lib/spacetimedb/hooks.ts` and domain hooks in `lib/spacetimedb/hooks/`. Subscriptions in `lib/spacetimedb/provider.tsx` are scoped to the active org and windowed — never add a bare `SELECT * FROM <table>`.
- Mutations via reducer calls in `lib/spacetimedb/actions.ts`.
- Generated types in `lib/spacetimedb/generated/` — **never edit these manually**.
- Provider wraps the app in `app/manager/layout.tsx`.
- No Supabase.
- Module source: `spacetimedb/src/index.ts`. Published to maincloud via `spacetime publish`.
- Module code may live in `spacetimedb/src/drive/*.ts` factories wired from `index.ts`; client write wrappers may live in `lib/spacetimedb/actions/<area>.ts` (approved U12). `@/lib/spacetimedb/actions` still resolves to `actions.ts`; import an area file by its own path (`@/lib/spacetimedb/actions/drive`).
- The SDK carries a local patch in `spacetimedb/patches/` (fixes an SDK 2.2.0 index-lookup bug that panics on connect). Don't drop it when upgrading.

### Schema Migration Rules (CRITICAL)

**Adding columns to existing tables:**

- New columns MUST go at the **end** of the table definition, after all existing columns. Inserting between columns causes a "reorder" error that forces `--delete-data` (destroys all rows).
- New columns should use `t.option(...)` so existing rows default to `null` — **unless the column will ever be filtered on** (see below).
- Publish: `spacetime publish merchiva --server maincloud --yes`.
- **Never** use `--delete-data` — including `--delete-data=on-conflict`, which *will* delete data on any conflict — without explicitly warning the user and getting a yes.
- After publish, run `spacetime generate` to regenerate TypeScript types, and commit the result.

**Never put a filterable value in an `option` column.** SpacetimeDB SQL cannot compare or join an `option` column at all:

```
WHERE itemId = 'x'   ->  The literal expression `x` cannot be parsed as type `(some: String | none: ())`
ON a.optCol = b.col  ->  Unexpected type: (expected) String != (some: String | none: ())
```

So an `t.option(...)` column is **permanently unusable** in a subscription `WHERE`, in a `clientVisibilityFilter` (RLS) rule, or in any join. When the column needs to be filterable, use a non-option column with a default — `t.string().default('')`, `t.i64().default(0n)` — which the migrator accepts for a new column and which can be indexed. (`.default()` cannot be combined with `primaryKey()`, `unique()` or `autoInc()`.)

Two more dialect limits that shape schema design:

- **uuid cannot be joined to string.** Primary keys are `t.uuid()` but references are `t.string()`, so `JOIN organization o ON o.id = x.organizationId` fails. `organization.orgIdText` and `site_booking.organizationId` exist purely as plain-string mirrors to work around this. (`organization.rootOrgId` is a retired third mirror, left from the removed sub-store feature.) A uuid *can* be compared to a string literal (`WHERE id = '<uuid>'`); only column-to-column joins fail.
- **`timestamp` columns cannot be compared to a literal**, so a table whose only date is a timestamp cannot be time-windowed in a subscription. Give it a `t.string()` `YYYY-MM-DD` column, or bound its growth with the `pruneOrgHistory` reducer.

Look rows up by primary key with `findById(ctx.db.foo, idString)` (it parses the string into a `Uuid`), not `[...ctx.db.foo.iter()].find(r => r.id.toString() === id)` — that is a full table scan for a primary-key lookup.

**A unique-index `find()` returns `null` on a miss, never `undefined`** (SDK 2.10, `node_modules/spacetimedb/src/server/runtime.ts`). Test the result with `!= null` or truthiness — never `!== undefined`. `isServiceCaller` once compared with `undefined`, so every caller counted as the service identity: every service-only reducer, `requireAdmin` and `findActiveMember`'s virtual owner were open to anyone.

### Row-Level Security (CRITICAL)

`public: true` means **any client may read every row of that table** — over the WebSocket *and* over the unauthenticated HTTP `/v1/database/<id>/sql` endpoint, whose database id ships in the client bundle as `NEXT_PUBLIC_SPACETIMEDB_MODULE`. Scoping the client's subscription is not a security boundary; the client chooses its own query.

The only boundary is a `clientVisibilityFilter`. The rule lists live near the bottom of `spacetimedb/src/index.ts`:

- `RLS_ORG_SCOPED` — joins `org_member` on `organizationId`; the default for tenant data.
- `RLS_SELF_SCOPED` — `WHERE <identityColumn> = :sender`; for personal rows (notifications, push keys, todos, punch PINs).
- `RLS_DOC_READER_SCOPED` — joins `document_reader_index` on the document id; the whole Docs family (Docs, Sheets, Slides). A new document child table goes here, never in `RLS_ORG_SCOPED`.
- `RLS_SERVICE_ONLY` — readable only by the service identity; for retired tables that still hold data.
- `RLS_UNFILTERED` — deliberately world-readable, with a written reason.

**Every table gets a service rule too.** `/merchivaAdmin` and the server routes read across tenants with `SPACETIMEDB_SERVICE_TOKEN`, which is an ordinary identity and is subject to RLS like any other — without that rule the admin console goes blank.

Exception (approved U14): service identity reads only `drive_usage` and `drive_blob_gc`, through the rule-free `drive_service_reader` join target; every other Drive/Docs table has no service rule — service work happens inside reducers.

`drive_admin_index`, `document_reader_index` and `drive_service_reader` are rule-free join targets, listed in `RLS_UNFILTERED` under KNOWN GAP like `org_membership_index`. Do not add a rule to a join target without a staging-verified subscription test: a wrong one makes every table whose rule joins it unsubscribable ("Subscriptions require indexes on join columns"). The fix for the KNOWN GAP is tracked in the `RLS_UNFILTERED` comment.

**A table with no rule is silently world-readable.** After adding a table:

```bash
bun run check:rls     # fails if any public table has no RLS rule
```

RLS is row level, not column level — it cannot hide one field of a row the client may otherwise read. Secrets need their own `public: false` table (`user_secret`, `org_secret`) or a separate self-scoped one (`member_punch_code`).

### Money

Currency columns are `f64` and cannot be changed in place, so each has an exact `<name>Cents` (`t.option(t.i64())`) sibling. Reducers write **both** via `toCents()` / `toCentsOpt()`. On the client, read money through `lib/money.ts` (`centsOf`, `sumCents`, `toMajor`) — **add in cents, convert once at the end**. Never `reduce((a, r) => a + r.amount, 0)`.
- Retired columns and tables stay in the schema. Removing them is a destructive migration.

Follow the `spacetimedb-schema-change` skill for the full procedure.

### Drive & File Storage (CRITICAL)

- File bytes live in the private Vercel Blob store. SpacetimeDB holds metadata only (`drive_item`, `drive_usage`, …).
  Never put file bytes in a SpacetimeDB column — the whole database is memory-resident.
- Blob pathnames are ASCII only (`org/<orgId>/<itemId>/…`, built by `lib/drive/rules.ts` and mirrored in the module).
  The display name lives in `drive_item.name`, never in the pathname (non-ASCII pathnames break: vercel/storage#1101).
- Browsers upload straight to Blob with a short-lived client token and download through short-lived signed URLs.
  Routes under `app/api/drive/` only authorize; they never stream bytes (Vercel's ~4.5 MB body cap; `proxy.ts`
  silently truncates request bodies over 10 MB).
- Authorization is SpacetimeDB's call: verify the WorkOS token with `verifiedUserId()`, then ask the module with the
  caller's own token (reducer via `lib/spacetimedb/server-rpc.ts`, or RLS-scoped `/sql`). Never trust an org or item
  id from the client. Native builds have no API routes — call them through `apiUrl()`.
- Docs, Sheets and Slides are rows of `document`; `fileType` is '' (legacy doc) | 'doc' | 'sheet' | 'slides'. Every
  Docs surface filters by `fileType`: a sheet or a deck must never open in the Tiptap editor.
- Management sees everything. The owner, the `manager` role and members with the `drive` permission (`drive.view`
  = view, `drive.edit` = edit) can open every member's Drive items and documents. Any feature that stores user
  content says so with the `drive.disclosure.*` copy; never promise privacy from management.
- Colleagues do not. `drive_item` is readable by its owner (by member id), by everyone in the org for ready,
  untrashed Store-space items, and by Drive admins (`drive_admin_index`, joined on the org's opaque `adminScope`);
  a pending upload also by the identity uploading it.
  The whole Docs family (`RLS_DOC_READER_SCOPED`: document, access, comment, edit lease, presence, snapshot, star,
  update, version, version state) is readable only by identities in `document_reader_index`, which
  `syncDocumentReaders` / `syncMemberDocReaders` derive from `docRoleFor`. Any write that changes a member's
  status, role, permissions or identity, or a document's visibility, grants or ownership, must refresh those
  indexes: `syncMemberAccessIndexes` / `dropMemberAccessIndexes` after every `org_member` write (next to
  `syncOrgMembershipIndex` where there is one), `rekeyAccessIdentity` when an identity changes, and
  `refreshDocReaders` after a document write. A new document child table joins that list. Until the phase-B
  publish, the eight older Docs tables also stay in `RLS_ORG_SCOPED` (its "PHASE A ONLY" block) and are still
  org-readable.
- A store tablet is one identity for everyone who uses it. Operator scoping on `/store` is UX plus `actingMemberId`,
  which only narrows (reducers and `/api/drive/url` grant the lower of the tablet account's and the operator's
  rights); it is not a read boundary. The lite app shows `drive.disclosure.sharedDeviceNote`.

---

## Route Structure

All authenticated pages live under `app/manager/`. Public pages are at root under `app/[locale]/`. `/choose`, `/store` and `/personal` are bare root routes that reuse the manager layout for auth.

**All in-app links use the `/manager/` prefix** — `/manager/dashboard`, `/manager/inventory`. Device surfaces are the exception: `/store` and `/personal` live at the root.

### Navigation Tabs

Pages are grouped with `PageTabs`. All hrefs use the `/manager/` prefix:

```tsx
<PageTabs tabs={[
  { label: "Inventory", href: "/manager/inventory" },
  { label: "Suppliers", href: "/manager/suppliers" },
  { label: "Waste Log", href: "/manager/inventory/waste" },
]} />
```

## App modes

`/choose` asks how a device is used and stores it in localStorage (`lib/app-mode.ts`):

| Mode | Home | UI |
|:---|:---|:---|
| admin | `/manager` | Back-office shell (sidebar / bottom bar) — the "manager" UI |
| personal | `/personal` | Employee phone surface |
| store | `/store` | Shared store tablet surface |

`/store` and `/personal` render bare (no MobileShell) through the manager layout for auth + providers. Neither surface has a shortcut into `/manager`: a device gets there by leaving its mode ("Leave" / "Log out" sheet → the chooser). The account menu still shows "Back to store device / personal" whenever the stored mode says this device is one.

**Device apps are lite versions.** `/store` and `/personal` are built for low-literacy staff — far simpler than `/manager`. Never embed a manager page into a device surface. The one exception is the office editors: Docs, and the Sheets and Slides editors opened from Drive, render the manager editor screens in their phone layout inside the panel (`components/device/apps/docs.tsx`, `components/device/apps/drive.tsx` through `components/drive/editor-host.tsx`) — writing a document, a spreadsheet or a deck is the same job on every surface. Everything else in the Drive device app (browse, upload, preview) is a lite rewrite.

---

## Every New Feature Ships on Three Surfaces (MANDATORY)

**As of 2026-09-15: a feature is not done when the manager page works.** Every new feature the user asks for must exist on all three surfaces and be installable from the device App Store:

1. **`/manager`** — the full back-office page.
2. **`/store`** — a lite app for the shared store tablet.
3. **`/personal`** — a lite app for the employee phone.
4. **`/manager/apps`** — registered in the catalog so the org can install / uninstall it.

### The files you must touch

| Step | File | What to add |
|:---|:---|:---|
| Manager page | `app/manager/<feature>/page.tsx` | Full page + `PermissionGuard` + `PageTabs` — follow the `add-page` skill |
| Icon | `components/device/app-icons.tsx` | Export the glyph, register it in `APP_ICONS` under the app id |
| Lite app | `components/device/apps/<feature>.tsx` | Named export `<Feature>Lite` taking `LiteAppProps`, built from the `lite.tsx` primitives (`LiteScreen`, `LiteSection`, `LiteRow`, `LiteStat`, `LiteButton`, `LiteEmpty`, …) |
| Catalog entry | `components/device/app-catalog.tsx` | One `CatalogApp`: `id`, `icon`, `route`, `permissionKey`, `surfaces`, `color`, lazy `component`, `lite`, optional `dockOn` / `pages` |
| Route ownership | `lib/device-apps.ts` → `MANAGER_ROUTE_APPS` | Map each manager route to the app id, so installing the app turns the route on (skip only for always-on features) |
| Always-on? | `lib/device-apps.ts` → `REQUIRED_DEVICE_APPS` | Add the id **only** if the app can never be uninstalled |
| i18n | all 8 `messages/*.json` | `device.catalog.<id>`, `device.catalogDesc.<id>`, plus the page's own keys |
| Screenshots | `public/app-shots/<id>-1.png … -3.png` | Optional — missing shots fall back to a tinted icon frame |

### Rules

- **The device versions are lite, not ports.** The `component` field in the catalog exists for link interception and kiosk pages flagged `keepManagerPage` — it is not how a feature reaches `/store` or `/personal`. Never route a device tile to a manager page. Docs and the Drive editors (Sheets, Slides) are the standing exception (see App modes above); they still go through `lite`, as a panel host around the manager screens.
- **No `lite` component means the app never appears on the device grids.** Shipping the manager page alone is an unfinished feature, not a milestone.
- **Surfaces are declared, visibility is gated.** Put `surfaces: ["store", "personal"]` in the catalog entry and let `permissionKey` / `managerOnly` decide who sees the tile. Don't hide a feature by omitting a surface.
- **If a surface genuinely doesn't fit, ask before skipping it.** There are real exceptions — `pay` is `surfaces: ["personal"]`, `punch-in` happens at store log-in instead of as a tile — but that is the user's call, not yours. Say which surface you want to skip and why, and wait for an answer.
- Install state is org-wide and cached on the settings row (`settings.deviceApps`) via the `setDeviceApps` reducer — never write it from a component.

## Auth & Permissions

- WorkOS handles auth (email/password + OAuth).
- Multi-tenant: Organizations → org_members (owner/manager/staff roles).
- Permissions stored as JSONB on org_members.
- `usePermissions()` hook + `<PermissionGuard section="...">` for access control.
- Sidebar and bottom bar auto-hide pages the user can't access.
- Every new `/manager/` page is permission-gated. No exceptions.
- `drive` is not a page gate — `/manager/drive` is gated by `dashboard`, like Docs. `drive.view` / `drive.edit` grant
  view / edit of **every member's** files and documents. Owner and `manager` role have it by role. The server mirrors are
  `drive_admin_index` and `document_reader_index`, refreshed by `syncMemberAccessIndexes` / `dropMemberAccessIndexes`
  after every write that adds or removes a member or changes a member's status, role or permissions
  (`rekeyAccessIdentity` when an identity changes), next to `syncOrgMembershipIndex` / `dropOrgMembershipIndex` where
  there is one — keep them together.
- `drive.edit` never trashes, restores or deletes forever someone else's content, and never moves it across spaces.
  Trash, restore and delete forever take the item's owner or an owner / manager. Moving a member's My files into Store
  takes that member; an owner or manager may do it only for a member who is no longer active (left or disabled).
  Moving into a member's My files takes rows that member already owns, moved by that member or an owner / manager. On
  `/store` a cross-space move must pass for the tablet account and the operator both (`spaceMoveAllowed` in
  `spacetimedb/src/drive/logic.ts`, `moveDriveContent` in `spacetimedb/src/drive/reducers.ts`). Only owners grant
  `drive` (`updateMemberPermissions` is owner-only; `inviteToOrg` strips it from a non-owner's invitation). On the client read the power with `driveAdminAccess(role, permissions)`
  (`lib/drive/access.ts`), never `can("drive", …)` — the manager layout merges role defaults into a manager's permissions.

---

## Visual Style

**Source of truth is `design-system/README.md` + `app/globals.css`.** The older `design.md` (April 2026) has drifted — where they disagree, the code wins (e.g. radius is `0.15rem`, not `0.3rem`).

Build tools, not demos. Professional software, not AI templates.

| Element | Do | Don't |
|:---|:---|:---|
| Palette | Neutral gray semantic tokens (`bg-muted`, `text-foreground`) | Neon, gradients, high saturation, raw `stone-*` classes |
| Radius | `--radius: 0.15rem` (sharp) | `rounded-2xl`, `rounded-full` on cards |
| Structure | Solid `1px border-border` | Glow effects, colored shadows |
| Font | Inter for UI, mono + `tabular-nums` for prices, SKUs, timestamps, IDs | Rounded sans-serif for data |
| Motion | Instant feedback, 200–300ms transitions | Typewriter effects, particles |
| Density | Compact tables, tight spacing | Hero sections, excessive whitespace |

Reuse the shared composites in `components/ui` (`StatusBadge`, `EmptyState`, `StatTile`, `SegmentedControl`, …) instead of hand-rolling the same block again. Status tones: five only.

---

## i18n

- Use the `useT()` hook. No hardcoded user-facing strings.
- Every key must exist in **all 8** locale files: `ar, en, es, fr, hi, zh-cn, zh-hk, zh-tw`. A key missing from one locale is a bug.
- Public marketing pages are locale-prefixed (`/en`, `/zh-cn`, …) via `proxy.ts`.
- While the Drive project is in flight, parallel sessions write keys to fragments under `scripts/i18n/drive/`
  (a file, or a directory with one file per locale; all 8 locales), and one serial step merges them with
  `bun scripts/i18n/drive.ts`. Never hand-merge into `messages/*.json` while other sessions are working. Until the
  fragments are retired, `scripts/tests/i18n/drive-fragments.test.ts` fails if a merged key in
  `messages/*.json` drifts from its fragment: change the fragment and re-run the merge. After that, edit
  `messages/*.json` directly as usual.
- `docs.share.managersNote` and `docs.share.visibilityPrivate` are Drive disclosure copy, like `drive.disclosure.*`:
  the same meaning in all 8 locales, no softening. They are not Docs home copy — `scripts/i18n/docs-home.ts` must not
  write them; while it still defines them with their old values, re-running it reverts the disclosure in every locale.

## Environment Variables

- `NEXT_PUBLIC_SPACETIMEDB_*` — SpacetimeDB connection (public)
- `WORKOS_API_KEY` / `WORKOS_CLIENT_ID` — server-only
- `SPACETIMEDB_SERVICE_TOKEN` — server-only; required by AI/live-context and notification routes
- `UPLOADTHING_TOKEN` — file upload
- `RESEND_API_KEY` — transactional email
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — server-only
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — client-side (optional for Checkout)
- `STRIPE_PRO_MONTHLY_PRICE_ID` / `STRIPE_PRO_YEARLY_PRICE_ID` — Stripe Price ids for the Pro plan
- `NEXT_PUBLIC_APP_URL` — fallback origin for Stripe success/cancel URLs
- `BLOB_STORE_ID` / `BLOB_WEBHOOK_PUBLIC_KEY` — the private Vercel Blob store behind Drive (added when the store is connected).
- `BLOB_READ_WRITE_TOKEN` — optional; local development without OIDC.
- `VERCEL_BLOB_CALLBACK_URL` — optional; a tunnel URL to test the upload callback locally.
- `CRON_SECRET` — authorizes Vercel Cron calls (`/api/merchiva/scan`, `/api/cron/drive-gc`, `/api/cron/drive-reconcile`).
- `DRIVE_BLOB_DATABASE` — must equal `NEXT_PUBLIC_SPACETIMEDB_MODULE`: pairs the Blob store with one database, so a
  laptop pointed at another database never touches the production store.
- `DRIVE_UPLOADS_PAUSED` — kill switch: `1` refuses new uploads; everything else in Drive keeps working.
- `DRIVE_PLATFORM_ALERT_BYTES` — optional; the nightly reconcile logs an error when the whole store holds more.
- The Drive variables above are all server-only, never `NEXT_PUBLIC_`. Drive storage counts as configured only when
  `BLOB_READ_WRITE_TOKEN` or `BLOB_STORE_ID`, `BLOB_WEBHOOK_PUBLIC_KEY`, `SPACETIMEDB_SERVICE_TOKEN` and the
  SpacetimeDB URI/module are set and `DRIVE_BLOB_DATABASE` matches; otherwise upload, commit, signed-URL and Drive
  cron requests answer 503 `not_configured` (`/api/drive/status` reports `configured: false`) and the rest of Drive
  keeps working.
- Square / Clover credentials stored in DB, not env vars

## Stripe Billing

Source of truth for plans/prices is the Stripe Dashboard (no local plan table). Setup steps live in the `stripe-billing-setup` skill.

Subscription state on org rows (`organization.stripeCustomerId`, `subscriptionStatus`, `subscriptionPriceId`, `subscriptionInterval`, `currentPeriodEnd`) is a **cache** — Stripe is canonical. `/api/billing/sync` refreshes from Stripe; the client persists via the `updateOrgSubscription` reducer.

## Deployment

1. `bun run build` — must pass clean
2. `npx vercel --prod --yes`
3. Native: `npx cap sync`, then open in Xcode / Android Studio

## Licensing & Third-Party Code

Everything that ships to a browser, the Capacitor apps or Tauri must be permissively licensed. The policy is code
(`scripts/licenses/policy.ts`) and the guard is `bun test scripts/tests/legal`.

- Forbidden, always: `@univerjs-pro/*`, `@univerjs/preset-*-advanced`, `@univerjs/preset-*-collaboration`,
  `hyperformula`, `handsontable` (and `@handsontable/*`), the npm `xlsx` package (`FORBIDDEN_PACKAGES`,
  `FORBIDDEN_IMPORT_SPECIFIERS`). Never copy source from PPTist (AGPL-3.0) or any GPL/AGPL project.
- Office dependencies are pinned exactly (no `^`/`~`): every `@univerjs/*` in lockstep at one version (except
  `@univerjs/icons`), `rxjs`, `exceljs`, `pptxtojson` (never below 1.0.0 — early releases were GPL/AGPL), `pptxgenjs`,
  `react-moveable`, `react-selecto`, `@vercel/blob` (`PINNED_VERSIONS`, `UNIVER_LOCKSTEP`, `MIN_VERSIONS`). Keep the
  `package.json` `overrides` for `https` (an empty placeholder pulled in by pptxgenjs) and `unzipper` (drops the
  unlicensed `buffers` chain).
- After any dependency change run `bun scripts/licenses/generate.ts` (`bun run licenses`) and commit `public/legal/*`;
  `--check` (`bun run check:licenses`) writes nothing and fails while they are stale. Users read them at `/licenses`
  and in Settings → About → Open-source licenses on every surface.
- `spacetimedb` ships BUSL-1.1 although its `package.json` says ISC. It is the one `EXCEPTIONS` entry: a documented,
  pre-existing exception (U16), not a release blocker. `generate.ts --release` additionally fails while any
  `EXCEPTIONS` entry is `approvedBy: "pending-user"`.
- No third-party marks as product names: never "Excel", "PowerPoint", "Univer" or "Google" in UI copy. Say
  "spreadsheet", "presentation", ".xlsx", ".pptx". `brandViolation` (`scripts/licenses/brand.ts`) enforces it.
- Patching a dependency file (Apache-2.0 §4(b)) means marking the change inside the patched file.

---

## Agent Behavior

### Language

- **Talk to the user in Chinese (中文).** Explanations, questions, summaries, status updates, plans — all in Chinese.
- **Everything that lands in the repo is in English.** Code, identifiers, code comments, commit messages, PR descriptions, docs like this one, and test names.
- User-facing product copy is neither: it goes through i18n (`useT()` + `messages/*.json`), never hardcoded in any language.

### Always ask first

Stop and get an explicit yes before:

- Publishing a SpacetimeDB schema change, or anything involving `--delete-data`.
- Deploying to production (`vercel --prod`).
- Deleting data, dropping tables, or removing tracked files in bulk.
- `git push --force`, rewriting history, or committing to `main`.
- Adding or upgrading a dependency.
- Touching auth, billing, or permission-gating logic in a way that changes who can access what.
- Adding an entry to `EXCEPTIONS` or `ELECTIONS` in `scripts/licenses/policy.ts`, or any package the license guard rejects.

Approval for one of these is not approval for the next one.

### Before writing code

- **Read `node_modules/next/dist/docs/` first.** This is Next.js 16; your memory of Next.js is probably older than this repo.
- Check whether a skill already covers the task: `add-page`, `spacetimedb-schema-change`, `debug-loading`, `stripe-billing-setup`. Follow it rather than improvising.
- Look for an existing composite or hook before writing a new one. This repo's biggest recurring defect is the fifth hand-rolled version of a component that already exists in `components/ui`.

### While working

- **Do the task asked, not the task nearby.** No opportunistic refactors, no reformatting untouched files, no "while I was in there" cleanups. If you spot something, mention it; don't fix it uninvited.
- **No placeholder implementations.** No mock data, no `TODO: implement`, no function that returns a hardcoded value, presented as finished work. If you can't complete it, say so.
- **Match the surrounding code** — its comment density, naming, and idiom. New code should be unrecognizable as new.
- **Don't reintroduce removed features.** POS integrations, website builder, design tools, customers, marketing, the hourly patrol, and the parent/sub-store ("multi-store") hierarchy were all deliberately deleted. Their leftover columns and tables stay in the schema; the features do not come back. Every organization is standalone: there is no share group, no `parentOrgId`, and nothing is shared between stores.
- **Mr. Merchiva lives in the dock** (`components/merchiva-dock/`): a chat on the right of `/manager` that stays until the user closes it. Two ways in only — ⌘⇧M (Ctrl+Shift+M) everywhere, and on desktop the rail on the right edge. Every browser tab has its own Merchiva and conversation. Don't add a button, menu row, omnibox action, chat channel or overlay window that opens him.

### When something breaks

- Report the actual error text. Don't paraphrase it into a guess.
- Two failed attempts at the same approach means stop and ask, not a third attempt.
- The Chrome extension cannot reach the localhost dev server — it shows an error page while `curl` gets a 200. Don't use it to verify local UI; ask the user for a screenshot instead.
