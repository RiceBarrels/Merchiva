"use client";

import { useEffect, useState, use, useCallback } from "react";
import Link from "next/link";
import { SiteRenderer } from "@/components/site-renderer";
import { getSiteBySlug } from "@/lib/db/sites";
import { getProducts } from "@/lib/db/products";
import { loginCustomer, registerCustomer } from "@/lib/db/membership";
import type { Site, SiteCustomer, SiteTheme, SiteElement } from "@/lib/types";
import type { Product } from "@/lib/types";
import { Loader2, ShoppingCart, X, User, LogOut, ArrowLeft } from "lucide-react";

// ─── Default template ─────────────────────────────────────────────────────────

function buildDefaultTemplate(product: Product, siteTheme: SiteTheme): SiteElement[] {
  const base = product.id;
  return [
    {
      id: `pp-hero-${base}`,
      type: "hero",
      props: {
        title: product.name,
        subtitle: product.category,
        backgroundColor: siteTheme.background,
        height: "320px",
        align: "center",
        textColor: siteTheme.text,
      },
    },
    {
      id: `pp-price-${base}`,
      type: "text",
      props: {
        content: `$${product.price.toFixed(2)}`,
        tag: "p",
        fontSize: "2rem",
        fontWeight: "800",
        color: siteTheme.accent,
        align: "center",
        padding: "1rem 2rem 0",
      },
    },
    {
      id: `pp-desc-${base}`,
      type: "text",
      props: {
        content: product.description || `${product.name} — ${product.category}`,
        tag: "p",
        align: "center",
        padding: "0.75rem 3rem 1.5rem",
        color: siteTheme.secondary,
      },
    },
    {
      id: `pp-btn-${base}`,
      type: "button",
      props: {
        label: "Add to Cart",
        href: "#",
        variant: "primary",
        size: "lg",
      },
    },
    {
      id: `pp-spacer-${base}`,
      type: "spacer",
      props: { height: "64px" },
    },
  ];
}

// ─── Cart types ───────────────────────────────────────────────────────────────

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

function sessionKey(slug: string) { return `site_session_${slug}`; }
function cartKey(slug: string) { return `site_cart_${slug}`; }

function loadSession(slug: string): SiteCustomer | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(sessionKey(slug));
    return raw ? (JSON.parse(raw) as SiteCustomer) : null;
  } catch {
    return null;
  }
}

function saveSession(slug: string, customer: SiteCustomer | null) {
  if (typeof window === "undefined") return;
  if (customer) localStorage.setItem(sessionKey(slug), JSON.stringify(customer));
  else localStorage.removeItem(sessionKey(slug));
}

function loadCart(slug: string): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(cartKey(slug));
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

function saveCart(slug: string, cart: CartItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(cartKey(slug), JSON.stringify(cart));
}

// ─── Cart drawer ──────────────────────────────────────────────────────────────

function CartDrawer({
  cart,
  onClose,
  onRemove,
  onQty,
}: {
  cart: CartItem[];
  onClose: () => void;
  onRemove: (id: string) => void;
  onQty: (id: string, delta: number) => void;
}) {
  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm bg-white h-full flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="font-semibold text-sm">Cart ({cart.reduce((s, i) => s + i.quantity, 0)})</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.length === 0 && <p className="text-sm text-gray-500 text-center py-8">Your cart is empty.</p>}
          {cart.map((item) => (
            <div key={item.id} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.name}</p>
                <p className="text-xs text-gray-500">${item.price.toFixed(2)}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => onQty(item.id, -1)} className="h-6 w-6 rounded border text-sm leading-none hover:bg-gray-50">−</button>
                <span className="text-sm w-5 text-center">{item.quantity}</span>
                <button onClick={() => onQty(item.id, 1)} className="h-6 w-6 rounded border text-sm leading-none hover:bg-gray-50">+</button>
              </div>
              <button onClick={() => onRemove(item.id)} className="text-gray-400 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
        <div className="border-t p-4 space-y-3">
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>
          <button
            disabled={cart.length === 0}
            className="w-full py-2.5 rounded bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-50"
          >
            Checkout
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Auth modal ───────────────────────────────────────────────────────────────

function AuthModal({
  siteId,
  onSuccess,
  onClose,
}: {
  siteId: string;
  onSuccess: (customer: SiteCustomer) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "login") {
        const c = await loginCustomer(siteId, email, password);
        if (!c) { setError("Invalid email or password."); return; }
        onSuccess(c);
      } else {
        const c = await registerCustomer(siteId, email, password, name);
        onSuccess(c);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-gray-900";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 bg-white rounded-sm border border-gray-200 w-full max-w-sm shadow-xl p-6">
        <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>
        <h2 className="font-bold text-base mb-4">{mode === "login" ? "Sign In" : "Create Account"}</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "register" && (
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className={inputCls} required />
          )}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={inputCls} required />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className={inputCls} required />
          {error && <p className="text-red-600 text-xs">{error}</p>}
          <button type="submit" disabled={loading} className="w-full py-2.5 rounded bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : (mode === "login" ? "Sign In" : "Create Account")}
          </button>
        </form>
        <p className="text-xs text-center text-gray-500 mt-3">
          {mode === "login" ? "Don't have an account? " : "Already have an account? "}
          <button onClick={() => setMode(mode === "login" ? "register" : "login")} className="underline font-medium text-gray-900">
            {mode === "login" ? "Register" : "Sign In"}
          </button>
        </p>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PublicProductPage({
  params,
}: {
  params: Promise<{ slug: string; productId: string }>;
}) {
  const { slug, productId } = use(params);

  const [site, setSite] = useState<Site | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [customer, setCustomer] = useState<SiteCustomer | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);

  useEffect(() => {
    setCustomer(loadSession(slug));
    setCart(loadCart(slug));
  }, [slug]);

  useEffect(() => {
    Promise.all([getSiteBySlug(slug), getProducts()])
      .then(([foundSite, prods]) => {
        if (!foundSite) { setNotFound(true); return; }
        setSite(foundSite);
        setProducts(prods);
        const found = prods.find((p) => p.id === productId);
        if (!found) { setNotFound(true); return; }
        setProduct(found);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug, productId]);

  const handleLogin = (c: SiteCustomer) => {
    setCustomer(c);
    saveSession(slug, c);
    setShowAuth(false);
  };

  const handleLogout = () => {
    setCustomer(null);
    saveSession(slug, null);
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => { const next = prev.filter((i) => i.id !== id); saveCart(slug, next); return next; });
  };

  const updateQty = useCallback((id: string, delta: number) => {
    setCart((prev) => {
      const next = prev.map((i) => i.id === id ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i);
      saveCart(slug, next);
      return next;
    });
  }, [slug]);

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !site || !product) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-4">
        <h1 className="text-2xl font-bold mb-2">Product not found</h1>
        <p className="text-muted-foreground text-sm mb-4">This product page doesn&apos;t exist.</p>
        <Link href={`/s/${slug}`} className="text-sm underline text-muted-foreground hover:text-foreground">
          ← Back to site
        </Link>
      </div>
    );
  }

  const elements = product.pageTemplate?.length
    ? product.pageTemplate
    : buildDefaultTemplate(product, site.theme);

  return (
    <div>
      {/* Back to site link */}
      <div className="fixed top-3 left-3 z-40">
        <Link
          href={`/s/${slug}`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white border border-gray-200 shadow-sm text-xs font-medium hover:bg-gray-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Link>
      </div>

      {/* Floating customer bar */}
      <div className="fixed top-3 right-3 z-40 flex items-center gap-2">
        <button
          onClick={() => setCartOpen(true)}
          className="relative flex items-center gap-1.5 px-3 py-1.5 rounded bg-white border border-gray-200 shadow-sm text-xs font-medium hover:bg-gray-50"
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          {cartCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-gray-900 text-white text-[10px] flex items-center justify-center font-bold">{cartCount}</span>
          )}
        </button>

        {customer ? (
          <>
            <Link
              href={`/s/${slug}/account`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white border border-gray-200 shadow-sm text-xs font-medium hover:bg-gray-50"
            >
              <User className="h-3.5 w-3.5" />
              {customer.name ?? customer.email.split("@")[0]}
            </Link>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded bg-white border border-gray-200 shadow-sm text-gray-400 hover:text-gray-700 hover:bg-gray-50"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <button
            onClick={() => setShowAuth(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white border border-gray-200 shadow-sm text-xs font-medium hover:bg-gray-50"
          >
            <User className="h-3.5 w-3.5" /> Sign In
          </button>
        )}
      </div>

      {/* Product page content */}
      <SiteRenderer elements={elements} theme={site.theme} products={products} siteSlug={slug} />

      {showAuth && (
        <AuthModal
          siteId={site.id}
          onSuccess={handleLogin}
          onClose={() => setShowAuth(false)}
        />
      )}
      {cartOpen && (
        <CartDrawer
          cart={cart}
          onClose={() => setCartOpen(false)}
          onRemove={removeFromCart}
          onQty={updateQty}
        />
      )}
    </div>
  );
}
