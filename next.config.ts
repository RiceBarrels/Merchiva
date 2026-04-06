import type { NextConfig } from "next";

const isStatic = process.env.NEXT_OUTPUT === "static";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.108"],
  ...(isStatic
    ? {
        output: "export",
        images: { unoptimized: true },
        // Trailing slash ensures /dashboard → /dashboard/index.html (works with local file servers)
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;
