"use client";

import dynamic from "next/dynamic";
import { AuthRedirect } from "@/components/landing/auth-redirect";

const Homepage = dynamic(() => import("@/components/landing/homepage").then((m) => m.Homepage), {
  ssr: false,
  loading: () => <div style={{ background: "#f0eee9", minHeight: "100vh" }} />,
});

export function HomepageWrapper() {
  return (
    <>
      <AuthRedirect />
      <Homepage />
    </>
  );
}
