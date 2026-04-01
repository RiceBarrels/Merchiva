import { Sidebar } from "@/components/sidebar";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Belt-and-suspenders auth check (proxy.ts should already redirect, but
  // this protects against direct Server Component rendering)
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* On mobile, offset content below the fixed header bar */}
        <main className="flex-1 overflow-y-auto pt-14 md:pt-0">{children}</main>
      </div>
    </div>
  );
}
