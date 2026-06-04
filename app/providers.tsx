"use client";

import { useEffect } from "react";
import { AuthProvider } from "@/lib/auth/context";
import { I18nProvider } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n/config";

export function Providers({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  // Flag the document as React-ready so the Tauri boot splash
  // (server-rendered in app/layout.tsx, only visible when
  // `html.native-shell` is set) can fade itself out via CSS once the
  // live React tree — and any <SplashLoader> inside it — has mounted.
  useEffect(() => {
    document.body.classList.add("app-ready");
  }, []);

  return (
    <I18nProvider initialLocale={initialLocale}>
      <AuthProvider>{children}</AuthProvider>
    </I18nProvider>
  );
}
