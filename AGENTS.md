# Agent Development Rules — Merchiva

## Project Overview

Merchiva is an AI-powered inventory prediction and daily management system for small businesses. It connects to Square POS for real data, uses Supabase for auth and storage, and provides sales forecasting, staffing management, and product performance tracking.

---

## 1. Tech Stack (Non-Negotiable)

| Layer | Tool | Notes |
|:---|:---|:---|
| **Runtime** | Bun | Use `bun install`, `bun run dev`. No npm/yarn. |
| **Framework** | Next.js 16 (App Router) | **Read `node_modules/next/dist/docs/` before writing any code.** APIs may differ from training data. |
| **Language** | TypeScript | Strict mode. No `any` except Supabase row mappers (mark with `eslint-disable`). |
| **UI** | shadcn/ui v4 | Only import components you actually use. No UI bloat. |
| **Styling** | Tailwind CSS v4 | Utility-first. No custom CSS files per component. |
| **Icons** | Lucide React | `1.5px` stroke weight. Consistent sizing (`h-4 w-4` or `h-5 w-5`). |
| **Charts** | Recharts | For all data visualization. |
| **Auth + DB** | Supabase (@supabase/ssr) | Server client for layouts/API routes. Browser client for client components. |
| **POS Integration** | Square SDK (v44+) | Uses `SquareClient` not legacy `Client`. Always check SDK docs. |
| **Deployment** | Vercel | `npx vercel --prod --yes` to deploy. |

---

## 2. Visual Philosophy: Anti-AI Aesthetics

We build **tools**, not **demos**. The UI must feel like professional software, not an AI template.

| Element | Do | Don't |
|:---|:---|:---|
| **Palette** | `Stone` / `Slate` tones, pure white, deep gray | Neon purple, blue gradients, high-saturation colors |
| **Radius** | `--radius: 0.3rem` (sharp, compact) | `rounded-2xl`, `rounded-full` on cards |
| **Shadows** | Solid `1px border` or ultra-thin inset shadow | Diffuse glow effects, colored shadows |
| **Font** | `Geist Mono` / system monospace for data, Inter for UI | Overly rounded sans-serif |
| **Motion** | Instant feedback, micro translations | Slow typewriter effects, particle animations |
| **Density** | Compact tables, tight spacing | Excessive whitespace, hero sections |

---

## 3. Project Structure

```
project-management/
├── app/
│   ├── (app)/                  # Authenticated routes (sidebar layout)
│   │   ├── layout.tsx          # Auth guard + PermissionsProvider
│   │   ├── dashboard/page.tsx
│   │   ├── inventory/page.tsx
│   │   ├── sales/page.tsx
│   │   ├── staffing/page.tsx
│   │   ├── products/page.tsx
│   │   ├── team/page.tsx       # Owner/manager only
│   │   └── settings/page.tsx
│   ├── (auth)/                 # Public auth routes
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── api/
│   │   ├── square/             # Square API proxy routes
│   │   │   ├── catalog/route.ts
│   │   │   ├── inventory/route.ts
│   │   │   ├── orders/route.ts
│   │   │   ├── sync/route.ts
│   │   │   └── validate/route.ts
│   │   └── team/
│   │       └── invite/route.ts
│   ├── invite/[token]/page.tsx # Accept invitation flow
│   ├── globals.css
│   ├── layout.tsx              # Root layout (font, metadata)
│   └── page.tsx                # Redirect to /dashboard
├── components/
│   ├── ui/                     # shadcn/ui primitives
│   ├── sidebar.tsx             # Navigation (permission-filtered)
│   └── permission-guard.tsx    # Client-side permission gate
├── lib/
│   ├── supabase/
│   │   ├── client.ts           # Browser client (createBrowserClient)
│   │   └── server.ts           # Server client (createServerClient)
│   ├── db/                     # Data access layer (one file per domain)
│   │   ├── inventory.ts
│   │   ├── sales.ts
│   │   ├── staffing.ts
│   │   ├── products.ts
│   │   ├── settings.ts
│   │   └── team.ts
│   ├── context/
│   │   └── permissions.tsx     # React context for role-based access
│   ├── types.ts                # All TypeScript interfaces
│   └── utils.ts                # cn() helper
└── supabase/
    └── schema.sql              # Full database schema (reference only)
```

---

## 4. Data Layer Rules

### Supabase Client Usage
- **Server Components / API Routes:** `import { createClient } from "@/lib/supabase/server"`
- **Client Components:** `import { createClient } from "@/lib/supabase/client"`
- Never mix them.

### Database Access Pattern
- All DB queries go through `lib/db/*.ts` — never call Supabase directly from components.
- Every query function maps snake_case DB columns to camelCase TypeScript interfaces.
- Always handle errors: use `.catch()` + `.finally(() => setLoading(false))` in useEffect.
- Include `user_id` and `organization_id` when inserting new rows.

### Row Level Security (RLS)
- Every table has RLS enabled.
- Policy pattern: `auth.uid() = user_id OR organization_id IN (active org_members)`.
- Never disable RLS. Never use service role key in client code.

---

## 5. Auth & Permissions

### Roles
| Role | Access |
|:---|:---|
| `owner` | Full access to everything. Can manage team. |
| `manager` | Access determined by owner-assigned permissions. Can invite staff. |
| `staff` | Access determined by owner-assigned permissions. Read-only by default. |

### Permissions Structure (JSONB)
```typescript
interface Permissions {
  dashboard:  { view: boolean };
  inventory:  { view: boolean; edit: boolean };
  sales:      { view: boolean };
  staffing:   { view: boolean; edit: boolean };
  products:   { view: boolean; edit: boolean };
  settings:   { view: boolean };
}
```

### Implementation
- `PermissionsProvider` wraps the app layout (server-side fetch, client-side context).
- `usePermissions()` hook for checking access in components.
- `<PermissionGuard section="inventory">` wraps each page.
- Sidebar auto-hides pages the user can't access.

---

## 6. Square API Integration

- All Square calls go through `/api/square/*` route handlers (never client-side).
- Route handlers read Square credentials from Supabase `settings` table.
- Use `SquareClient` (v44+), not the legacy `Client` constructor.
- Square integration is opt-in: app works without it, showing empty states.
- Sync flow: Square → Supabase tables (products, inventory_items, sales_records).

---

## 7. Code Conventions

### Components
- One component per file. File name matches export name.
- Client components: `"use client"` at top.
- Server components: no directive (default).
- Always add loading states (`Loader2` spinner) and empty states.

### Naming
- Files: kebab-case (`permission-guard.tsx`)
- Components: PascalCase (`PermissionGuard`)
- DB columns: snake_case (`current_stock`)
- TS interfaces: camelCase properties (`currentStock`)

### Error Handling
```tsx
// ALWAYS use this pattern for client-side data loading
useEffect(() => {
  loadData()
    .then(setData)
    .catch((err) => console.error("Failed:", err))
    .finally(() => setLoading(false));
}, []);
```

### Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase publishable key
- `SUPABASE_SERVICE_ROLE_KEY` — Server-only, never expose to client
- Square credentials stored in DB, not env vars

---

## 8. Deployment Checklist

1. `bun run build` — must pass with 0 errors
2. Verify `.env.local` has all required vars
3. Verify `.gitignore` includes `.env*`
4. `npx vercel --prod --yes` to deploy
5. Check Vercel deployment logs for runtime errors

---

## 9. Database Schema Reference

7 core tables + 3 team tables, all with RLS:

**Core:** `settings`, `inventory_items`, `inventory_transactions`, `sales_records`, `staff_members`, `shifts`, `products`

**Team:** `organizations`, `org_members`, `org_invitations`

All tables have `user_id` (FK to auth.users) and `organization_id` (FK to organizations, nullable for backward compat).

See `supabase/schema.sql` for full DDL.
