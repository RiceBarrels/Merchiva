import type { Metadata } from "next";
import { getAdminSession } from "@/lib/merchiva-admin/session";
import { AdminLoginScreen } from "@/components/merchiva-admin/login-screen";
import { AdminShell } from "@/components/merchiva-admin/shell";

export const metadata: Metadata = {
  title: "Platform Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * /merchivaAdmin — platform super-admin console. Separate from WorkOS: admins
 * sign in with a username/password stored in SpacetimeDB (platform_admin).
 * Unauthenticated visitors see the login screen for every sub-route.
 */
export default async function MerchivaAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  if (!session) return <AdminLoginScreen />;
  return <AdminShell username={session.username}>{children}</AdminShell>;
}
