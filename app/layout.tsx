import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { ServiceWorkerRegistrar } from "@/components/service-worker";
import { MobileDetector } from "@/components/mobile-detector";
import { Providers } from "./providers";
import { Toaster } from "sonner";

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
  title: "Merchiva — AI-Powered Business Management",
  description: "Intelligent inventory prediction and daily management for small businesses",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased${isDark ? " dark" : ""}`}
      suppressHydrationWarning
    >
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content={isDark ? "#1a1a1a" : "#ffffff"} id="theme-color-meta" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Merchiva" />
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var d=document.documentElement,t=localStorage.getItem("merchiva_theme");if(!t){var old=localStorage.getItem("merchiva_dark");t=old==="true"?"dark":old==="false"?"light":"system"}var dk=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme:dark)").matches);if(dk){d.classList.add("dark");var m=document.getElementById("theme-color-meta");if(m)m.content="#1a1a1a"}else{d.classList.remove("dark");var m2=document.getElementById("theme-color-meta");if(m2)m2.content="#ffffff"}document.cookie="merchiva_theme="+t+";path=/;max-age=31536000;SameSite=Lax";document.cookie="merchiva_dark="+(dk?"true":"false")+";path=/;max-age=31536000;SameSite=Lax";if(t==="system"){var mq=window.matchMedia("(prefers-color-scheme:dark)");var apply=function(e){var nx=!!e.matches;d.classList.toggle("dark",nx);var mm=document.getElementById("theme-color-meta");if(mm)mm.content=nx?"#1a1a1a":"#ffffff";document.cookie="merchiva_dark="+(nx?"true":"false")+";path=/;max-age=31536000;SameSite=Lax"};if(mq.addEventListener)mq.addEventListener("change",apply);else if(mq.addListener)mq.addListener(apply)}}catch(e){}}())` }} />
      </head>
      <body className="h-full bg-background text-foreground">
        <div id="vaul-wrapper" data-vaul-drawer-wrapper="" className="h-full">
          <MobileDetector />
          <ServiceWorkerRegistrar />
          <Providers>{children}</Providers>
          <Toaster position="top-center" richColors />
        </div>
      </body>
    </html>
  );
}
