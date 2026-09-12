"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardPage from "./dashboard/page";
import { getAppMode, APP_MODE_HOME } from "@/lib/app-mode";
import { Spinner } from "@/components/ui/loaders/geometric";

/**
 * /manager entry point. First visit on a device asks how it will be used
 * (/choose); afterwards it routes straight to that mode's home.
 * Admin mode keeps rendering the dashboard here so /manager stays a valid
 * bookmark for back-office users.
 */
export default function ManagerIndexPage() {
  const router = useRouter();
  const [decision, setDecision] = useState<"pending" | "dashboard">("pending");

  useEffect(() => {
    const mode = getAppMode();
    if (!mode) {
      router.replace("/choose");
      return;
    }
    if (mode === "admin") {
      setDecision("dashboard");
      return;
    }
    router.replace(APP_MODE_HOME[mode]);
  }, [router]);

  if (decision === "dashboard") return <DashboardPage />;

  return (
    <div className="flex h-full min-h-[50vh] items-center justify-center">
      <Spinner size={20} className="text-stone-400 dark:text-stone-500" />
    </div>
  );
}
