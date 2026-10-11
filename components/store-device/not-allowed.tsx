"use client";

import { Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { clearAppMode } from "@/lib/app-mode";
import { useT } from "@/lib/i18n/context";

/**
 * /store for an account that may not run a store device (lib/store-device-access.ts): the device
 * was put in store mode before, or by someone else. It says so and goes back to the mode chooser.
 */
export function StoreNotAllowed() {
  const t = useT();
  return (
    <div className="flex h-[100dvh] items-center justify-center bg-background px-6">
      <div className="flex max-w-sm flex-col items-center gap-4">
        <EmptyState icon={Store} title={t("storeDevice.notAllowedTitle")} description={t("storeDevice.notAllowedDesc")} />
        <Button
          className="h-11 w-full"
          onClick={() => { clearAppMode(); window.location.href = "/choose?switch=1"; }}
        >
          {t("chooseMode.switchMode")}
        </Button>
      </div>
    </div>
  );
}
