# Agent Rules — Merchiva

## What Is This

Merchiva is a daily management platform for small businesses. It handles inventory, sales, staffing, products, pricing, customers, marketing, finances, reports, bookings, reviews, suppliers, training — plus a website builder and team chat. It connects to Square and Clover POS systems, uses SpacetimeDB as the sole data layer (no Supabase), and ships as a web app (Vercel) and native app (Capacitor).

## Tech Stack

| Layer | Tool | Notes |
|:---|:---|:---|
| Runtime | Bun | `bun install`, `bun run dev`. No npm/yarn. |
| Framework | Next.js 16 (App Router) | **Read `node_modules/next/dist/docs/` before writing code.** |
| Language | TypeScript (strict) | No `any` except SpacetimeDB row mappers with `eslint-disable`. |
| UI | shadcn/ui v4 | Only import what you use. |
| Styling | Tailwind CSS v4 | Utility-first. No per-component CSS files. |
| Icons | Lucide React | `h-4 w-4` default, `h-5 w-5` for nav. |
| Charts | Recharts | All data visualization. |
| Database | SpacetimeDB | Sole data layer. Real-time subscriptions. Generated types in `lib/spacetimedb/generated/`. |
| POS | Square SDK (v44+), Clover | OAuth flow, sync to SpacetimeDB. |
| Auth | WorkOS (`lib/auth/workos.ts`) | Email/password, OAuth. Session via cookies. |
| Builder | Craft.js (`@craftjs/core`) | Visual page builder with drag-and-drop components. |
| File Upload | UploadThing | Image uploads for products, sites, avatars. |
| Email | Resend | Transactional emails (invites, etc.). |
| i18n | Custom (`lib/i18n/`) | 6 locales: en, zh, es, fr, ar, hi. |
| Native | Capacitor (iOS + Android) | Loads from Vercel URL. Haptics, safe area, status bar. |
| Animation | Motion (Framer Motion) | Page transitions, micro-interactions. |
| Deploy | Vercel | `npx vercel --prod --yes`. |

## Route Structure

All authenticated pages live under `/manager/`. Public pages are at root.

```
app/
├── manager/                        # Authenticated app (sidebar + bottom bar)
│   ├── layout.tsx              # Auth guard, SpacetimeDB provider, sidebar
│   ├── dashboard/
│   ├── inventory/              # + inventory/waste/ sub-route
│   ├── sales/
│   ├── staffing/
│   ├── products/               # + products/[productId]/ sub-route
│   ├── pricing/
│   ├── customers/
│   ├── marketing/
│   ├── finances/
│   ├── reports/
│   ├── bookings/
│   ├── reviews/
│   ├── suppliers/
│   ├── training/
│   ├── membership/
│   ├── builder/                # + builder/[siteId]/, [siteId]/theme/, [siteId]/membership/
│   ├── chat/
│   ├── settings/
│   ├── pos/                    # POS terminal mode
│   ├── punch-in/               # Staff punch clock
│   ├── display/                # Store display mode
│   └── api-settings/
├── (auth)/login/, signup/      # Public auth
├── choose/                     # Post-sign-in mode picker (admin / personal / store device); layout re-exports manager layout
├── store/                      # Store device surface (shared tablet: QR/PIN log-in, walkie-talkie, apps); bare route, reuses manager layout for auth
├── personal/                   # Personal device surface (employee phone: channels, punch-in, leave drawer); bare route, reuses manager layout for auth
├── api/                        # Route handlers
│   ├── auth/                   # sign-in, sign-up, callback, oauth, refresh, verify-*
│   ├── square/                 # catalog, inventory, orders, sync, validate, oauth/*
│   ├── clover/                 # connect, callback, disconnect, sync
│   ├── ai/                     # predict, train
│   ├── forecast/               # forecast, weather, popular-times
│   ├── payments/               # create-session, verify, refund
│   ├── builder/                # chat, generate (AI site builder)
│   ├── chat/                   # AI assistant
│   ├── sites/publish/
│   ├── store-ai/
│   ├── team/                   # invite, accept, send-invite-email
│   └── uploadthing/
├── s/[slug]/                   # Published storefront (public)
├── preview/[siteId]/           # Site preview
├── pricing/, features/, about/, changelog/   # Landing pages
├── setup/                      # First-time org setup
└── invite/[token]/             # Accept team invite
```

## Key Directories

```
lib/
├── spacetimedb/
│   ├── client.ts               # SpacetimeDB connection
│   ├── provider.tsx            # React context provider
│   ├── auth.ts                 # SpacetimeDB auth bridge
│   ├── actions.ts              # Reducer call wrappers
│   ├── hooks.ts                # Data subscription hooks
│   ├── hooks/                  # Domain-specific hooks (useInventory, useSales, etc.)
│   └── generated/              # Auto-generated tables + reducers (DO NOT EDIT)
├── db/                         # Legacy data access (being phased out)
├── auth/                       # WorkOS auth (context + server helpers)
├── builder/                    # Craft.js bridge, page templates, site values
├── i18n/                       # Config, context, dictionary loader
└── (other utilities)           # capacitor, haptics, theme, offline, forecast, etc.

components/
├── ui/                         # shadcn/ui primitives
├── device/                     # Shared device-surface pieces (walkie-talkie, PIN pad, idle lock, QR, apps grid) used by /store and /personal
├── store-device/               # /store-only composition
├── personal-device/            # /personal-only composition
├── builder/                    # Website builder (editor, panels, craft-components/, craft-settings/)
├── site-elements/              # Published site components (booking-form, login, gallery, etc.)
├── flowfn/                     # Visual flow/function editor
├── landing/                    # Public marketing pages
├── sidebar.tsx                 # Desktop navigation
├── bottom-bar.tsx              # Mobile navigation
├── page-tabs.tsx               # Sub-page tab groups
├── page-header.tsx             # Page title bar
├── page-transition.tsx         # Route transition animation
├── permission-guard.tsx        # Client-side permission gate
├── notification-center.tsx     # In-app notifications
└── mobile-shell.tsx            # Capacitor native shell
```

## Data Layer (SpacetimeDB)

- Real-time subscriptions via `lib/spacetimedb/hooks.ts` and domain hooks in `hooks/`.
- Mutations via reducer calls in `lib/spacetimedb/actions.ts`.
- Generated types in `lib/spacetimedb/generated/` — **never edit these manually**.
- Provider wraps the app in `app/manager/layout.tsx`.
- No Supabase. `lib/db/*.ts` files are legacy and being phased out.
- Module source: `spacetimedb/src/index.ts`. Published to maincloud via `spacetime publish`.

### Schema Migration Rules (CRITICAL)

**Adding columns to existing tables:**
- New columns MUST go at the **end** of the table definition, after all existing columns. Inserting between columns causes a "reorder" error that forces `--delete-data` (destroys all rows).
- New columns should use `t.option(...)` so existing rows default to `null`.
- Publish command: `spacetime publish merchiva --server maincloud --yes`. Do NOT use `--delete-data` unless the user explicitly approves. `--delete-data=on-conflict` **will delete data** if there's any schema conflict — always warn first.
- After publish, run `spacetime generate` to regenerate TypeScript types.

### Navigation Tabs
Pages are grouped with `PageTabs`. All hrefs must use the `/manager/` prefix:
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
| admin | `/manager` | The original back-office shell (sidebar / bottom bar) — this is the "manager" UI |
| personal | `/personal` | Employee phone surface |
| store | `/store` | Shared store tablet surface |

`/store` and `/personal` render bare (no MobileShell) through the manager layout for auth + providers. When a store/personal device opens `/manager` ("Switch to manager mode") it sets the session flag `merchiva_manager_override` so the sidebar account menu shows "Back to store device / personal". The legacy `store_machine_mode` flag is no longer set by the chooser.

## Auth & Permissions

- WorkOS handles auth (email/password + OAuth).
- Multi-tenant: Organizations → org_members (owner/manager/staff roles).
- Permissions stored as JSONB on org_members.
- `usePermissions()` hook + `<PermissionGuard section="...">` for access control.
- Sidebar and bottom bar auto-hide pages the user can't access.

## Visual Style

Build tools, not demos. Professional software, not AI templates.

| Element | Do | Don't |
|:---|:---|:---|
| Palette | Stone/Slate, pure white, deep gray | Neon, gradients, high-saturation |
| Radius | `0.3rem` (sharp) | `rounded-2xl`, `rounded-full` on cards |
| Shadows | Solid `1px border` | Glow effects, colored shadows |
| Font | Inter for UI, Geist Mono for data | Rounded sans-serif |
| Motion | Instant feedback, micro transitions | Typewriter effects, particles |
| Density | Compact tables, tight spacing | Hero sections, excessive whitespace |

## Code Conventions

- Client components: `"use client"` at top. Server components: no directive.
- Files: kebab-case. Components: PascalCase. DB columns: snake_case. TS props: camelCase.
- Always add loading states (`Loader2` spinner) and empty states.
- All internal links within the app use `/manager/` prefix.
- i18n: use `useT()` hook, keys in `messages/{locale}.json`.

## Environment Variables

- `NEXT_PUBLIC_SPACETIMEDB_*` — SpacetimeDB connection (public)
- `WORKOS_API_KEY` / `WORKOS_CLIENT_ID` — server-only
- `UPLOADTHING_TOKEN` — file upload
- `RESEND_API_KEY` — transactional email
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — server-only, for SaaS billing
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — client-side (optional for Checkout)
- `STRIPE_PRO_MONTHLY_PRICE_ID` / `STRIPE_PRO_YEARLY_PRICE_ID` — Stripe Price ids for the Pro plan
- `NEXT_PUBLIC_APP_URL` — fallback origin for Stripe success/cancel URLs (used when request `origin` header is empty)
- Square / Clover credentials stored in DB, not env vars

## Stripe Setup

Source of truth for plans/prices is Stripe Dashboard (no local plan table).

1. Stripe Dashboard → Products → create "Merchiva Pro" with two recurring prices: monthly + yearly.
2. Copy each price id into env (`STRIPE_PRO_MONTHLY_PRICE_ID`, `STRIPE_PRO_YEARLY_PRICE_ID`).
3. Stripe Dashboard → Webhooks → add endpoint `https://<host>/api/billing/webhook`, listen for: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `checkout.session.completed`. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
4. Local dev: `stripe listen --forward-to localhost:3000/api/billing/webhook` then paste the printed `whsec_…` into `.env.local`.

Subscription state on org rows (`organization.stripeCustomerId`, `subscriptionStatus`, `subscriptionPriceId`, `subscriptionInterval`, `currentPeriodEnd`) is a CACHE — Stripe is canonical. The `/api/billing/sync` route refreshes from Stripe and the client persists via the `updateOrgSubscription` reducer. The webhook currently just verifies signatures and logs; once a server-side SpacetimeDB service identity is wired up it can write directly.

## Deployment

1. `bun run build` — must pass clean
2. `npx vercel --prod --yes`
3. Native: `npx cap sync` then open in Xcode / Android Studio
