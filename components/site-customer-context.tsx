"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { SiteCustomer, SiteCartItem } from "@/lib/types";

interface SiteCustomerContextValue {
  siteId: string;
  customer: SiteCustomer | null;
  cart: SiteCartItem[];
  login: (customer: SiteCustomer) => void;
  logout: () => void;
  addToCart: (item: Omit<SiteCartItem, "qty">) => void;
  removeFromCart: (productId: string) => void;
  updateQty: (productId: string, qty: number) => void;
  clearCart: () => void;
  cartTotal: number;
  cartCount: number;
}

const SiteCustomerContext = createContext<SiteCustomerContextValue | null>(null);

export function useSiteCustomer() {
  const ctx = useContext(SiteCustomerContext);
  if (!ctx) throw new Error("useSiteCustomer must be used inside SiteCustomerProvider");
  return ctx;
}

function sessionKey(siteId: string) {
  return `site_customer_session_${siteId}`;
}
function cartKey(siteId: string) {
  return `site_cart_${siteId}`;
}

export function SiteCustomerProvider({
  siteId,
  children,
}: {
  siteId: string;
  children: React.ReactNode;
}) {
  const [customer, setCustomer] = useState<SiteCustomer | null>(null);
  const [cart, setCart] = useState<SiteCartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage after mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(sessionKey(siteId));
      if (raw) setCustomer(JSON.parse(raw));
      const rawCart = localStorage.getItem(cartKey(siteId));
      if (rawCart) setCart(JSON.parse(rawCart));
    } catch { /* ignore */ }
    setHydrated(true);
  }, [siteId]);

  // Persist cart
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(cartKey(siteId), JSON.stringify(cart));
  }, [cart, siteId, hydrated]);

  const login = useCallback((c: SiteCustomer) => {
    setCustomer(c);
    localStorage.setItem(sessionKey(siteId), JSON.stringify(c));
  }, [siteId]);

  const logout = useCallback(() => {
    setCustomer(null);
    localStorage.removeItem(sessionKey(siteId));
  }, [siteId]);

  const addToCart = useCallback((item: Omit<SiteCartItem, "qty">) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === item.productId);
      if (existing) {
        return prev.map((i) => i.productId === item.productId ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { ...item, qty: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => prev.filter((i) => i.productId !== productId));
  }, []);

  const updateQty = useCallback((productId: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((i) => i.productId !== productId));
    } else {
      setCart((prev) => prev.map((i) => i.productId === productId ? { ...i, qty } : i));
    }
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    localStorage.removeItem(cartKey(siteId));
  }, [siteId]);

  const cartTotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const cartCount = cart.reduce((sum, i) => sum + i.qty, 0);

  return (
    <SiteCustomerContext.Provider value={{
      siteId, customer, cart,
      login, logout,
      addToCart, removeFromCart, updateQty, clearCart,
      cartTotal, cartCount,
    }}>
      {children}
    </SiteCustomerContext.Provider>
  );
}
