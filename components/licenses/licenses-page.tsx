"use client";

// /licenses: the public, signed-out notices page (web, the Capacitor static export and Tauri). The page renders
// inside the root layout's fixed-height, non-flex wrapper, so it scrolls itself (`h-full overflow-y-auto`).

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/context";
import { LicensesList } from "./licenses-list";

export function LicensesPage() {
  const t = useT();
  const router = useRouter();
  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.replace("/");
  };

  return (
    <main className="h-full overflow-y-auto overscroll-contain bg-background text-foreground">
      <div className="mx-auto w-full max-w-3xl px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-[max(env(safe-area-inset-bottom),1.5rem)]">
        <Button variant="ghost" size="sm" className="-ms-2" onClick={goBack}>
          <ArrowLeft className="rtl:rotate-180" />
          {t("common.back")}
        </Button>
        <header className="mt-3 mb-5 space-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight">{t("licenses.title")}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{t("licenses.intro")}</p>
        </header>
        <LicensesList />
      </div>
    </main>
  );
}
