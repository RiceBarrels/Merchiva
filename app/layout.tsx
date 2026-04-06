import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegistrar } from "@/components/service-worker";

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
  title: "BizOps — AI-Powered Business Management",
  description: "Intelligent inventory prediction and daily management for small businesses",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#ffffff" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="BizOps" />
      </head>
      <body className="h-full bg-background text-foreground">
        {/* Safe area gradient: solid bg → transparent, covers the notch/status bar */}
        <div
          className="fixed top-0 left-0 right-0 z-[999] pointer-events-none"
          style={{
            height: "calc(env(safe-area-inset-top, 0px) + 12px)",
            background: "linear-gradient(to bottom, var(--background) 60%, transparent)",
          }}
        />
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  );
}
