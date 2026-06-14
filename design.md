# BizOps Design System Prompt

You are building UI for **BizOps**, a Next.js 16 + SpacetimeDB app for small business daily management. Follow this design system exactly.

---

## Philosophy

- **Tools, not demos.** The UI must feel like professional software, not an AI template.
- **Density over whitespace.** Optimize for the fifth-time user, not the first-time visitor.
- **Borders over shadows.** Structure via 1px solid borders, never diffuse glows.
- **Monospace for data.** Prices, SKUs, timestamps, IDs always use `font-mono tabular-nums`.
- **Motion with purpose.** Instant feedback, 220ms transitions. No slow typewriter or particle effects.

---

## Color System

All colors use **oklch()** in CSS variables. The palette is achromatic Stone/Slate — no neon, no blue gradients, no high-saturation accent colors.

### Semantic Tokens (Light)

| Token | Value | Usage |
|---|---|---|
| `--background` | `oklch(1 0 0)` | Page background (white) |
| `--foreground` | `oklch(0.145 0 0)` | Primary text (near-black) |
| `--card` | `oklch(1 0 0)` | Card surfaces |
| `--primary` | `oklch(0.205 0 0)` | Buttons, active nav (dark stone) |
| `--primary-foreground` | `oklch(0.985 0 0)` | Text on primary |
| `--secondary` | `oklch(0.97 0 0)` | Secondary backgrounds |
| `--muted` | `oklch(0.97 0 0)` | Muted backgrounds |
| `--muted-foreground` | `oklch(0.556 0 0)` | Secondary text, captions |
| `--destructive` | `oklch(0.577 0.245 27.325)` | Error/danger red |
| `--border` | `oklch(0.922 0 0)` | All borders (light gray) |
| `--input` | `oklch(0.922 0 0)` | Input borders |
| `--ring` | `oklch(0.708 0 0)` | Focus ring |

### Semantic Tokens (Dark)

| Token | Value |
|---|---|
| `--background` | `oklch(0.145 0 0)` |
| `--foreground` | `oklch(0.985 0 0)` |
| `--card` | `oklch(0.205 0 0)` |
| `--primary` | `oklch(0.922 0 0)` |
| `--primary-foreground` | `oklch(0.205 0 0)` |
| `--secondary` | `oklch(0.269 0 0)` |
| `--muted` | `oklch(0.269 0 0)` |
| `--muted-foreground` | `oklch(0.708 0 0)` |
| `--border` | `oklch(1 0 0 / 10%)` |
| `--input` | `oklch(1 0 0 / 15%)` |

### Sidebar Tokens

```
Light: --sidebar: oklch(0.985 0 0), --sidebar-accent: oklch(0.97 0 0)
Dark:  --sidebar: oklch(0.205 0 0), --sidebar-primary: oklch(0.922 0 0)
```

### Chart Colors (Gray scale, both modes)

```
--chart-1: oklch(0.87 0 0)
--chart-2: oklch(0.556 0 0)
--chart-3: oklch(0.439 0 0)
--chart-4: oklch(0.371 0 0)
--chart-5: oklch(0.269 0 0)
```

### Status Colors (Hardcoded Tailwind)

- Success: `text-emerald-600`
- Warning: `text-amber-600`
- Error: `text-destructive`
- Muted: `text-stone-500`

---

## Typography

### Font Stack

| Purpose | Font | CSS Variable |
|---|---|---|
| UI & body | Inter | `--font-sans` |
| Data & code | Geist Mono | `--font-geist-mono` |

### Type Scale

| Level | Classes | Usage |
|---|---|---|
| Display | `text-3xl font-semibold tracking-tight` | Page headings |
| Heading | `text-xl font-semibold tracking-tight` | Section titles |
| Title | `text-lg font-medium` | Card titles |
| Body | `text-sm` | Default paragraph text |
| Label | `text-xs font-semibold uppercase tracking-wider` | Form labels, captions |
| Caption | `text-xs text-muted-foreground` | Help text, secondary info |
| Data | `font-mono text-sm tabular-nums` | Prices, numbers, IDs |
| Code | `font-mono text-xs` | SKUs, code blocks |

---

## Spacing & Radius

### Border Radius

**Base:** `--radius: 0.3rem` (3px) — sharp and structural, never soft/rounded.

| Token | Value |
|---|---|
| `--radius-sm` | 1.8px |
| `--radius-md` | 2.4px |
| `--radius-lg` | 3px (base) |
| `--radius-xl` | 4.2px |

Use `rounded-lg` on cards, buttons, inputs, dialogs.

### Spacing Tokens

| Gap | Pixels | Usage |
|---|---|---|
| `gap-0.5` | 2px | Tight inline spacing |
| `gap-1` | 4px | Button icon gaps |
| `gap-1.5` | 6px | Standard UI spacing |
| `gap-2` | 8px | Section spacing |
| `gap-2.5` | 10px | Sidebar items |
| `gap-3` | 12px | Card content |
| `gap-4` | 16px | Major sections |
| `gap-6` | 24px | Block spacing |
| `gap-8` | 32px | Page-level sections |

---

## Components

### Button

6 variants × 7 sizes. Uses `@base-ui/react` with haptic feedback.

**Variants:**
- `default` — `bg-primary text-primary-foreground hover:bg-primary/80`
- `outline` — `border-border bg-background hover:bg-muted`
- `secondary` — `bg-secondary text-secondary-foreground hover:bg-secondary/80`
- `ghost` — `hover:bg-muted hover:text-foreground`
- `destructive` — `bg-destructive/10 text-destructive hover:bg-destructive/20`
- `link` — `text-primary underline-offset-4 hover:underline`

**Sizes:**
- `xs` — `h-6 px-2 text-xs`
- `sm` — `h-7 px-2.5 text-[0.8rem]`
- `default` — `h-8 px-2.5 text-sm`
- `lg` — `h-9 px-2.5 text-sm`
- `icon` — `size-8`
- `icon-xs` — `size-6`
- `icon-sm` / `icon-lg` — `size-7` / `size-9`

**Base styling:** `rounded-lg border border-transparent font-medium transition-all`

### Input

```
h-8 w-full rounded-lg border border-input bg-transparent
px-2.5 py-1 text-base md:text-sm
focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50
aria-invalid:border-destructive aria-invalid:ring-destructive/20
```

### Card

```tsx
<Card>           {/* rounded-lg border border-border bg-card py-4 gap-4 */}
  <CardHeader>   {/* px-4, grid layout */}
    <CardTitle />
    <CardDescription />
    <CardAction /> {/* top-right aligned */}
  </CardHeader>
  <CardContent>  {/* px-4 */}
  <CardFooter>   {/* border-t bg-muted/50 p-4 */}
</Card>
```

Small variant: `size="sm"` → `py-3 gap-3`.

### Badge

`h-5 rounded px-2 py-0.5 text-xs font-medium`

Variants: `default`, `secondary`, `destructive`, `outline`, `ghost`, `link`.

### Table

```tsx
<Table>          {/* w-full caption-bottom text-sm */}
  <TableHeader>  {/* border-b */}
    <TableHead>  {/* h-8 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground */}
  <TableBody>
    <TableRow>   {/* border-b hover:bg-muted/50 */}
    <TableCell>  {/* py-2 px-3 whitespace-nowrap */}
```

### Dialog

- Overlay: `bg-black/10 backdrop-blur-xs`
- Mobile: swipe-to-dismiss support
- Safe open: waits for `document.readyState === "complete"`

### Icons

**Library:** Lucide React only.

| Context | Size |
|---|---|
| Default | `h-4 w-4` |
| Nav items | `h-[15px] w-[15px]` |
| Empty states | `h-10 w-10 text-muted-foreground` |
| Button icons | `h-3 w-3` (xs) to `h-4 w-4` (default) |

---

## Sidebar

**Width:** 220px desktop (64px collapsed), 280px mobile.

### Structure

```
┌─ Logo area ─────────────────────────────────┐
│  h-14 px-4 border-b                         │
│  Logo: h-7 w-7 rounded bg-foreground        │
│  Text: text-[13px] font-semibold "BizOps"   │
├─ Store switcher ────────────────────────────┤
│  px-3 py-2 border-b                         │
│  Dropdown: border bg-card shadow-md          │
├─ Nav items ─────────────────────────────────┤
│  px-2 py-3 space-y-0.5                      │
│  Each: flex items-center rounded text-[13px] │
│  Active:   bg-stone-900 text-white           │
│  Inactive: text-stone-600 hover:bg-stone-100 │
│  Icon: h-[15px] w-[15px]                    │
├─ Bottom links ──────────────────────────────┤
│  px-2 py-3 border-t space-y-0.5             │
│  Settings, Sign out, Collapse toggle         │
└─────────────────────────────────────────────┘
```

### Nav Items (with permission checks)

| Label | Icon | Permission |
|---|---|---|
| Dashboard | `LayoutDashboard` | `dashboard.view` |
| POS | `Monitor` | `pos.view` |
| Inventory | `Package` | `inventory.view` |
| Products | `ShoppingBag` | `products.view` |
| Sales | `TrendingUp` | `sales.view` |
| Staffing | `Users` | `staffing.view` |
| Team | `UserCog` | Owner/Manager only |

Items hidden when user lacks permission.

### Mobile Sidebar Behavior

- Swipe-in from left edge
- Snap threshold: 40% width or velocity > 0.3 px/ms
- Spring animation: 220ms ease-out
- Content scales: 0.92 → 1.0, translates: -30px → 0px
- Box shadow on reveal: `-4px 0 16px rgba(0,0,0,0.15)`

### Collapsed State (Desktop)

- Width: 64px
- Icons only, centered
- Tooltip on hover (delay: 0ms)
- Smooth width transition (200ms)

### Store Machine Mode

When in kiosk/store-machine mode:
- Top bar: `h-11 bg-stone-900 text-white font-mono`
- Shows "BIZOPS" + "ONLINE" badge (emerald-400 dot)
- Nav filtered to: POS, Inventory, Punch-In only
- Footer: `h-9 bg-stone-50 border-t text-[11px] text-stone-400 font-mono`

---

## Page Header

Desktop only (`hidden lg:flex`).

```
h-14 border-b border-border bg-white px-6
├─ Breadcrumbs (hidden xl:flex)
│  text-xs text-stone-500, current: text-stone-700
│  Separator: "/"
├─ Title: text-[15px] font-semibold leading-tight
├─ Subtitle: text-[11.5px] text-stone-500 (optional)
└─ Right actions: flex items-center gap-2
```

---

## Layout Structure

### Desktop

```
flex row, h-screen, overflow-hidden
├─ Sidebar (220px fixed, or 64px collapsed)
└─ Main (flex-1 flex-col)
   ├─ PageHeader (h-14, desktop only)
   └─ Content (flex-1 overflow-y-auto)
```

### Mobile

```
flex column, h-screen, overflow-hidden
├─ Floating hamburger button (top-left, z-50)
├─ Sidebar (fixed, slides in from left)
├─ Main content (absolute, safe-area-padded)
│  ├─ Tap-to-close overlay (when sidebar open)
│  └─ {children}
```

---

## Interaction States

### Focus

```
focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50
```

### Hover

- Buttons: bg opacity shift (variant-specific)
- Nav items: `hover:bg-muted hover:text-foreground`
- Table rows: `hover:bg-muted/50`

### Disabled

```
disabled:pointer-events-none disabled:opacity-50
```

### Invalid

```
aria-invalid:border-destructive aria-invalid:ring-destructive/20
```

---

## Loading, Empty & Error States

### Loading

- Spinner: `<Loader2 className="h-4 w-4 animate-spin" />`
- Page-level: full-screen centered spinner
- Button: show spinner inline, disable click

### Empty State

```
flex flex-col items-center justify-center gap-3 p-8 text-center
Icon: h-10 w-10 text-muted-foreground
Message: text-sm text-muted-foreground
```

### Error

- Toast notifications via Sonner (`position="top-center" richColors`)
- Inline: `text-destructive text-sm`

---

## Animations

| Animation | Duration | Easing | Usage |
|---|---|---|---|
| `slideUp` | 300ms | ease-out | Mobile sheets |
| `slideInRight` | 300ms | ease-out | Side panels |
| Sidebar transition | 220ms | cubic-bezier(0.4,0,0.2,1) | Expand/collapse |
| `animate-spin` | — | linear | Loading spinner |
| Dialog overlay | — | `animate-in/animate-out` | Open/close |

---

## Responsive Breakpoints

| Prefix | Width | Notes |
|---|---|---|
| (default) | 0+ | Mobile-first |
| `sm:` | 640px | |
| `md:` | 768px | |
| `lg:` | 1024px | Page header visible |
| `xl:` | 1280px | Breadcrumbs visible |

### Mobile Touch Targets

Min 44×44px for all interactive elements (`.mobile-device` class auto-applied).

### Safe Area Insets

```css
padding-top: env(safe-area-inset-top);
padding-bottom: env(safe-area-inset-bottom);
```

Applied to body and sidebar for notch/home-indicator support.

---

## Anti-Patterns (Never Do)

| Don't | Do Instead |
|---|---|
| `rounded-2xl`, `rounded-full` on cards | `rounded-lg` (0.3rem) |
| Neon/purple/blue gradient accents | Stone/Slate achromatic palette |
| Drop shadows, glow effects | 1px solid `border-border` |
| Hero sections, large whitespace | Compact tables, tight spacing |
| Slow typewriter, particle animations | Instant feedback, 220ms transitions |
| Custom CSS files per component | Tailwind utility classes |
| Icons other than Lucide | Lucide React, `h-4 w-4` default |
| `any` types freely | Only in Supabase row mappers with `eslint-disable` |
| Supabase calls from components | Through `lib/db/*.ts` only |

---

## File Reference

| Purpose | Path |
|---|---|
| CSS variables & tokens | `app/globals.css` |
| Tailwind (v4, CSS-based) | Configured in `globals.css` |
| Utility (`cn()`) | `lib/utils.ts` |
| Sidebar | `components/sidebar.tsx` |
| Page header | `components/page-header.tsx` |
| Permission guard | `components/permission-guard.tsx` |
| UI primitives | `components/ui/*.tsx` |
| Auth appearance | `lib/clerk-appearance.ts` |
| Type definitions | `lib/types.ts` |
| Design system showcase | `app/design-system/page.tsx` |
