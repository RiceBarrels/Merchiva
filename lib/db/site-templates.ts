// @ts-nocheck
import type { SiteElement, SiteFeatures } from "@/lib/types";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function el(type: string, props: Record<string, unknown>, extra?: Partial<SiteElement>): SiteElement {
  return { id: uid(), type: type as SiteElement["type"], props: { ...props, locked: true }, ...extra };
}

export interface BuiltInPage {
  name: string;
  slug: string;
  featureKey: keyof SiteFeatures;
  elements: SiteElement[];
}

export function getBuiltInPages(): BuiltInPage[] {
  return [
    // ── Auth ──
    {
      name: "Login",
      slug: "login",
      featureKey: "auth",
      elements: [
        el("viewport", { viewportName: "Desktop", viewportWidth: 1280, direction: "stack", spacing: "0px", align: "center", padding: "4rem 2rem", backgroundColor: "#ffffff" }, {
          x: 0, y: 0, width: 1280, height: 600,
          children: [
            el("text", { content: "Sign In", tag: "h1", fontSize: "2rem", fontWeight: "bold", color: "", align: "center" }),
            el("login-form", { title: "", redirectUrl: "/account" }),
            el("text", { content: "<a href='/signup'>Create an account</a> · <a href='/forgot-password'>Forgot password?</a>", tag: "p", fontSize: "0.875rem", align: "center", color: "" }),
          ],
        }),
      ],
    },
    {
      name: "Sign Up",
      slug: "signup",
      featureKey: "auth",
      elements: [
        el("viewport", { viewportName: "Desktop", viewportWidth: 1280, direction: "stack", spacing: "0px", align: "center", padding: "4rem 2rem", backgroundColor: "#ffffff" }, {
          x: 0, y: 0, width: 1280, height: 600,
          children: [
            el("text", { content: "Create Account", tag: "h1", fontSize: "2rem", fontWeight: "bold", color: "", align: "center" }),
            el("login-form", { title: "", redirectUrl: "/account" }),
            el("text", { content: "<a href='/login'>Already have an account? Sign in</a>", tag: "p", fontSize: "0.875rem", align: "center", color: "" }),
          ],
        }),
      ],
    },
    {
      name: "Forgot Password",
      slug: "forgot-password",
      featureKey: "auth",
      elements: [
        el("viewport", { viewportName: "Desktop", viewportWidth: 1280, direction: "stack", spacing: "0px", align: "center", padding: "4rem 2rem", backgroundColor: "#ffffff" }, {
          x: 0, y: 0, width: 1280, height: 500,
          children: [
            el("text", { content: "Reset Password", tag: "h1", fontSize: "2rem", fontWeight: "bold", color: "", align: "center" }),
            el("text", { content: "Enter your email address and we'll send you a reset link.", tag: "p", fontSize: "1rem", align: "center", color: "" }),
            el("login-form", { title: "", redirectUrl: "/login" }),
          ],
        }),
      ],
    },
    // ── Cart ──
    {
      name: "Cart",
      slug: "cart",
      featureKey: "cart",
      elements: [
        el("viewport", { viewportName: "Desktop", viewportWidth: 1280, direction: "stack", spacing: "0px", align: "stretch", padding: "2rem", backgroundColor: "#ffffff" }, {
          x: 0, y: 0, width: 1280, height: 600,
          children: [
            el("text", { content: "Your Cart", tag: "h1", fontSize: "2rem", fontWeight: "bold", color: "" }),
            el("cart", { title: "", emptyText: "Your cart is empty.", checkoutLabel: "Proceed to Checkout" }),
            el("text", { content: "<a href='/products'>Continue Shopping</a>", tag: "p", fontSize: "0.875rem", color: "" }),
          ],
        }),
      ],
    },
    // ── Checkout ──
    {
      name: "Checkout",
      slug: "checkout",
      featureKey: "checkout",
      elements: [
        el("viewport", { viewportName: "Desktop", viewportWidth: 1280, direction: "stack", spacing: "0px", align: "stretch", padding: "2rem", backgroundColor: "#ffffff" }, {
          x: 0, y: 0, width: 1280, height: 700,
          children: [
            el("text", { content: "Checkout", tag: "h1", fontSize: "2rem", fontWeight: "bold", color: "" }),
            el("checkout", { title: "", submitLabel: "Place Order" }),
          ],
        }),
      ],
    },
    // ── Products ──
    {
      name: "Products",
      slug: "products",
      featureKey: "products",
      elements: [
        el("viewport", { viewportName: "Desktop", viewportWidth: 1280, direction: "stack", spacing: "0px", align: "stretch", padding: "2rem", backgroundColor: "#ffffff" }, {
          x: 0, y: 0, width: 1280, height: 800,
          children: [
            el("text", { content: "Our Products", tag: "h1", fontSize: "2rem", fontWeight: "bold", color: "" }),
            el("layout", { direction: "grid", columns: 3, spacing: "24px", align: "stretch", padding: "0", backgroundColor: "" }, {
              children: [
                el("product-card", { productId: "", showPrice: true, showDescription: true }),
                el("product-card", { productId: "", showPrice: true, showDescription: true }),
                el("product-card", { productId: "", showPrice: true, showDescription: true }),
              ],
            }),
          ],
        }),
      ],
    },
    // ── Account ──
    {
      name: "Account",
      slug: "account",
      featureKey: "account",
      elements: [
        el("viewport", { viewportName: "Desktop", viewportWidth: 1280, direction: "stack", spacing: "0px", align: "stretch", padding: "2rem", backgroundColor: "#ffffff" }, {
          x: 0, y: 0, width: 1280, height: 700,
          children: [
            el("text", { content: "My Account", tag: "h1", fontSize: "2rem", fontWeight: "bold", color: "" }),
            el("membership-widget", { title: "Your Membership", tierName: "Member", tierColor: "#3b82f6", tierIcon: "Star", showPoints: true, previewPerks: ["Member benefits"] }),
          ],
        }),
      ],
    },
    // ── Subscriptions ──
    {
      name: "Subscriptions",
      slug: "subscriptions",
      featureKey: "subscriptions",
      elements: [
        el("viewport", { viewportName: "Desktop", viewportWidth: 1280, direction: "stack", spacing: "0px", align: "center", padding: "2rem", backgroundColor: "#ffffff" }, {
          x: 0, y: 0, width: 1280, height: 700,
          children: [
            el("text", { content: "Membership Plans", tag: "h1", fontSize: "2rem", fontWeight: "bold", color: "", align: "center" }),
            el("text", { content: "Choose the plan that's right for you", tag: "p", fontSize: "1.125rem", color: "", align: "center" }),
            el("membership-widget", { title: "", tierName: "Pro", tierColor: "#8b5cf6", tierIcon: "Crown", showPoints: false, previewPerks: ["Unlimited access", "Priority support", "Exclusive content"] }),
          ],
        }),
      ],
    },
    // ── Rewards ──
    {
      name: "Rewards",
      slug: "rewards",
      featureKey: "rewards",
      elements: [
        el("viewport", { viewportName: "Desktop", viewportWidth: 1280, direction: "stack", spacing: "0px", align: "center", padding: "2rem", backgroundColor: "#ffffff" }, {
          x: 0, y: 0, width: 1280, height: 600,
          children: [
            el("text", { content: "Rewards Program", tag: "h1", fontSize: "2rem", fontWeight: "bold", color: "", align: "center" }),
            el("reward", { title: "Earn Points", description: "Earn points on every purchase and redeem for rewards!", pointsLabel: "Points", backgroundColor: "#f0fdf4", textColor: "#166534" }),
          ],
        }),
      ],
    },
    // ── Booking ──
    {
      name: "Booking",
      slug: "booking",
      featureKey: "booking",
      elements: [
        el("viewport", { viewportName: "Desktop", viewportWidth: 1280, direction: "stack", spacing: "0px", align: "center", padding: "2rem", backgroundColor: "#ffffff" }, {
          x: 0, y: 0, width: 1280, height: 600,
          children: [
            el("text", { content: "Book a Reservation", tag: "h1", fontSize: "2rem", fontWeight: "bold", color: "", align: "center" }),
            el("booking-form", { title: "", submitLabel: "Book Now" }),
          ],
        }),
      ],
    },
  ];
}
