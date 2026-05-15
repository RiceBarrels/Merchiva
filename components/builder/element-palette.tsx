"use client";

import { useEditor } from "@craftjs/core";
import {
  Type,
  Image,
  MousePointerClick,
  SeparatorHorizontal,
  AlignJustify,
  Square,
  Columns2,
  ShoppingBag,
  ShoppingCart,
  CreditCard,
  Tag,
  Star,
  HelpCircle,
  GalleryHorizontalEnd,
  Code2,
  FileCode2,
  LogIn,
  Crown,
  Gift,
  LayoutDashboard,
  Navigation,
  PanelBottom,
  MoveVertical,
  Monitor,
  SmilePlus,
} from "lucide-react";
import { CraftText } from "./craft-components/craft-text";
import { CraftImage } from "./craft-components/craft-image";
import { CraftButton } from "./craft-components/craft-button";
import { CraftLayout } from "./craft-components/craft-layout";
import { CraftViewport } from "./craft-components/craft-viewport";
import { CraftHero } from "./craft-components/craft-hero";
import { CraftNav } from "./craft-components/craft-nav";
import { CraftFooter } from "./craft-components/craft-footer";
import { CraftDivider } from "./craft-components/craft-divider";
import { CraftSpacer } from "./craft-components/craft-spacer";
import { CraftColumns } from "./craft-components/craft-columns";
import { CraftIcon } from "./craft-components/craft-icon";
import { CraftProductCard } from "./craft-components/craft-product-card";
import { CraftBookingForm } from "./craft-components/craft-booking-form";
import { CraftCouponBanner } from "./craft-components/craft-coupon-banner";
import { CraftPricingTable } from "./craft-components/craft-pricing-table";
import { CraftTestimonial } from "./craft-components/craft-testimonial";
import { CraftFaq } from "./craft-components/craft-faq";
import { CraftGallery } from "./craft-components/craft-gallery";
import { CraftCustomHtml } from "./craft-components/craft-custom-html";
import { CraftLoginForm } from "./craft-components/craft-login-form";
import { CraftCodeBlock } from "./craft-components/craft-code-block";
import { CraftMembershipWidget } from "./craft-components/craft-membership-widget";
import { CraftCart } from "./craft-components/craft-cart";
import { CraftCheckout } from "./craft-components/craft-checkout";
import { CraftReward } from "./craft-components/craft-reward";
import React from "react";
import { useT } from "@/lib/i18n/context";

// ─── Category definitions ────────────────────────────────────────────────────

interface PaletteItem {
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  element: React.ReactElement<any>;
}

interface PaletteCategory {
  labelKey: string;
  items: PaletteItem[];
}

/* Craft.js components have default props via .craft.props so we can render
   them without explicitly passing every prop. We use createElement with
   partial props to avoid TS strict-mode complaints. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const el = (Comp: React.ComponentType<any>, props?: Record<string, unknown>) =>
  React.createElement(Comp, props ?? {});

const categories: PaletteCategory[] = [
  {
    labelKey: "categoryBasic",
    items: [
      { labelKey: "itemText", icon: Type, element: el(CraftText) },
      { labelKey: "itemImage", icon: Image, element: el(CraftImage) },
      { labelKey: "itemButton", icon: MousePointerClick, element: el(CraftButton) },
    ],
  },
  {
    labelKey: "categoryLayout",
    items: [
      { labelKey: "itemLayout", icon: LayoutDashboard, element: el(CraftLayout) },
    ],
  },
  // TODO: uncomment when ready to add more element types
  // {
  //   label: "Basic+",
  //   items: [
  //     { label: "Divider", icon: SeparatorHorizontal, element: el(CraftDivider) },
  //     { label: "Spacer", icon: MoveVertical, element: el(CraftSpacer) },
  //     { label: "Icon", icon: SmilePlus, element: el(CraftIcon) },
  //   ],
  // },
  // {
  //   label: "Layout+",
  //   items: [
  //     { label: "Columns", icon: Columns2, element: el(CraftColumns) },
  //     { label: "Viewport", icon: Monitor, element: el(CraftViewport) },
  //   ],
  // },
  // {
  //   label: "Sections",
  //   items: [
  //     { label: "Hero", icon: Square, element: el(CraftHero) },
  //     { label: "Nav", icon: Navigation, element: el(CraftNav) },
  //     { label: "Footer", icon: PanelBottom, element: el(CraftFooter) },
  //   ],
  // },
  // {
  //   label: "Commerce",
  //   items: [
  //     { label: "Product Card", icon: ShoppingBag, element: el(CraftProductCard) },
  //     { label: "Cart", icon: ShoppingCart, element: el(CraftCart) },
  //     { label: "Checkout", icon: CreditCard, element: el(CraftCheckout) },
  //     { label: "Coupon Banner", icon: Tag, element: el(CraftCouponBanner) },
  //     { label: "Pricing Table", icon: AlignJustify, element: el(CraftPricingTable) },
  //   ],
  // },
  // {
  //   label: "Content",
  //   items: [
  //     { label: "Testimonial", icon: Star, element: el(CraftTestimonial) },
  //     { label: "FAQ", icon: HelpCircle, element: el(CraftFaq) },
  //     { label: "Gallery", icon: GalleryHorizontalEnd, element: el(CraftGallery) },
  //     { label: "Code Block", icon: Code2, element: el(CraftCodeBlock) },
  //     { label: "Custom HTML", icon: FileCode2, element: el(CraftCustomHtml) },
  //   ],
  // },
  // {
  //   label: "Auth",
  //   items: [
  //     { label: "Login Form", icon: LogIn, element: el(CraftLoginForm) },
  //     { label: "Membership", icon: Crown, element: el(CraftMembershipWidget) },
  //     { label: "Reward", icon: Gift, element: el(CraftReward) },
  //   ],
  // },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function ElementPalette() {
  const t = useT();
  const { connectors } = useEditor();

  return (
    <div className="w-56 shrink-0 overflow-y-auto border-r border-border bg-background">
      <div className="p-2">
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("builder.palette.elements")}
        </p>
        {categories.map((cat) => (
          <div key={cat.labelKey} className="mb-3">
            <p className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
              {t(`builder.palette.${cat.labelKey}`)}
            </p>
            <div className="grid grid-cols-2 gap-1">
              {cat.items.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.labelKey}
                    ref={(ref: HTMLElement | null) => {
                      if (ref) connectors.create(ref, item.element);
                    }}
                    className="flex cursor-grab flex-col items-center gap-1 rounded-[0.3rem] border border-border bg-background p-2 text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground active:cursor-grabbing"
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-[10px] font-medium leading-none">
                      {t(`builder.palette.${item.labelKey}`)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
