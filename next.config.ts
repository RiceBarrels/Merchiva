import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

const isStatic = process.env.NEXT_OUTPUT === "static";

// The running build's version, inlined into the client bundle so a bug report
// can say which build it came from (lib/bugs.ts → appVersion()). Read from the
// manifest rather than duplicated here, so bumping package.json is enough.
const appVersion: string = JSON.parse(
  readFileSync(`${__dirname}/package.json`, "utf8"),
).version;

const nextConfig: NextConfig = {
  // Pin the filesystem root: a stray package-lock.json in $HOME otherwise makes
  // Turbopack infer the home directory as the workspace root and walk all of it.
  turbopack: { root: __dirname },
  allowedDevOrigins: ["192.168.1.108", "192.168.1.147"],
  env: { NEXT_PUBLIC_APP_VERSION: appVersion },
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
