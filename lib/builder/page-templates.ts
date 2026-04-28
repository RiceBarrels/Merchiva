/**
 * Preset page templates for the site builder.
 *
 * Each template returns a fresh `SiteElement[]` tree (with unique node IDs)
 * representing the initial layout for a common page archetype (login, cart,
 * checkout, etc.). Elements flagged with `locked: true` are core to the
 * template — the editor blocks deletion and cut on them, but the user can
 * still freely change their styles and reposition them. Decorative/optional
 * elements stay unlocked so the user can remove or replace them.
 *
 * Templates are wired into the "Add page" flow in `LeftPanel`.
 */

import type { SiteElement } from "@/lib/types";

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

export type PageTemplateId =
  | "blank"
  | "product-detail"
  | "login"
  | "register"
  | "forgot-password"
  | "cart"
  | "membership"
  | "my-account"
  | "settings"
  | "checkout";

export interface PageTemplateMeta {
  id: PageTemplateId;
  label: string;
  description: string;
  defaultName: string;
  defaultSlug: string;
}

export const PAGE_TEMPLATES: PageTemplateMeta[] = [
  { id: "blank",           label: "Blank",            description: "Empty canvas — start from scratch.",                      defaultName: "New Page",        defaultSlug: "new-page" },
  { id: "product-detail",  label: "Product Detail",   description: "Image, name, price, description, variants, add-to-cart.", defaultName: "Product",         defaultSlug: "product" },
  { id: "login",           label: "Login",            description: "Email, password, sign-in, forgot/register links.",        defaultName: "Login",           defaultSlug: "login" },
  { id: "register",        label: "Register",         description: "Name, email, password, confirm password, sign up.",       defaultName: "Register",        defaultSlug: "register" },
  { id: "forgot-password", label: "Forgot Password",  description: "Email input and reset link button.",                      defaultName: "Forgot Password", defaultSlug: "forgot-password" },
  { id: "cart",            label: "Cart",             description: "Items, quantity, subtotal/total, checkout button.",       defaultName: "Cart",            defaultSlug: "cart" },
  { id: "membership",      label: "Membership",       description: "Tier, points, perks, upgrade button.",                    defaultName: "Membership",      defaultSlug: "membership" },
  { id: "my-account",      label: "My Account",       description: "Profile, orders, addresses, favorites.",                  defaultName: "My Account",      defaultSlug: "account" },
  { id: "settings",        label: "Settings",         description: "Notifications, language, privacy, account security.",     defaultName: "Settings",        defaultSlug: "settings" },
  { id: "checkout",        label: "Checkout",         description: "Address, payment, order summary, confirm.",               defaultName: "Checkout",        defaultSlug: "checkout" },
];

// ─── Element factories ──────────────────────────────────────────────────────

interface CommonOpts {
  locked?: boolean;
  lockLabel?: string;
}

function text(content: string, tag: "h1" | "h2" | "h3" | "h4" | "p" | "span", opts: CommonOpts = {}): SiteElement {
  return {
    id: uid(),
    type: "text",
    props: {
      content,
      tag,
      align: "left",
      fontSize: tag === "h1" ? "2rem" : tag === "h2" ? "1.5rem" : tag === "h3" ? "1.25rem" : tag === "h4" ? "1rem" : "0.9375rem",
      fontWeight: tag.startsWith("h") ? "700" : "normal",
      color: "",
      padding: "0",
    },
    locked: opts.locked,
    lockLabel: opts.lockLabel,
  };
}

function button(label: string, opts: CommonOpts & { variant?: "primary" | "secondary" | "outline" | "ghost"; fullWidth?: boolean } = {}): SiteElement {
  return {
    id: uid(),
    type: "button",
    props: {
      label,
      href: "#",
      variant: opts.variant ?? "primary",
      size: "md",
      fullWidth: opts.fullWidth ?? false,
    },
    locked: opts.locked,
    lockLabel: opts.lockLabel,
  };
}

function image(src: string, alt: string, opts: CommonOpts = {}): SiteElement {
  return {
    id: uid(),
    type: "image",
    props: {
      src,
      alt,
      objectFit: "cover",
      style: { width: "100%", height: "320px", borderRadius: "0.3rem" },
    },
    locked: opts.locked,
    lockLabel: opts.lockLabel,
  };
}

function divider(opts: CommonOpts = {}): SiteElement {
  return {
    id: uid(),
    type: "divider",
    props: {},
    locked: opts.locked,
    lockLabel: opts.lockLabel,
  };
}

interface LayoutOpts extends CommonOpts {
  direction?: "stack" | "row" | "grid" | "free";
  spacing?: "small" | "medium" | "large";
  padding?: string;
  align?: string;
  justify?: string;
  columns?: number;
  backgroundColor?: string;
  borderRadius?: string;
  style?: Record<string, string>;
}

function layout(children: SiteElement[], opts: LayoutOpts = {}): SiteElement {
  return {
    id: uid(),
    type: "layout",
    props: {
      tag: "div",
      href: "",
      direction: opts.direction ?? "stack",
      spacing: opts.spacing ?? "medium",
      align: opts.align ?? "stretch",
      justify: opts.justify ?? "flex-start",
      padding: opts.padding ?? "1.5rem",
      columns: opts.columns ?? 2,
      backgroundColor: opts.backgroundColor ?? "",
      borderRadius: opts.borderRadius ?? "",
      ...(opts.style ? { style: opts.style } : {}),
    },
    children,
    locked: opts.locked,
    lockLabel: opts.lockLabel,
  };
}

// "Field" — visual placeholder for an input (text + bordered box).
function field(label: string, placeholder: string, opts: CommonOpts = {}): SiteElement {
  return {
    id: uid(),
    type: "layout",
    props: {
      tag: "div",
      href: "",
      direction: "stack",
      spacing: "small",
      align: "stretch",
      justify: "flex-start",
      padding: "0",
      columns: 2,
      backgroundColor: "",
      borderRadius: "",
    },
    children: [
      text(label, "span", { locked: opts.locked, lockLabel: opts.lockLabel ? `${opts.lockLabel} label` : undefined }),
      {
        id: uid(),
        type: "text",
        props: {
          content: placeholder,
          tag: "p",
          align: "left",
          fontSize: "0.875rem",
          fontWeight: "normal",
          color: "#9ca3af",
          padding: "0.5rem 0.75rem",
          style: {
            border: "1px solid #d1d5db",
            borderRadius: "0.3rem",
            backgroundColor: "#fff",
          },
        },
        locked: opts.locked,
        lockLabel: opts.lockLabel,
      },
    ],
    locked: opts.locked,
    lockLabel: opts.lockLabel ? `${opts.lockLabel} field` : undefined,
  };
}

// Centered card layout used by auth pages.
function authCard(children: SiteElement[]): SiteElement {
  return layout(children, {
    direction: "stack",
    spacing: "medium",
    padding: "2rem",
    style: {
      maxWidth: "420px",
      margin: "3rem auto",
      border: "1px solid #e5e7eb",
      borderRadius: "0.3rem",
      backgroundColor: "#fff",
    },
  });
}

// ─── Templates ──────────────────────────────────────────────────────────────

function tplProductDetail(): SiteElement[] {
  return [
    layout(
      [
        layout(
          [image("https://placehold.co/600x600?text=Product", "Product image", { locked: true, lockLabel: "Image" })],
          { padding: "0" },
        ),
        layout(
          [
            text("Product Name", "h1",       { locked: true, lockLabel: "Name" }),
            text("$29.99",       "h2",       { locked: true, lockLabel: "Price" }),
            text(
              "A short, compelling description of the product highlighting its key features and benefits.",
              "p",
              { locked: true, lockLabel: "Description" },
            ),
            layout(
              [
                text("Variant", "span", { locked: true, lockLabel: "Variant label" }),
                layout(
                  [
                    text("Small",  "span", { locked: true, lockLabel: "Variant option" }),
                    text("Medium", "span", { locked: true, lockLabel: "Variant option" }),
                    text("Large",  "span", { locked: true, lockLabel: "Variant option" }),
                  ],
                  {
                    direction: "row",
                    spacing: "small",
                    padding: "0",
                    locked: true,
                    lockLabel: "Variant options",
                    style: { gap: "8px" },
                  },
                ),
              ],
              { direction: "stack", spacing: "small", padding: "0", locked: true, lockLabel: "Variants" },
            ),
            button("Add to Cart", { locked: true, lockLabel: "Add to Cart", fullWidth: true }),
          ],
          { direction: "stack", spacing: "medium", padding: "1.5rem" },
        ),
      ],
      { direction: "grid", columns: 2, spacing: "large", padding: "2rem" },
    ),
  ];
}

function tplLogin(): SiteElement[] {
  return [
    authCard([
      text("Welcome back", "h1", { locked: true, lockLabel: "Title" }),
      field("Email or phone", "you@example.com", { locked: true, lockLabel: "Email" }),
      field("Password", "••••••••", { locked: true, lockLabel: "Password" }),
      button("Sign in", { locked: true, lockLabel: "Sign in", fullWidth: true }),
      layout(
        [
          button("Forgot password?", { locked: true, lockLabel: "Forgot password", variant: "ghost" }),
          button("Create an account",  { locked: true, lockLabel: "Sign up link",   variant: "ghost" }),
        ],
        { direction: "row", spacing: "medium", padding: "0", justify: "space-between" },
      ),
    ]),
  ];
}

function tplRegister(): SiteElement[] {
  return [
    authCard([
      text("Create your account", "h1", { locked: true, lockLabel: "Title" }),
      field("Full name",        "Jane Smith",           { locked: true, lockLabel: "Name" }),
      field("Email",            "you@example.com",      { locked: true, lockLabel: "Email" }),
      field("Password",         "••••••••",             { locked: true, lockLabel: "Password" }),
      field("Confirm password", "••••••••",             { locked: true, lockLabel: "Confirm password" }),
      button("Sign up", { locked: true, lockLabel: "Sign up", fullWidth: true }),
      button("Already have an account? Sign in", { variant: "ghost" }),
    ]),
  ];
}

function tplForgotPassword(): SiteElement[] {
  return [
    authCard([
      text("Reset your password", "h1", { locked: true, lockLabel: "Title" }),
      text(
        "Enter your email address and we'll send you a link to reset your password.",
        "p",
      ),
      field("Email", "you@example.com", { locked: true, lockLabel: "Email" }),
      button("Send reset link", { locked: true, lockLabel: "Send reset link", fullWidth: true }),
      button("Back to sign in", { variant: "ghost" }),
    ]),
  ];
}

function tplCart(): SiteElement[] {
  return [
    layout(
      [
        text("Your Cart", "h1", { locked: true, lockLabel: "Title" }),
        layout(
          [
            // One example line item — also locked so the structure stays.
            layout(
              [
                image("https://placehold.co/120x120?text=Item", "Item image"),
                layout(
                  [
                    text("Product name", "h3", { locked: true, lockLabel: "Item name" }),
                    text("$29.99",       "p",  { locked: true, lockLabel: "Item price" }),
                    layout(
                      [
                        text("−", "span", { locked: true, lockLabel: "Decrease quantity" }),
                        text("1", "span", { locked: true, lockLabel: "Quantity" }),
                        text("+", "span", { locked: true, lockLabel: "Increase quantity" }),
                      ],
                      {
                        direction: "row",
                        spacing: "small",
                        padding: "0.25rem 0.5rem",
                        align: "center",
                        locked: true,
                        lockLabel: "Quantity adjuster",
                        style: { border: "1px solid #d1d5db", borderRadius: "0.3rem", width: "fit-content" },
                      },
                    ),
                  ],
                  { direction: "stack", spacing: "small", padding: "0" },
                ),
              ],
              {
                direction: "row",
                spacing: "medium",
                padding: "1rem",
                locked: true,
                lockLabel: "Cart line item",
                style: { borderBottom: "1px solid #e5e7eb" },
              },
            ),
          ],
          { direction: "stack", spacing: "small", padding: "0", locked: true, lockLabel: "Items" },
        ),
        layout(
          [
            layout(
              [
                text("Subtotal", "span", { locked: true, lockLabel: "Subtotal label" }),
                text("$29.99",   "span", { locked: true, lockLabel: "Subtotal" }),
              ],
              { direction: "row", justify: "space-between", padding: "0" },
            ),
            layout(
              [
                text("Total",   "h3", { locked: true, lockLabel: "Total label" }),
                text("$29.99",  "h3", { locked: true, lockLabel: "Total" }),
              ],
              { direction: "row", justify: "space-between", padding: "0" },
            ),
            button("Checkout", { locked: true, lockLabel: "Checkout", fullWidth: true }),
          ],
          { direction: "stack", spacing: "small", padding: "1.5rem 1rem", locked: true, lockLabel: "Summary" },
        ),
      ],
      { direction: "stack", spacing: "medium", padding: "2rem", style: { maxWidth: "720px", margin: "0 auto" } },
    ),
  ];
}

function tplMembership(): SiteElement[] {
  return [
    layout(
      [
        text("Membership", "h1", { locked: true, lockLabel: "Title" }),
        layout(
          [
            text("Gold Member", "h2", { locked: true, lockLabel: "Tier name" }),
            text("Earned through your loyalty.", "p"),
          ],
          { direction: "stack", spacing: "small", padding: "1.5rem", locked: true, lockLabel: "Tier card", style: { border: "1px solid #e5e7eb", borderRadius: "0.3rem" } },
        ),
        layout(
          [
            text("Your Points", "h3", { locked: true, lockLabel: "Points label" }),
            text("1,240",       "h2", { locked: true, lockLabel: "Points value" }),
          ],
          { direction: "row", justify: "space-between", align: "center", padding: "1.25rem", locked: true, lockLabel: "Points", style: { border: "1px solid #e5e7eb", borderRadius: "0.3rem", backgroundColor: "#fafaf9" } },
        ),
        text("Benefits", "h3", { locked: true, lockLabel: "Benefits heading" }),
        layout(
          [
            text("✓  10% off every order",         "p", { locked: true, lockLabel: "Benefit" }),
            text("✓  Free shipping over $50",      "p", { locked: true, lockLabel: "Benefit" }),
            text("✓  Early access to new arrivals", "p", { locked: true, lockLabel: "Benefit" }),
            text("✓  Birthday gift",                "p", { locked: true, lockLabel: "Benefit" }),
          ],
          { direction: "stack", spacing: "small", padding: "0", locked: true, lockLabel: "Benefits list" },
        ),
        button("Upgrade tier", { locked: true, lockLabel: "Upgrade", fullWidth: true }),
      ],
      { direction: "stack", spacing: "medium", padding: "2rem", style: { maxWidth: "560px", margin: "0 auto" } },
    ),
  ];
}

function tplMyAccount(): SiteElement[] {
  return [
    layout(
      [
        text("My Account", "h1", { locked: true, lockLabel: "Title" }),

        // Profile
        layout(
          [
            text("Profile", "h3", { locked: true, lockLabel: "Profile heading" }),
            layout(
              [
                text("Name: Jane Smith",          "p", { locked: true, lockLabel: "Profile name" }),
                text("Email: jane@example.com",   "p", { locked: true, lockLabel: "Profile email" }),
                text("Phone: +1 (555) 123-4567",  "p", { locked: true, lockLabel: "Profile phone" }),
              ],
              { direction: "stack", spacing: "small", padding: "0" },
            ),
          ],
          { direction: "stack", spacing: "small", padding: "1.25rem", locked: true, lockLabel: "Profile section", style: { border: "1px solid #e5e7eb", borderRadius: "0.3rem" } },
        ),

        // Orders
        layout(
          [
            text("Order History", "h3", { locked: true, lockLabel: "Orders heading" }),
            layout(
              [
                text("#1041 · Apr 12 · $42.50 · Delivered", "p", { locked: true, lockLabel: "Order row" }),
                text("#1040 · Apr 03 · $18.00 · Delivered", "p", { locked: true, lockLabel: "Order row" }),
              ],
              { direction: "stack", spacing: "small", padding: "0" },
            ),
          ],
          { direction: "stack", spacing: "small", padding: "1.25rem", locked: true, lockLabel: "Orders section", style: { border: "1px solid #e5e7eb", borderRadius: "0.3rem" } },
        ),

        // Addresses
        layout(
          [
            text("Addresses", "h3", { locked: true, lockLabel: "Addresses heading" }),
            text("Home — 123 Main St, Springfield", "p", { locked: true, lockLabel: "Address row" }),
            button("Add address", { variant: "outline" }),
          ],
          { direction: "stack", spacing: "small", padding: "1.25rem", locked: true, lockLabel: "Addresses section", style: { border: "1px solid #e5e7eb", borderRadius: "0.3rem" } },
        ),

        // Favorites
        layout(
          [
            text("Favorites", "h3", { locked: true, lockLabel: "Favorites heading" }),
            text("You haven't saved any items yet.", "p", { locked: true, lockLabel: "Favorites empty" }),
          ],
          { direction: "stack", spacing: "small", padding: "1.25rem", locked: true, lockLabel: "Favorites section", style: { border: "1px solid #e5e7eb", borderRadius: "0.3rem" } },
        ),
      ],
      { direction: "stack", spacing: "medium", padding: "2rem", style: { maxWidth: "720px", margin: "0 auto" } },
    ),
  ];
}

function tplSettings(): SiteElement[] {
  function settingRow(label: string, value: string, lockKey: string): SiteElement {
    return layout(
      [
        text(label, "span", { locked: true, lockLabel: `${lockKey} label` }),
        text(value, "span", { locked: true, lockLabel: `${lockKey} value` }),
      ],
      { direction: "row", justify: "space-between", padding: "0.75rem 1rem", locked: true, lockLabel: lockKey, style: { borderBottom: "1px solid #e5e7eb" } },
    );
  }

  return [
    layout(
      [
        text("Settings", "h1", { locked: true, lockLabel: "Title" }),

        layout(
          [
            text("Notifications", "h3", { locked: true, lockLabel: "Notifications heading" }),
            settingRow("Email updates",  "On",  "Email notifications"),
            settingRow("Push notifications", "Off", "Push notifications"),
            settingRow("Order updates", "On",  "Order notifications"),
          ],
          { direction: "stack", spacing: "small", padding: "1rem", locked: true, lockLabel: "Notifications section", style: { border: "1px solid #e5e7eb", borderRadius: "0.3rem" } },
        ),

        layout(
          [
            text("Language & region", "h3", { locked: true, lockLabel: "Language heading" }),
            settingRow("Language", "English",     "Language setting"),
            settingRow("Region",   "United States","Region setting"),
          ],
          { direction: "stack", spacing: "small", padding: "1rem", locked: true, lockLabel: "Language section", style: { border: "1px solid #e5e7eb", borderRadius: "0.3rem" } },
        ),

        layout(
          [
            text("Privacy", "h3", { locked: true, lockLabel: "Privacy heading" }),
            settingRow("Profile visibility", "Public", "Privacy visibility"),
            settingRow("Personalized ads",   "Off",    "Privacy ads"),
          ],
          { direction: "stack", spacing: "small", padding: "1rem", locked: true, lockLabel: "Privacy section", style: { border: "1px solid #e5e7eb", borderRadius: "0.3rem" } },
        ),

        layout(
          [
            text("Account & security", "h3", { locked: true, lockLabel: "Security heading" }),
            settingRow("Password", "Change",         "Security password"),
            settingRow("Two-factor auth", "Disabled","Security 2fa"),
            button("Sign out", { variant: "outline" }),
          ],
          { direction: "stack", spacing: "small", padding: "1rem", locked: true, lockLabel: "Security section", style: { border: "1px solid #e5e7eb", borderRadius: "0.3rem" } },
        ),
      ],
      { direction: "stack", spacing: "medium", padding: "2rem", style: { maxWidth: "720px", margin: "0 auto" } },
    ),
  ];
}

function tplCheckout(): SiteElement[] {
  return [
    layout(
      [
        text("Checkout", "h1", { locked: true, lockLabel: "Title" }),
        layout(
          [
            // Left: address + payment
            layout(
              [
                layout(
                  [
                    text("Shipping address", "h3", { locked: true, lockLabel: "Shipping heading" }),
                    field("Full name",   "Jane Smith",     { locked: true, lockLabel: "Address name" }),
                    field("Address",     "123 Main St",    { locked: true, lockLabel: "Address line" }),
                    layout(
                      [
                        field("City",     "Springfield", { locked: true, lockLabel: "Address city" }),
                        field("ZIP code", "12345",       { locked: true, lockLabel: "Address zip" }),
                      ],
                      { direction: "row", spacing: "medium", padding: "0", locked: true, lockLabel: "Address row" },
                    ),
                  ],
                  { direction: "stack", spacing: "small", padding: "1.25rem", locked: true, lockLabel: "Shipping address", style: { border: "1px solid #e5e7eb", borderRadius: "0.3rem" } },
                ),
                layout(
                  [
                    text("Payment method", "h3", { locked: true, lockLabel: "Payment heading" }),
                    field("Card number", "4242 4242 4242 4242", { locked: true, lockLabel: "Card number" }),
                    layout(
                      [
                        field("Expiry", "MM/YY", { locked: true, lockLabel: "Card expiry" }),
                        field("CVC",    "123",   { locked: true, lockLabel: "Card CVC" }),
                      ],
                      { direction: "row", spacing: "medium", padding: "0", locked: true, lockLabel: "Card details" },
                    ),
                  ],
                  { direction: "stack", spacing: "small", padding: "1.25rem", locked: true, lockLabel: "Payment", style: { border: "1px solid #e5e7eb", borderRadius: "0.3rem" } },
                ),
              ],
              { direction: "stack", spacing: "medium", padding: "0" },
            ),

            // Right: summary
            layout(
              [
                text("Order summary", "h3", { locked: true, lockLabel: "Summary heading" }),
                divider(),
                layout(
                  [
                    text("Subtotal", "span", { locked: true, lockLabel: "Summary subtotal label" }),
                    text("$29.99",   "span", { locked: true, lockLabel: "Summary subtotal" }),
                  ],
                  { direction: "row", justify: "space-between", padding: "0" },
                ),
                layout(
                  [
                    text("Shipping", "span", { locked: true, lockLabel: "Summary shipping label" }),
                    text("$4.99",    "span", { locked: true, lockLabel: "Summary shipping" }),
                  ],
                  { direction: "row", justify: "space-between", padding: "0" },
                ),
                layout(
                  [
                    text("Total",   "h3", { locked: true, lockLabel: "Summary total label" }),
                    text("$34.98",  "h3", { locked: true, lockLabel: "Summary total" }),
                  ],
                  { direction: "row", justify: "space-between", padding: "0" },
                ),
                button("Place order", { locked: true, lockLabel: "Place order", fullWidth: true }),
              ],
              { direction: "stack", spacing: "small", padding: "1.25rem", locked: true, lockLabel: "Order summary", style: { border: "1px solid #e5e7eb", borderRadius: "0.3rem", backgroundColor: "#fafaf9" } },
            ),
          ],
          { direction: "grid", columns: 2, spacing: "large", padding: "0" },
        ),
      ],
      { direction: "stack", spacing: "medium", padding: "2rem", style: { maxWidth: "1080px", margin: "0 auto" } },
    ),
  ];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function lockAll(elements: SiteElement[]): SiteElement[] {
  for (const el of elements) {
    el.locked = true;
    if (el.children) lockAll(el.children);
  }
  return elements;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function buildPageTemplate(id: PageTemplateId): SiteElement[] {
  switch (id) {
    case "blank":           return [];
    case "product-detail":  return lockAll(tplProductDetail());
    case "login":           return lockAll(tplLogin());
    case "register":        return lockAll(tplRegister());
    case "forgot-password": return lockAll(tplForgotPassword());
    case "cart":            return lockAll(tplCart());
    case "membership":      return lockAll(tplMembership());
    case "my-account":      return lockAll(tplMyAccount());
    case "settings":        return lockAll(tplSettings());
    case "checkout":        return lockAll(tplCheckout());
  }
}
