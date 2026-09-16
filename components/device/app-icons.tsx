"use client";

// Custom multi-colour app glyphs for the /store and /personal home grids.
// Flat illustration style: each glyph mixes 2–4 colours on a soft tinted
// tile so an app is recognisable by shape AND colour at a glance — helpful
// for staff who read slowly. 24×24 viewBox, colours are explicit (not
// currentColor) so they look the same in light and dark mode.

import type { ComponentType, SVGProps } from "react";
import { cn } from "@/lib/utils";
import { MerchivaLogo } from "@/components/logo";
import type { AppMode } from "@/lib/app-mode";

export type AppIcon = ComponentType<{ className?: string }>;

type P = { className?: string };

// Palette
const INK = "#1f2937";
const GRAY = "#9ca3af";
const LIGHT = "#e5e7eb";
const WHITE = "#ffffff";
const RED = "#ef4444";
const ORANGE = "#f97316";
const AMBER = "#f59e0b";
const YELLOW = "#fbbf24";
const GREEN = "#22c55e";
const TEAL = "#14b8a6";
const SKY = "#0ea5e9";
const BLUE = "#3b82f6";
const INDIGO = "#4f46e5";
const PURPLE = "#8b5cf6";
const PINK = "#ec4899";
const BROWN = "#b45309";

function Svg({ className, children, ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} {...rest}>
      {children}
    </svg>
  );
}

/** Clock: white face, dark hands, red second hand. */
export function PunchInIcon({ className }: P) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="10.5" fill={INK} />
      <circle cx="12" cy="12" r="8.4" fill={WHITE} />
      <path d="M12 7.2v5l3.2 2" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 12l-3.4 3.9" fill="none" stroke={RED} strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.2" fill={RED} />
    </Svg>
  );
}

/** Blue envelope with a white letter peeking out. */
export function RequestsIcon({ className }: P) {
  return (
    <Svg className={className}>
      <path d="M3 8.5h18V19a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 19z" fill={BLUE} />
      <rect x="6" y="4" width="12" height="9" rx="1.2" fill={WHITE} />
      <rect x="8" y="6.3" width="8" height="1.4" rx=".7" fill={GRAY} />
      <rect x="8" y="9" width="5" height="1.4" rx=".7" fill={GRAY} />
      <path d="M3 9.5l9 6.5 9-6.5V19a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 19z" fill="#60a5fa" />
    </Svg>
  );
}

/** White page, amber clip, blue text lines. */
export function DocsIcon({ className }: P) {
  return (
    <Svg className={className}>
      <path d="M6 2.5h8l5.5 5.5v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-15.5a2 2 0 0 1 2-2z" fill={WHITE} stroke={LIGHT} strokeWidth="1" />
      <path d="M14 2.5V8h5.5z" fill={LIGHT} />
      <rect x="7.5" y="11" width="9" height="1.8" rx=".9" fill={BLUE} />
      <rect x="7.5" y="14.4" width="9" height="1.8" rx=".9" fill={BLUE} opacity=".6" />
      <rect x="7.5" y="17.8" width="5" height="1.8" rx=".9" fill={BLUE} opacity=".6" />
      <rect x="4.6" y="4.5" width="4" height="6" rx="2" fill={AMBER} />
    </Svg>
  );
}

/** Two people in different colours. */
export function DirectoryIcon({ className }: P) {
  return (
    <Svg className={className}>
      <circle cx="16.2" cy="8" r="3.2" fill={ORANGE} />
      <path d="M11.8 21c0-3.6 2-6.3 4.4-6.3s4.4 2.7 4.4 6.3a1 1 0 0 1-1 1h-6.8a1 1 0 0 1-1-1z" fill={ORANGE} />
      <circle cx="8.5" cy="9" r="3.8" fill={TEAL} />
      <path d="M2 21c0-4.3 2.9-7.3 6.5-7.3S15 16.7 15 21a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" fill={TEAL} />
      <circle cx="8.5" cy="9" r="3.8" fill="none" stroke={WHITE} strokeWidth="1" />
      <path d="M2.7 21c0-4 2.6-6.6 5.8-6.6s5.8 2.6 5.8 6.6" fill="none" stroke={WHITE} strokeWidth="1" />
    </Svg>
  );
}

/** Three sliders with coloured knobs. */
export function SettingsIcon({ className }: P) {
  return (
    <Svg className={className}>
      <rect x="3" y="5.5" width="18" height="2.4" rx="1.2" fill={LIGHT} />
      <rect x="3" y="10.8" width="18" height="2.4" rx="1.2" fill={LIGHT} />
      <rect x="3" y="16.1" width="18" height="2.4" rx="1.2" fill={LIGHT} />
      <circle cx="15.5" cy="6.7" r="2.7" fill={BLUE} />
      <circle cx="8.5" cy="12" r="2.7" fill={GREEN} />
      <circle cx="13" cy="17.3" r="2.7" fill={ORANGE} />
    </Svg>
  );
}

/** Calendar: red header, white body, blue highlighted day. */
export function ScheduleIcon({ className }: P) {
  return (
    <Svg className={className}>
      <rect x="2.5" y="4.5" width="19" height="17" rx="2.5" fill={WHITE} stroke={LIGHT} strokeWidth="1" />
      <path d="M2.5 7A2.5 2.5 0 0 1 5 4.5h14A2.5 2.5 0 0 1 21.5 7v3h-19z" fill={RED} />
      <rect x="7" y="2" width="2.4" height="4.5" rx="1.2" fill={INK} />
      <rect x="14.6" y="2" width="2.4" height="4.5" rx="1.2" fill={INK} />
      <rect x="5.5" y="12.5" width="3.6" height="3.6" rx=".9" fill={BLUE} />
      <rect x="10.2" y="12.5" width="3.6" height="3.6" rx=".9" fill={LIGHT} />
      <rect x="14.9" y="12.5" width="3.6" height="3.6" rx=".9" fill={LIGHT} />
      <rect x="5.5" y="17" width="3.6" height="2.6" rx=".9" fill={LIGHT} />
      <rect x="10.2" y="17" width="3.6" height="2.6" rx=".9" fill={LIGHT} />
    </Svg>
  );
}

/** Checklist: white board, green check, one open box. */
export function TasksIcon({ className }: P) {
  return (
    <Svg className={className}>
      <rect x="3" y="2.5" width="18" height="19" rx="2.5" fill={WHITE} stroke={LIGHT} strokeWidth="1" />
      <rect x="8.5" y="1.5" width="7" height="3" rx="1.5" fill={GRAY} />
      <circle cx="8" cy="10.5" r="2.4" fill={GREEN} />
      <path d="M6.9 10.5l.8.8 1.5-1.6" fill="none" stroke={WHITE} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="12" y="9.6" width="6.5" height="1.8" rx=".9" fill={INK} />
      <circle cx="8" cy="16.5" r="2.4" fill="none" stroke={GRAY} strokeWidth="1.2" />
      <rect x="12" y="15.6" width="6.5" height="1.8" rx=".9" fill={GRAY} />
    </Svg>
  );
}

/** Graduation cap: navy cap, yellow tassel, open book below. */
export function TrainingIcon({ className }: P) {
  return (
    <Svg className={className}>
      <path d="M3 15.5c2.5-1.2 6-1.2 9 0 3-1.2 6.5-1.2 9 0V21c-2.5-1.2-6-1.2-9 0-3-1.2-6.5-1.2-9 0z" fill={WHITE} stroke={LIGHT} strokeWidth="1" />
      <path d="M12 15.5V21" stroke={LIGHT} strokeWidth="1" />
      <path d="M6.5 9.8v3.7c0 1.4 2.5 2.6 5.5 2.6s5.5-1.2 5.5-2.6V9.8L12 12.5z" fill={INDIGO} opacity=".75" />
      <path d="M12 2.5 1.5 7.6 12 12.7 22.5 7.6z" fill={INDIGO} />
      <path d="M20.5 7.6v5" stroke={YELLOW} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="20.5" cy="13.4" r="1.3" fill={YELLOW} />
    </Svg>
  );
}

/** Wallet: brown leather, teal card, yellow coin. */
export function PayIcon({ className }: P) {
  return (
    <Svg className={className}>
      <path d="M4 5h13a2 2 0 0 1 2 2v1.5H4z" fill="#92400e" />
      <rect x="2" y="7" width="20" height="14" rx="2.5" fill={BROWN} />
      <rect x="5" y="9.5" width="9" height="5.5" rx="1" fill={TEAL} />
      <path d="M13.5 11H22v6h-8.5a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2z" fill="#d97706" />
      <circle cx="15.7" cy="14" r="1.6" fill={YELLOW} />
    </Svg>
  );
}

/** Three cardboard boxes with tape. */
export function InventoryIcon({ className }: P) {
  return (
    <Svg className={className}>
      <rect x="2.5" y="12.5" width="9" height="9" rx="1.3" fill="#d97706" />
      <rect x="12.5" y="12.5" width="9" height="9" rx="1.3" fill="#d97706" />
      <rect x="7.5" y="2.5" width="9" height="9" rx="1.3" fill={AMBER} />
      <rect x="11" y="2.5" width="2" height="4" fill="#fde68a" />
      <rect x="6" y="12.5" width="2" height="4" fill="#fde68a" />
      <rect x="16" y="12.5" width="2" height="4" fill="#fde68a" />
      <rect x="7.5" y="7.6" width="9" height="1.2" fill="#b45309" opacity=".5" />
      <rect x="2.5" y="17.6" width="9" height="1.2" fill="#92400e" opacity=".5" />
      <rect x="12.5" y="17.6" width="9" height="1.2" fill="#92400e" opacity=".5" />
    </Svg>
  );
}

/** Pink price tag with a string and a yellow dollar. */
/** Wallet with a green bill and a coin — the sales & finance family. */
export function FinancesIcon({ className }: P) {
  return (
    <Svg className={className}>
      <rect x="2.5" y="5.5" width="19" height="14" rx="2.2" fill={INK} />
      <rect x="4.6" y="3.2" width="13" height="4.6" rx="1.6" fill={GRAY} />
      <rect x="2.5" y="9.2" width="19" height="2" fill={WHITE} opacity=".18" />
      <rect x="13.5" y="12" width="8" height="5" rx="1.3" fill={GREEN} />
      <circle cx="17.5" cy="14.5" r="1.5" fill={YELLOW} />
    </Svg>
  );
}

/** Delivery truck: brown cab, amber box, dark wheels — the inventory family. */
export function SuppliersIcon({ className }: P) {
  return (
    <Svg className={className}>
      <rect x="1.5" y="6.5" width="12" height="10" rx="1.3" fill={AMBER} />
      <path d="M13.5 9.5h4.2l3.3 3.4v3.6h-7.5z" fill={BROWN} />
      <rect x="15" y="10.8" width="3.4" height="2.6" rx=".6" fill={WHITE} opacity=".85" />
      <rect x="1.5" y="16.5" width="19.5" height="1.4" fill={INK} opacity=".25" />
      <circle cx="6.5" cy="18.4" r="2.6" fill={INK} />
      <circle cx="6.5" cy="18.4" r="1.1" fill={LIGHT} />
      <circle cx="17" cy="18.4" r="2.6" fill={INK} />
      <circle cx="17" cy="18.4" r="1.1" fill={LIGHT} />
    </Svg>
  );
}

/** Waste bin: red body, dark lid, white discard arrow. */
export function WasteIcon({ className }: P) {
  return (
    <Svg className={className}>
      <rect x="8.5" y="1.8" width="7" height="2.2" rx="1.1" fill={INK} />
      <rect x="3.8" y="4.2" width="16.4" height="2.8" rx="1.4" fill={INK} />
      <path d="M5.6 7.6h12.8l-1.1 12.1a2 2 0 0 1-2 1.8H8.7a2 2 0 0 1-2-1.8z" fill={RED} />
      <rect x="9" y="10.4" width="1.7" height="7.6" rx=".85" fill={WHITE} opacity=".75" />
      <rect x="13.3" y="10.4" width="1.7" height="7.6" rx=".85" fill={WHITE} opacity=".75" />
    </Svg>
  );
}

export function ProductsIcon({ className }: P) {
  return (
    <Svg className={className}>
      <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h6.8a2 2 0 0 1 1.4.6l8 8a2 2 0 0 1 0 2.8l-6.3 6.3a2 2 0 0 1-2.8 0l-8-8A2 2 0 0 1 3 11.3z" fill={PINK} />
      <circle cx="8" cy="8" r="1.8" fill={WHITE} />
      <path d="M8 6.2c0-2 1.2-3.7 2.8-4.2" fill="none" stroke={GRAY} strokeWidth="1.2" strokeLinecap="round" />
      <text x="13.2" y="16.6" fontSize="6.5" fontWeight="700" fill={YELLOW} fontFamily="Inter, Helvetica, Arial, sans-serif" textAnchor="middle" transform="rotate(-45 13.2 14.6)">$</text>
    </Svg>
  );
}

/** Rising bars in three colours with an arrow. */
export function SalesIcon({ className }: P) {
  return (
    <Svg className={className}>
      <rect x="3" y="13" width="4.6" height="8" rx="1.2" fill={ORANGE} />
      <rect x="9.7" y="9" width="4.6" height="12" rx="1.2" fill={BLUE} />
      <rect x="16.4" y="5" width="4.6" height="16" rx="1.2" fill={GREEN} />
      <path d="M4 9.5l6.5-4 5.5 2.5L20 3.5" fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 3h3.5v3.5" fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Calendar with sky header and a small clock. */
export function BookingsIcon({ className }: P) {
  return (
    <Svg className={className}>
      <rect x="2.5" y="4.5" width="19" height="17" rx="2.5" fill={WHITE} stroke={LIGHT} strokeWidth="1" />
      <path d="M2.5 7A2.5 2.5 0 0 1 5 4.5h14A2.5 2.5 0 0 1 21.5 7v3h-19z" fill={SKY} />
      <rect x="7" y="2" width="2.4" height="4.5" rx="1.2" fill={INK} />
      <rect x="14.6" y="2" width="2.4" height="4.5" rx="1.2" fill={INK} />
      <rect x="5.5" y="12.5" width="3.4" height="3.4" rx=".9" fill={LIGHT} />
      <rect x="5.5" y="17" width="3.4" height="2.6" rx=".9" fill={LIGHT} />
      <circle cx="15" cy="16" r="4.6" fill={INK} />
      <circle cx="15" cy="16" r="3.4" fill={WHITE} />
      <path d="M15 13.9V16l1.5 1" fill="none" stroke={RED} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Cash register: dark body, blue screen, green receipt. */
/** Screen with a sky display and a play mark. */
/** Four coloured tiles. */
export function DashboardIcon({ className }: P) {
  return (
    <Svg className={className}>
      <rect x="3" y="3" width="8" height="8" rx="2" fill={BLUE} />
      <rect x="13" y="3" width="8" height="8" rx="2" fill={GREEN} />
      <rect x="3" y="13" width="8" height="8" rx="2" fill={ORANGE} />
      <rect x="13" y="13" width="8" height="8" rx="2" fill={PURPLE} />
    </Svg>
  );
}

/** Teal person with a red heart. */
/** Blue and green chat bubbles. */
export function ChannelIcon({ className }: P) {
  return (
    <Svg className={className}>
      <path d="M9 3.5h9.5A2.5 2.5 0 0 1 21 6v5a2.5 2.5 0 0 1-2.5 2.5H15l-3 3v-3H9A2.5 2.5 0 0 1 6.5 11V6A2.5 2.5 0 0 1 9 3.5z" fill={BLUE} />
      <path d="M5.5 9H14a2.5 2.5 0 0 1 2.5 2.5V16a2.5 2.5 0 0 1-2.5 2.5h-3.3L7.5 22v-3.5h-2A2.5 2.5 0 0 1 3 16v-4.5A2.5 2.5 0 0 1 5.5 9z" fill={GREEN} />
      <circle cx="7.5" cy="13.8" r="1" fill={WHITE} />
      <circle cx="10.5" cy="13.8" r="1" fill={WHITE} />
      <circle cx="13.5" cy="13.8" r="1" fill={WHITE} />
    </Svg>
  );
}

/** Palette with paint dots. */
/** Storefront: red-and-white awning, gray wall, brown door. */
export function StoreSettingsIcon({ className }: P) {
  return (
    <Svg className={className}>
      <path d="M4 11h16v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 20z" fill={LIGHT} />
      <rect x="9.5" y="14" width="5" height="7.5" rx="1" fill={BROWN} />
      <rect x="15.5" y="13.5" width="3" height="3" rx=".6" fill="#93c5fd" />
      <path d="M3.5 3h17l1.5 5.5a3 3 0 0 1-3 2.5 3 3 0 0 1-2.9-2 3 3 0 0 1-2.9 2 3 3 0 0 1-2.9-2 3 3 0 0 1-2.9 2 3 3 0 0 1-2.9-2A3 3 0 0 1 2 8.5z" fill={RED} />
      <path d="M8.3 3l-.5 5.5a3 3 0 0 0 2.9 2.5 3 3 0 0 0 2.9-2.5L13.1 3z" fill={WHITE} />
    </Svg>
  );
}

/** App Store: blue bag with a white download arrow. */
export function AppStoreIcon({ className }: P) {
  return (
    <Svg className={className}>
      <path d="M5 8.5h14l-.9 11.2a2 2 0 0 1-2 1.8H7.9a2 2 0 0 1-2-1.8z" fill={BLUE} />
      <path d="M8.5 8.5V7a3.5 3.5 0 0 1 7 0v1.5" fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 11.5v6M9.3 14.9l2.7 2.7 2.7-2.7" fill="none" stroke={WHITE} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Mr. Merchiva: the brand mark on a dark round tile. */
export function MerchivaAppIcon({ className }: P) {
  return (
    <span className={cn("grid place-items-center rounded-full bg-neutral-900 p-[18%] text-white", className)}>
      <MerchivaLogo size={100} fg="#ffffff" className="h-full w-full" />
    </span>
  );
}

// ── App-mode icons (chooser, "back to device" links, manager-mode options) ──

/** Admin / manager: dark laptop with a coloured bar chart on screen. */
export function AdminModeIcon({ className }: P) {
  return (
    <Svg className={className}>
      <rect x="3.5" y="4" width="17" height="12" rx="1.8" fill={INK} />
      <rect x="5" y="5.5" width="14" height="9" rx=".9" fill={WHITE} />
      <rect x="7" y="10.5" width="2.4" height="3" rx=".5" fill={BLUE} />
      <rect x="10.8" y="8" width="2.4" height="5.5" rx=".5" fill={GREEN} />
      <rect x="14.6" y="6.5" width="2.4" height="7" rx=".5" fill={ORANGE} />
      <path d="M1.5 17.5h21l-.6 1.6a1.5 1.5 0 0 1-1.4 1H3.5a1.5 1.5 0 0 1-1.4-1z" fill={GRAY} />
      <rect x="9.5" y="17.5" width="5" height="1" rx=".5" fill={LIGHT} />
    </Svg>
  );
}

/** Personal: a phone with a teal person on screen. */
export function PersonalModeIcon({ className }: P) {
  return (
    <Svg className={className}>
      <rect x="6" y="1.5" width="12" height="21" rx="2.6" fill={INK} />
      <rect x="7.4" y="3.6" width="9.2" height="16.8" rx="1.4" fill={WHITE} />
      <circle cx="12" cy="9.2" r="2.6" fill={TEAL} />
      <path d="M7.9 17.4c0-2.9 1.9-4.9 4.1-4.9s4.1 2 4.1 4.9v.8a.8.8 0 0 1-.8.8H8.7a.8.8 0 0 1-.8-.8z" fill={TEAL} />
      <rect x="10.2" y="2.3" width="3.6" height=".9" rx=".45" fill={GRAY} />
      <circle cx="12" cy="21.3" r=".7" fill={GRAY} />
    </Svg>
  );
}

/** Store device: a landscape tablet with a red-and-white awning on screen. */
export function StoreModeIcon({ className }: P) {
  return (
    <Svg className={className}>
      <rect x="1.5" y="4.5" width="21" height="15" rx="2.4" fill={INK} />
      <rect x="3.4" y="6.2" width="17.2" height="11.6" rx="1.2" fill={WHITE} />
      <path d="M5.5 8.2h13l1 3a1.9 1.9 0 0 1-2.2 1.2 1.9 1.9 0 0 1-2.1-1.1 1.9 1.9 0 0 1-2.2 1.1 1.9 1.9 0 0 1-2.1-1.1 1.9 1.9 0 0 1-2.2 1.1 1.9 1.9 0 0 1-2.1-1.1A1.9 1.9 0 0 1 4.5 11.2z" fill={RED} />
      <path d="M9.9 8.2l-.3 3a1.9 1.9 0 0 0 2.2 1.2 1.9 1.9 0 0 0 2.1-1.2l-.3-3z" fill={WHITE} opacity=".85" />
      <rect x="8.2" y="13.2" width="3" height="3.4" rx=".6" fill={BROWN} />
      <rect x="12.6" y="13.2" width="3.6" height="2.2" rx=".5" fill="#93c5fd" />
      <circle cx="21.2" cy="12" r=".6" fill={GRAY} />
    </Svg>
  );
}

/** Icon per app mode (see lib/app-mode.ts). */
export const APP_MODE_ICONS: Record<AppMode, AppIcon> = {
  admin: AdminModeIcon,
  personal: PersonalModeIcon,
  store: StoreModeIcon,
};

/** Reports: white page with a blue line chart and green/orange bars. */
export function ReportsIcon({ className }: P) {
  return (
    <Svg className={className}>
      <path d="M6 2.5h8l5.5 5.5v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-15.5a2 2 0 0 1 2-2z" fill={WHITE} stroke={LIGHT} strokeWidth="1" />
      <path d="M14 2.5V8h5.5z" fill={LIGHT} />
      <rect x="7" y="15" width="2.4" height="4" rx=".5" fill={GREEN} />
      <rect x="10.8" y="12.5" width="2.4" height="6.5" rx=".5" fill={ORANGE} />
      <rect x="14.6" y="14" width="2.4" height="5" rx=".5" fill={GREEN} />
      <path d="M7 12l3.5-2.6 3 1.6 3.5-3" fill="none" stroke={BLUE} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Icon for a grid app id (built-ins + catalog ids); undefined when unknown. */
export const APP_ICONS: Record<string, AppIcon> = {
  "punch-in": PunchInIcon,
  merchiva: MerchivaAppIcon,
  requests: RequestsIcon,
  docs: DocsIcon,
  directory: DirectoryIcon,
  settings: SettingsIcon,
  schedule: ScheduleIcon,
  tasks: TasksIcon,
  training: TrainingIcon,
  pay: PayIcon,
  personnel: DirectoryIcon,
  inventory: InventoryIcon,
  suppliers: SuppliersIcon,
  waste: WasteIcon,
  finances: FinancesIcon,
  products: ProductsIcon,
  sales: SalesIcon,
  bookings: BookingsIcon,
  channel: ChannelIcon,
  "settings-org": StoreSettingsIcon,
};
