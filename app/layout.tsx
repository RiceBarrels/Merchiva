import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_BCP47, RTL_LOCALES, isLocale, type Locale } from "@/lib/i18n/config";
import "./globals.css";
import { ServiceWorkerRegistrar } from "@/components/service-worker";
import { MobileDetector } from "@/components/mobile-detector";
import { NativeTitleBar } from "@/components/native-title-bar";
import { Providers } from "./providers";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Merchiva — AI-Powered Inventory Forecasting",
    template: "%s | Merchiva",
  },
  description:
    "AI-powered inventory forecasting and daily management for small businesses. Per-SKU demand models, auto-reorder POs, stockout alerts. 7.2% median forecast error.",
  metadataBase: new URL("https://project-management-phi-red.vercel.app"),
  openGraph: {
    type: "website",
    siteName: "Merchiva",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Locale resolved server-side by proxy.ts from the URL prefix (public pages).
  // Defaults to English for app/~/ and other unprefixed routes.
  let locale: Locale = DEFAULT_LOCALE;
  try {
    const h = await headers();
    const fromHeader = h.get("x-locale");
    if (isLocale(fromHeader)) locale = fromHeader;
  } catch {
    /* headers() unavailable in static export */
  }
  const dir: "ltr" | "rtl" = RTL_LOCALES.has(locale) ? "rtl" : "ltr";

  let isDark = false;
  try {
    const cookieStore = await cookies();
    const theme = cookieStore.get("merchiva_theme")?.value;
    if (theme === "dark") isDark = true;
    else if (theme === "light") isDark = false;
    else {
      // "system" or unset — server can't read prefers-color-scheme, fall back
      // to the legacy cookie (the client inline script will correct the class
      // on hydration if the OS preference differs).
      isDark = cookieStore.get("merchiva_dark")?.value === "true";
    }
  } catch {
    // Static export — cookies() unavailable, dark mode handled client-side only
  }

  return (
    <html
      lang={LOCALE_BCP47[locale]}
      dir={dir}
      className={`${inter.variable} ${geistMono.variable} h-full antialiased${isDark ? " dark" : ""}`}
      suppressHydrationWarning
    >
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content={isDark ? "#1a1a1a" : "#ffffff"} id="theme-color-meta" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Merchiva" />
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{if(window.__TAURI_INTERNALS__){document.documentElement.classList.add("native-shell")}var d=document.documentElement,t=localStorage.getItem("merchiva_theme");if(!t){var old=localStorage.getItem("merchiva_dark");t=old==="true"?"dark":old==="false"?"light":"system"}var dk=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme:dark)").matches);if(dk){d.classList.add("dark");var m=document.getElementById("theme-color-meta");if(m)m.content="#1a1a1a"}else{d.classList.remove("dark");var m2=document.getElementById("theme-color-meta");if(m2)m2.content="#ffffff"}document.cookie="merchiva_theme="+t+";path=/;max-age=31536000;SameSite=Lax";document.cookie="merchiva_dark="+(dk?"true":"false")+";path=/;max-age=31536000;SameSite=Lax";if(t==="system"){var mq=window.matchMedia("(prefers-color-scheme:dark)");var apply=function(e){var nx=!!e.matches;d.classList.toggle("dark",nx);var mm=document.getElementById("theme-color-meta");if(mm)mm.content=nx?"#1a1a1a":"#ffffff";document.cookie="merchiva_dark="+(nx?"true":"false")+";path=/;max-age=31536000;SameSite=Lax"};if(mq.addEventListener)mq.addEventListener("change",apply);else if(mq.addListener)mq.addListener(apply)}}catch(e){}}())` }} />
      </head>
      <body className="bg-background text-foreground overflow-hidden flex flex-col">
        {/*
          Tauri boot splash — server-rendered so it's visible the instant the
          webview paints (before React JS even downloads). The pre-paint inline
          script in <head> adds `native-shell` to <html> when running inside
          Tauri, which is the only CSS condition that reveals this layer.
          `<Providers>` flips `body.app-ready` once React has mounted, which
          fades the splash out so the real <SplashLoader> (or login page) can
          take over with no visible flash.
        */}
        <div id="tauri-boot-splash" aria-hidden="true">
          <div className="tbs-topbar">
            <span className="tbs-brand">MERCHIVA</span>
            <span className="tbs-sep">·</span>
            <span>booting workspace</span>
            <div className="tbs-status">
              <span className="tbs-dot" />
              <span>CONNECTING</span>
            </div>
          </div>
          <div className="tbs-center">
            <svg className="tbs-logo" viewBox="0 0 200 200" width={200} height={200}>
              <rect x={30} y={30} width={140} height={140} fill="#fafaf9" />
              <polygon points="80,29 120,29 100,85" fill="#0c0a09" />
            </svg>
            <div className="tbs-meta">
              <div className="tbs-status-text">assembling workspace</div>
              <div className="tbs-progress"><span className="tbs-progress-fill" /></div>
              <div className="tbs-meta-row">
                <span>STEP 02 / 04</span>
                <span>·</span>
                <span>cold start</span>
              </div>
            </div>
          </div>
          <div className="tbs-footer">
            <span>merchiva</span><span>·</span><span>booting</span>
          </div>
        </div>
        <div id="vaul-wrapper" data-vaul-drawer-wrapper="" className="h-full">
          <NativeTitleBar />
          <MobileDetector />
          <ServiceWorkerRegistrar />
          <div className="h-[calc(100vh-40px)] overflow-hidden">
            <Providers initialLocale={locale}>{children}</Providers>
          </div>
          <Toaster position="top-center" richColors />
        </div>
        <Analytics />
      </body>
      <Analytics />
    </html>
  );
}
