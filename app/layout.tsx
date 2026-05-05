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
    isDark = cookieStore.get("merchiva_dark")?.value === "true";
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
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var d=document.documentElement,s=localStorage.getItem("merchiva_dark"),dk=s==="true"||(s===null&&window.matchMedia("(prefers-color-scheme:dark)").matches);if(dk){d.classList.add("dark");var m=document.getElementById("theme-color-meta");if(m)m.content="#1a1a1a"}else{d.classList.remove("dark")}document.cookie="merchiva_dark="+(dk?"true":"false")+";path=/;max-age=31536000;SameSite=Lax"}catch(e){}}())` }} />
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
