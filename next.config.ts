import type { NextConfig } from "next";

const isStatic = process.env.NEXT_OUTPUT === "static";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.108", "192.168.1.147"],
  ...(isStatic
    ? {
        output: "export",
        images: { unoptimized: true },
        trailingSlash: true,
      }
    : {}),
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-src 'self' https://*.notion.so https://notion.so;",
          },
        ],
      },
    ];
  },
  async redirects() {
    // /manager/staffing and /manager/training were folded into /manager/personnel — keep the
    // URLs alive for bookmarks, dashboard widgets, and any Merchiva action
    // that still references them.
    return [
      // Legacy prefix: the authenticated app lived under /~/ until 2026-09.
      { source: "/~",                     destination: "/manager",          permanent: true },
      { source: "/~/:path*",              destination: "/manager/:path*",   permanent: true },
      { source: "/manager/chat",          destination: "/manager/channel",   permanent: true },
      { source: "/manager/chat/:path*",   destination: "/manager/channel/:path*", permanent: true },
      { source: "/manager/staffing",      destination: "/manager/personnel", permanent: true },
      { source: "/manager/staffing/todo", destination: "/manager/personnel", permanent: true },
      { source: "/manager/training",      destination: "/manager/personnel", permanent: true },
    ];
  },
};

export default nextConfig;
