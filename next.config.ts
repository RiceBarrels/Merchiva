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
};

export default nextConfig;
