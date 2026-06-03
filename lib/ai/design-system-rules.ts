/**
 * Shared UI/UX design-system rules injected into every AI prompt that
 * generates user-facing markup (builder chat/generate, design chat/generate).
 *
 * These describe the visual + accessibility baseline that AI-produced output
 * should satisfy. Per-route prompts append this verbatim so guidelines stay
 * consistent across surfaces — update them here, not in each route.
 *
 * Note on inline styles: the design route generates fixed-size poster HTML
 * where inline styles ARE the spec (no Tailwind available), so the inline-
 * style rule is opt-out there. Each route's prompt clarifies when Tailwind
 * is or isn't available; the AI honors the local override.
 */
export const DESIGN_SYSTEM_RULES = `UI/UX DESIGN-SYSTEM RULES — follow these whenever you emit interactive UI:

- Icons: default to Lucide React (already imported in the project, e.g. \`import { ShoppingCart, Check } from "lucide-react"\`). NEVER use emoji as icons. Icon size is a token: 14px for inline / 16px (h-4 w-4) default / 20px (h-5 w-5) for nav. Keep one size per surface — do not mix sizes.
- Icon style: stay outline-only. NEVER mix outline (lucide-react) with filled (lucide-react/solid, heroicons/solid, emoji glyphs) on the same surface.
- Touch targets: any tappable element MUST be at least 44 × 44 CSS pixels (iOS/Android minimum). Use padding + min-h-[44px] / min-w-[44px] when the visual is smaller.
- Spacing: use an 8dp rhythm. Allowed gaps/paddings/margins are multiples of 4px (4, 8, 12, 16, 20, 24, 32, 40, 48…). In Tailwind: gap-1, gap-2, gap-3, gap-4, gap-5, gap-6, gap-8, gap-10, gap-12. Do NOT use ad-hoc values like 7px / 13px / 23px.
- Motion: animations are 150–300ms. In Tailwind: \`duration-150\`, \`duration-200\`, \`duration-300\`. Use an easing that matches: \`ease-out\` for enter, \`ease-in\` for exit, default for both. Respect reduced motion with \`motion-safe:\`/\`motion-reduce:\` variants (or @media (prefers-reduced-motion: reduce) in CSS).
- Color: text contrast ≥ 4.5:1 against its background for body copy, ≥ 3:1 for large/bold text. Use the project's semantic tokens — \`text-foreground\`, \`text-muted-foreground\`, \`text-destructive\`, \`bg-background\`, \`bg-card\`, \`bg-muted\`, \`bg-primary\`, \`border-border\` — so dark mode just works. NEVER hard-code hex/rgb for body UI text or backgrounds.
- Dark mode: rely on the \`dark:\` variant + semantic tokens above. Don't write parallel light/dark trees with literal colors.
- Accessibility:
  - Every actionable control has a visible label OR an explicit \`aria-label\`. Icon-only buttons MUST have \`aria-label\`.
  - Preserve a logical focus order — don't \`tabIndex={-1}\` interactive controls and don't insert positive tabindex.
  - Form inputs are wired to <label htmlFor=…> (or aria-labelledby). Errors use \`aria-invalid\` + \`aria-describedby\`.
  - Visible focus ring on every focusable control (\`focus-visible:ring-2 focus-visible:ring-foreground/30\` or equivalent).
  - Respect prefers-reduced-motion (see Motion above).
- Styling: prefer Tailwind utility classes. Do NOT emit \`style="…"\` inline styles for UI components when Tailwind classes would do — they bypass theming and don't react to dark mode. (Exception: fixed-size graphic canvases — the design surface — where inline styles ARE the spec; the route-specific prompt will say so.)
- Safe area: full-screen / edge-pinned surfaces honor the iOS safe-area insets — use \`pt-[env(safe-area-inset-top)]\`, \`pb-[env(safe-area-inset-bottom)]\`, etc., or the project's \`getSafeAreaInsets()\` helper.
- Button feedback: every button has a hover state AND a pressed/active state. In Tailwind: \`hover:bg-muted active:bg-muted/80 active:scale-[0.98]\` or equivalent. Disabled state uses \`disabled:opacity-50 disabled:cursor-not-allowed\`.
- Corners + borders: project style is sharp — radius \`rounded\` (0.3rem) or \`rounded-[0.3rem]\`. Avoid \`rounded-2xl\` / \`rounded-full\` on cards. Use solid \`border border-border\`, not glow effects.`;
