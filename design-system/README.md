# Merchiva Design System

Snapshot of the design system **as it actually exists in the codebase** on 2026-09-11.
Everything below was read from `app/globals.css`, `components/ui/*`, `components/sidebar.tsx`,
`components/bottom-bar.tsx`, `components/page-tabs.tsx`, `components/page-header.tsx` and
`components/logo.tsx`. Where the older `design.md` (April 2026) disagrees with the code, the code wins
and the difference is listed in [Known drift](#known-drift).

Contents of this folder:

| File | What it is |
|:---|:---|
| `README.md` | This document |
| `index.html` | Visual reference page (open locally or see the published artifact) |
| `/design-system` route | `app/design-system/page.tsx` renders the same content with the real shadcn components |
| `tokens.css` | The `:root`, `.dark` and `@theme inline` blocks copied verbatim from `app/globals.css` |
| `logo/merchiva-logo.svg` | Primary mark, ink `#0c0a09` (same file as `public/logo.svg`) |
| `logo/merchiva-logo-white.svg` | Mark for dark grounds, ink `#fafafa` |
| `logo/merchiva-logo-tile.svg` | Mark on a 12%-radius near-black tile (app-icon style) |
| `logo/icon-192.png`, `logo/icon-512.png` | PWA / native icons (copied from `public/`) |
| `logo/merchiva-logo.tsx` | The React component (`MerchivaLogo`) copied from `components/logo.tsx` |

---

## 1. Principles

- **Tools, not demos.** Professional software for the fifth-time user, not a first-visit template.
- **Density over whitespace.** Compact tables, tight spacing. The base spacing unit is even 4% tighter than Tailwind's default.
- **Borders over shadows.** Structure comes from 1px solid `border-border`. Shadows are almost never used in the app shell.
- **Monospace for data.** Prices, SKUs, timestamps, IDs: `font-mono tabular-nums`.
- **Motion with purpose.** Instant feedback, 200–300ms transitions, spring taps on mobile. No typewriter or particle effects inside the app.
- **Semantic tokens first.** Use `text-foreground`, `bg-muted`, `border-border`. Direct `stone-*` classes are legacy and being replaced (commit 9952aaa, June 2026).

---

## 2. Color

Tokens are plain `rgb()` values in `app/globals.css`, mapped to Tailwind via `@theme inline`
(`--color-background: var(--background)` …). Dark mode is class-based: `.dark` on `<html>`
(`@custom-variant dark (&:is(.dark *))`). The palette is neutral gray (no hue bias).

### Semantic tokens

| Token | Light | Dark | Used for |
|:---|:---|:---|:---|
| `background` | `rgb(255 255 255)` | `rgb(10 10 10)` | Page ground |
| `foreground` | `rgb(10 10 10)` | `rgb(250 250 250)` | Primary text, active nav fill |
| `card` / `card-foreground` | `255` / `10` | `23` / `250` | Card surfaces |
| `popover` / `popover-foreground` | `255` / `10` | `38` / `250` | Menus, date/time pickers |
| `primary` / `primary-foreground` | `23` / `250` | `229` / `23` | Default button, checked controls |
| `secondary` / `secondary-foreground` | `245` / `23` | `38` / `250` | Secondary button, secondary badge |
| `muted` / `muted-foreground` | `245` / `115` | `38` / `161` | Hover fills, captions, table heads |
| `accent` / `accent-foreground` | `245` / `23` | `64` / `250` | Menu item hover |
| `destructive` / `destructive-foreground` | `rgb(231 0 11)` / `255` | `rgb(255 100 103)` / `250` | Errors, danger actions |
| `border` | `rgb(229 229 229)` | `rgb(40 40 40)` | All borders |
| `input` | `rgb(229 229 229)` | `rgb(52 52 52)` | Input borders, unchecked switch |
| `ring` | `rgb(161 161 161)` | `rgb(115 115 115)` | Focus ring (`ring-3 ring-ring/50`) |

(Single numbers are gray: `23` means `rgb(23 23 23)`.)

### Sidebar tokens

| Token | Light | Dark |
|:---|:---|:---|
| `sidebar` | `rgb(250 250 250)` | `rgb(23 23 23)` |
| `sidebar-foreground` | `rgb(10 10 10)` | `rgb(250 250 250)` |
| `sidebar-primary` | `rgb(23 23 23)` | `rgb(20 71 230)` |
| `sidebar-accent` | `rgb(245 245 245)` | `rgb(38 38 38)` |
| `sidebar-border` | `rgb(229 229 229)` | `rgb(40 40 40)` |

Note: the sidebar component itself uses `bg-background` / `bg-foreground`, not these tokens.

### Chart tokens (same in both modes)

`chart-1` `rgb(145 197 255)` · `chart-2` `rgb(58 129 246)` · `chart-3` `rgb(37 99 239)` · `chart-4` `rgb(26 78 218)` · `chart-5` `rgb(31 63 173)`

A single blue ramp, light to dark. This is the one place the palette has hue.

### Status colors (hardcoded Tailwind, by convention)

Counted across `app/manager` and `components`:

| Meaning | Text | Soft fill | Border | Dark variants |
|:---|:---|:---|:---|:---|
| Success | `text-emerald-600` / `-700` | `bg-emerald-50` | `border-emerald-200` | `text-emerald-400`, `bg-emerald-500` dots |
| Warning | `text-amber-600` / `-700` | `bg-amber-50` | `border-amber-200` | `bg-amber-950`, `border-amber-900`, `text-amber-300/400` |
| Danger | `text-red-600` / `-500` or `text-destructive` | `bg-red-50` | `border-red-200` | `text-destructive` |
| Info (rare) | `text-sky-*` | | | |
| Neutral | `text-muted-foreground` | `bg-muted` | `border-border` | |

`violet-*`, `orange-*`, `rose-*` appear in small numbers and are not standardized. `text-stone-*` still has ~800 usages; treat them as legacy.

### Presence colors (the one per-person hue)

`PRESENCE_COLORS` in `lib/presence/colors.ts` (re-exported by `lib/docs/colors.ts`): 8 muted hues from families the palette already has — `#2563eb #059669 #d97706 #dc2626 #0284c7 #1f3fad #57534e #047857`. `colorForMember(memberId)` (FNV-1a mod 8) gives each org member the same one on every device.

This is a deliberate exception to "hue only in status colors and charts", and it is limited to multi-user presence:

- Docs editor carets and remote selections.
- Live cursors on `/manager` pages (arrow + click ring) and their name tags: white 10px/600 text on the member's hue, the same flag shape as `.collaboration-carets__label`. Arrows get a white outline so the dark hues stay visible in dark mode.
- The 2px ring around presence avatars (sidebar row badges, the Docs header).

Mr. Merchiva's cursor is always neutral (`bg-foreground text-background`, foreground arrow with a background outline) so it never reads as a person. `Avatar` itself stays neutral, and nothing else gets a per-person color.

---

## 3. Typography

### Fonts loaded

`app/layout.tsx` loads two Google fonts with `next/font` and puts their variables on `<html>`:

| Role | Font | CSS variable | Tailwind class |
|:---|:---|:---|:---|
| UI, body | **Inter** | `--font-sans` | `font-sans` (default on `html`) |
| Data, code | **Geist Mono** | `--font-geist-mono` | see drift note: `font-mono` does **not** resolve to it |

### Type scale (as used)

| Level | Classes | Where |
|:---|:---|:---|
| Display | `text-3xl font-semibold tracking-tight` | Design-system page, landing |
| Heading | `text-xl font-semibold tracking-tight` | Section titles |
| Brand hero | `text-[28px] font-semibold leading-tight tracking-tight` | Auth brand panel |
| Title | `text-lg font-medium` / CardTitle `text-base font-medium leading-snug` | Card titles |
| Page title | `text-[15px] font-semibold leading-tight` | `PageHeader` |
| Nav / list item | `text-[13px] font-medium` | Sidebar items, store picker rows |
| Body | `text-sm` | Default text, table cells |
| Tab | `text-[12px] font-medium` | `PageTabs` |
| Subtitle | `text-[11.5px] text-muted-foreground` | `PageHeader` subtitle |
| Eyebrow / label | `text-[10.5px]` or `text-xs font-semibold uppercase tracking-wider text-muted-foreground` | Section labels, drawer titles |
| Micro label | `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground` | Picker headers, calendar weekdays |
| Bottom-bar label | `text-[10.5px] leading-none tracking-tight` (`font-semibold` active / `font-medium`) | Mobile nav |
| Data | `font-mono text-sm tabular-nums` / `font-mono text-[13px] tabular-nums font-medium` | Prices, IDs, selected date/time |
| Code | `font-mono text-xs` | SKUs, snippets |

Table head: `text-xs font-semibold uppercase tracking-wide text-muted-foreground`.

Mobile: `html.mobile-device { font-size: 16px }` and all inputs are forced to ≥16px on coarse pointers to prevent iOS zoom.

---

## 4. Radius, spacing, shadows

### Radius

`--radius: 0.15rem` (2.4px). Sharper than the 0.3rem the old doc describes.

| Token | Computed | Used by |
|:---|:---|:---|
| `rounded-lg` (`--radius-lg`) | 2.4px | Button, Input, Textarea, Select, Card, Tabs list, Dialog |
| `rounded-xl` | 6.4px | rarely |
| `rounded-md` | 0.4px (effectively square) | `xs`/`sm` buttons via `rounded-[min(var(--radius-md),10px)]`, tab triggers |
| `rounded-sm` | clamps to 0 | — |
| `rounded` (Tailwind default 4px) | 4px | Badge, sidebar nav items, brand panel cards, `rounded-[0.3rem]` on pickers |
| `rounded-full` | pill | Switch, bottom-bar active pill, badge counters, avatar dots |

Practical rule: use `rounded-lg` on controls and cards, `rounded` on small chips and nav rows, `rounded-full` only on pills/counters.

### Spacing

`--spacing: 0.24rem` (Tailwind default is 0.25rem), so every spacing utility is 4% tighter:

| Utility | Px |
|:---|:---|
| `gap-1` / `p-1` | 3.84 |
| `gap-1.5` | 5.76 |
| `gap-2` | 7.68 |
| `gap-2.5` / `px-2.5` | 9.6 |
| `gap-3` / `px-3` | 11.52 |
| `gap-4` / `px-4` | 15.36 |
| `px-6` | 23.04 |
| `h-7` | 26.9 |
| `h-8` | 30.7 |
| `h-14` | 53.8 |

Common rhythm: `gap-1.5` inline, `gap-2` between controls, `gap-3`/`gap-4` inside cards, `space-y-0.5` between nav rows.

### Shadows

`globals.css` defines a hard offset shadow set (`-2px -2px 0 0`, purple-tinted in light, black in dark) but the app shell does not use `shadow-*` classes except `shadow-md` on popovers/dropdowns and `shadow-sm` on the active tab trigger. Structure with borders.

---

## 5. Components (shadcn/ui, `base-nova` style, Base UI primitives)

Configured in `components.json`: style `base-nova`, base color `neutral`, CSS variables on, icons Lucide.
Available primitives: alert-dialog, badge, button, card, checkbox, combobox, context-menu, drawer, input, input-group, label, popover, progress, resizable, select, separator, sheet, switch, table, tabs, textarea, tooltip, loaders, skeleton-loaders.

### Button (`components/ui/button.tsx`)

Base: `inline-flex items-center justify-center rounded-lg border border-transparent text-sm font-medium transition-all focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px disabled:opacity-50`. Every click fires `hapticLight()`.

| Variant | Classes |
|:---|:---|
| `default` | `bg-primary text-primary-foreground hover:bg-primary/80` |
| `outline` | `border-border bg-background hover:bg-muted` (dark: `border-input bg-input/30`) |
| `secondary` | `bg-secondary text-secondary-foreground hover:bg-secondary/80` |
| `ghost` | `hover:bg-muted hover:text-foreground` |
| `destructive` | `bg-destructive/10 text-destructive hover:bg-destructive/20` |
| `link` | `text-primary underline-offset-4 hover:underline` |

| Size | Classes |
|:---|:---|
| `xs` | `h-6 px-2 text-xs gap-1`, icon `size-3` |
| `sm` | `h-7 px-2.5 text-[0.8rem] gap-1`, icon `size-3.5` |
| `default` | `h-8 px-2.5 gap-1.5`, icon `size-4` |
| `lg` | `h-9 px-2.5 gap-1.5` |
| `icon` / `icon-xs` / `icon-sm` / `icon-lg` | `size-8` / `size-6` / `size-7` / `size-9` |

### Input / Textarea / Select

- Input: `h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-base md:text-sm` + shared focus/invalid states. `type="date"` and `type="time"` render custom pickers (popover on desktop, Drawer on mobile).
- Textarea: `min-h-16 rounded-lg border border-input px-2.5 py-2 field-sizing-content`.
- Select trigger: `h-8` (`sm`: `h-7`) `rounded-lg border border-input pl-2.5 pr-2 text-sm`.
- Label: `text-sm font-medium leading-none`.
- Checkbox: `size-4 rounded-[4px] border-input`, checked `bg-primary`.
- Switch: `h-[18.4px] w-[32px]` (`sm`: `14×24`) `rounded-full`, checked `bg-primary`, unchecked `bg-input`.

Shared states: focus `focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50`; invalid `aria-invalid:border-destructive aria-invalid:ring-destructive/20`; disabled `opacity-50 pointer-events-none`.

### Card

`rounded-lg border border-border bg-card py-4 gap-4 text-sm` (`size="sm"`: `py-3 gap-3`).
Header/Content `px-4` (`sm`: `px-3`); Title `text-base font-medium leading-snug`; Description `text-sm text-muted-foreground`; Footer `border-t bg-muted/50 p-4`. `CardAction` sits top-right in the header grid.

### Badge

`h-5 rounded px-2 py-0.5 text-xs font-medium border border-transparent`. Variants mirror Button: `default`, `secondary`, `destructive` (`bg-destructive/10 text-destructive`), `outline` (`border-border text-foreground`), `ghost`, `link`.

### Table

- Header rows `border-b`; Head `h-8 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap`
- Row `border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted`
- Cell `py-2 px-3 align-middle whitespace-nowrap`
- Footer `border-t bg-muted/50 font-medium`

### Tabs (shadcn)

List `inline-flex h-8 rounded-lg p-[3px] text-muted-foreground` (`variant="line"` removes the pill). Trigger `rounded-md px-1.5 text-sm font-medium text-foreground/60`, active `bg-background text-foreground shadow-sm`.

### Overlays

- Dialog / AlertDialog / Drawer overlay: `bg-black/10 supports-backdrop-filter:backdrop-blur-xs` with `fade-in-0` / `fade-out-0`.
- Mobile sheets and menus use the shadcn **Drawer** (vaul), `max-h-[85vh]`, `DrawerTitle` styled `text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`.
- Popovers / dropdowns: `rounded-[0.3rem] border border-border bg-popover shadow-md animate-in fade-in-0 zoom-in-95`.
- Toasts: Sonner, `position="top-center" richColors`.
- Mr. Merchiva dock (Cmd/Ctrl+Shift+M, or the rail on desktop): a non-modal chat panel on the right — no scrim, no click-away, stays until the user closes it. Desktop: its own resizable column (220–680px, default 420) that collapses to a 44px rail with a vertical label. Other shells overlay it on the page. One conversation per browser tab.

### Icons

Lucide only. `h-4 w-4` default, `h-3.5 w-3.5` inside inputs and pickers, `h-[15px] w-[15px]` sidebar nav, `w-[19px] h-[19px]` bottom bar, `h-[20px] w-[20px]` in the mobile "more" drawer, `h-10 w-10 text-muted-foreground` for empty states.

---

## 5b. Shared composites (`components/ui/`, added 2026-09-11)

Built from the primitives above so pages stop hand-rolling the same blocks. Use these before writing a new `div` with a class soup.

| Component | File | Replaces | Key props |
|:---|:---|:---|:---|
| `StatusBadge` + `STATUS_TONE_CLASSES` / `STATUS_TONE_TEXT` / `STATUS_TONE_DOT` | `status-badge.tsx` | per-page emerald/amber/red/stone class maps, `rounded-full` pills | `tone: success \| warning \| danger \| info \| neutral`, `dot`, `size: sm \| xs` |
| `EmptyState` | `empty-state.tsx` | `py-16 text-center` + `opacity-40` icon blocks, dashed boxes | `icon`, `title`, `description`, `action`, `compact` |
| `StatTile`, `StatGrid` | `stat-tile.tsx` | `SummaryCard` / `StatCard` / `StatTile` copies in 7 pages | `label`, `value`, `sub`, `delta`, `deltaTone`, `icon`, `tone`, `size` |
| `Eyebrow` | `eyebrow.tsx` | six spellings of `text-[11px] uppercase tracking-*` | `size: sm (10.5px) \| xs (10px)`, `as` |
| `IconTile` | `icon-tile.tsx` | `h-8 w-8 rounded-[0.3rem] bg-muted` tiles | `icon`, `size: sm \| md \| lg`, `tone`, children for initials |
| `Num`, `Money`, `NumCell` | `num.tsx` | `font-mono` spans/cells missing `tabular-nums` | `value`, `muted`, `tone`, `size`; `Money` uses `useCurrency()` |
| `SegmentedControl` | `segmented-control.tsx` | hand-rolled `bg-foreground text-white` button rows, re-implemented TabsList | `options[{value,label,icon,count}]`, `value`, `onChange`, `variant: joined \| chips`, `size`, `fullWidth` |
| `OptionRow` | `option-row.tsx` | 11 full-width selectable `<button>` rows (plans, providers, locale) | `selected`, `onSelect`, `icon`/`leading`, `title`, `description`, `meta` |
| `DialogActions` | `dialog-actions.tsx` | copied `Separator` + cancel/confirm footers | `onCancel`, `onConfirm`, `saving`, `destructive`, `confirmType`, `secondary` |
| `Callout` | `callout.tsx` | `bg-amber-100 border-amber-300` banners | `tone`, `icon`, `title`, `action` |
| `Avatar` + `initials()` | `avatar.tsx` | 8 local initials helpers and colour ramps | `name`, `src`, `size: xs…xl`, `shape: circle \| square` |
| `Field` | `field.tsx` | raw `<label>` + `<input>` pairs, builder inspector rows | `label`, `htmlFor`, `hint`, `error`, `required`, `layout: stacked \| inline` |

Rules of thumb:

- Status hue is only ever one of the five tones. Orange, yellow, blue, rose, violet map onto them; do not add new ones.
- Loading: `Loader2 h-4 w-4 animate-spin` or the branded `Spinner` from `components/ui/loaders/geometric.tsx` inside buttons. Both are accepted; nothing else is.
- Skeletons come from `components/ui/skeleton-loaders.tsx`, not ad-hoc `animate-pulse` divs.

---

## 6. App shell and navigation

### Desktop layout (`app/manager/layout.tsx` + `components/sidebar.tsx`)

Three resizable panels in a `h-[100dvh]` row:

| Panel | Default | Min | Max | Collapsed |
|:---|:---|:---|:---|:---|
| Sidebar (`shell-left`) | 220px | 140px | 360px | 64px (collapses when dragged ≤70px) |
| Content | flex | | | |
| Right panel (`shell-right`, chat/notifications) | 420px | 220px | 680px | 44px |

Sidebar structure, top to bottom:

1. Logo row `h-14 px-4 border-b border-border` (collapsed: `px-2 justify-center`). Store logo tile `h-7 w-7`, name `text-[13px] font-medium`, `ChevronsUpDown h-3.5 w-3.5 text-muted-foreground`.
2. Store switcher `px-3 py-2 border-b`.
3. Nav `px-2 py-3 space-y-0.5`. Item: `flex items-center rounded text-[13px] font-medium gap-2.5 px-2.5 py-1.5 transition-colors`, icon `h-[15px] w-[15px]`.
   - Active: `bg-foreground text-background`
   - Inactive: `text-muted-foreground hover:text-foreground hover:bg-muted`
   - Sections with sub-pages expand inline; chevron `h-[14px] w-[14px] transition-transform duration-200`.
   - Unread counter: `h-4 min-w-[16px] px-1 rounded-full bg-foreground text-background text-[9.5px] font-bold`.
4. Bottom links `px-2 py-3 border-t`: notifications (Bell), Settings, collapse toggle (`PanelLeftOpen` / `PanelLeftClose`). Tooltips on hover when collapsed.

Width transition: `all 220ms cubic-bezier(0.4, 0, 0.2, 1)`.

### Mobile

- Sidebar `fixed inset-y-0 left-0 w-[280px]`, swipe in from the left edge.
- Bottom bar: `fixed bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md`. Each item `flex-1 flex-col items-center gap-1 min-h-[52px]`, icon inside a `h-8 w-14 rounded-full` pill (`bg-foreground/8` when active), active indicator `absolute top-0 h-[2px] w-7 rounded-full bg-foreground` shared via `layoutId`, tap `whileTap={{ scale: 0.9 }}` spring (damping 18, stiffness 450). Overflow items live in a "More" Drawer.
- Touch targets: `html.mobile-device` enforces `min-height/min-width: 44px` on buttons and links; card, table, dialog paddings are increased via `[data-slot]` selectors in `globals.css`.
- Safe areas: `body` gets `padding` from `env(safe-area-inset-*)`.

### Page header (`components/page-header.tsx`)

Desktop only: `hidden lg:flex h-14 border-b border-border bg-background items-center px-6 gap-3`.
Breadcrumbs `hidden xl:flex text-xs text-muted-foreground`, separator `/` in `text-border`, current crumb `text-foreground`. Title `text-[15px] font-semibold leading-tight truncate`; subtitle `text-[11.5px] text-muted-foreground`; actions `flex items-center gap-2` on the right.

### Page tabs (`components/page-tabs.tsx`)

Container `flex border-b border-border overflow-x-auto bg-background`. Tab `px-3.5 py-2 text-[12px] font-medium border-b-2 transition-colors`; active `border-foreground text-foreground`, inactive `border-transparent text-muted-foreground hover:text-foreground`. All hrefs use the `/manager/` prefix.

---

## 7. Logo

The mark is a single flat "M" path in a 100×100 viewBox:

```
M14 14 L40 14 L50 42 L60 14 L86 14 L86 86 L14 86 Z
```

Files in `logo/`. React usage: `<MerchivaLogo size={22} fg="#292524" />` (`fg` defaults to `currentColor`; `bg` and `rounded` add a 12%-radius tile).

| Context | Treatment |
|:---|:---|
| Auth brand panel | 22px mark, ink `#292524`, wordmark "Merchiva" `text-[13px] font-semibold tracking-tight` at `gap-2` |
| Sidebar / store tile | 28px (`h-7 w-7`) tile |
| App icon / favicon | Mark on near-black tile, 12% corner radius (`icon-192.png`, `icon-512.png`) |
| Dark grounds | `merchiva-logo-white.svg` (`#fafafa`) or `fg="currentColor"` on `text-background` |

Rules: never recolor with a hue; never add gradients or shadows; keep clear space of at least 14% of the mark's width (the inset of the path) on all sides.

---

## 8. Motion

| Animation | Spec | Where |
|:---|:---|:---|
| Sidebar width | 220ms `cubic-bezier(0.4,0,0.2,1)` | Expand / collapse |
| Bottom-bar tap | spring, damping 18, stiffness 450, scale 0.9 | Mobile nav items |
| Bottom-bar indicator | spring, damping 25, stiffness 350 | Shared `layoutId` |
| `slideUp` / `slideInRight` | 300ms ease-out | Legacy sheets / side panels |
| Dialog / drawer overlay | `fade-in-0` / `fade-out-0`, 100ms | Overlays |
| Popover | `fade-in-0 zoom-in-95` | Menus, pickers |
| Spinner | `<Loader2 className="h-4 w-4 animate-spin" />` | Loading |
| Presence cursor | spring, stiffness 500, damping 38, mass 0.6 (the dock's); click ring scale 0.4→1.6, fading out, 300ms; jumps and no ring with reduced motion | Live cursors on `/manager` pages |
| Landing-only | `mv-*` keyframes (reveal 700ms, marquee, shimmer) | `app/[locale]` marketing pages only |

Haptics: `hapticLight()` on button clicks, nav links and tab changes (Capacitor).

---

## 9. Breakpoints

| Prefix | Width | Notes |
|:---|:---|:---|
| default | 0+ | Mobile first |
| `sm:` | 640px | |
| `md:` | 768px | Inputs drop to `text-sm`; `lib/use-is-mobile` uses 768 for JS forks |
| `lg:` | 1024px | Page header and brand panel visible; landing switches layout |
| `xl:` | 1280px | Breadcrumbs visible |

---

## 10. Loading, empty and error states

- Page load: full-area centered `Loader2` spinner; skeletons from `components/ui/skeleton-loaders.tsx` for lists.
- Empty state: `flex flex-col items-center justify-center gap-3 p-8 text-center`, icon `h-10 w-10 text-muted-foreground`, message `text-sm text-muted-foreground`.
- Inline error: `text-destructive text-sm`. Toast errors via Sonner `richColors`.
- Every `useEffect` fetch must have `.catch()` and `.finally(() => setLoading(false))`.

---

## 11. Anti-patterns

| Don't | Do |
|:---|:---|
| `rounded-2xl`, `rounded-full` on cards | `rounded-lg` (2.4px) |
| Colored or glow shadows | 1px `border-border` |
| Blue/purple gradient accents | Neutral palette, hue only in status colors, charts and presence colors |
| `text-stone-900` / `text-stone-500` in new code | `text-foreground` / `text-muted-foreground` |
| Hero sections and generous whitespace inside `/manager/` | Compact headers, dense tables |
| Per-component CSS files | Tailwind utilities |
| Non-Lucide icons | Lucide, `h-4 w-4` |
| Landing `mv-*` animations inside the app | Micro transitions only |

---

## Known drift

Differences between the code and the older `design.md` / `app/design-system/page.tsx`, worth fixing or at least knowing about:

1. **Radius is 0.15rem, not 0.3rem.** `--radius` changed in commit 3344896 (2026-05-17). `design.md`, the showcase page copy and a few hardcoded `rounded-[0.3rem]` in pickers still assume 0.3rem. `--radius-sm` now computes to a negative value (clamps to 0) and `--radius-md` to 0.4px.
2. **Tokens are `rgb()`, not `oklch()`.** The showcase page description still says oklch.
3. **Chart colors are a blue ramp**, not the gray ramp the old doc lists.
4. **Font declarations conflict.** `globals.css :root` declares `--font-sans: Cascadia Code…` and `--font-mono: JetBrains Mono…` (left over from a pasted theme), while `layout.tsx` sets `--font-sans` to Inter on the same `<html>` element. Which wins depends on stylesheet order. Also, Geist Mono is loaded as `--font-geist-mono` but `@theme` maps `font-mono` to `--font-mono` (JetBrains Mono, not loaded), so `font-mono` falls back to the system monospace. Fix: set `--font-mono: var(--font-geist-mono)` in `@theme inline` and delete the Cascadia/JetBrains lines.
5. **`font-heading` on `CardTitle` is undefined** in the theme, so it silently inherits Inter. Harmless, but either define `--font-heading` or drop the class.
6. **Dark `sidebar-primary` is blue** `rgb(20 71 230)` while everything else is neutral. Unused by the sidebar component today.
7. **`--spacing: 0.24rem`** makes every spacing utility 4% smaller than stock Tailwind. Intentional density or theme artifact; either way, don't mix in hardcoded px values that assume a 4px grid.
8. `design.md` still references BizOps, Supabase and Clerk. This README supersedes it.
