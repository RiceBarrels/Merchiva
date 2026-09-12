"use client";

import { Suspense } from "react";
import { Spinner } from "@/components/ui/loaders/geometric";
import { StoreDeviceScreen } from "@/components/store-device/store-device-screen";

export default function StoreDevicePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-background">
          <Spinner size={24} className="text-muted-foreground" />
        </div>
      }
    >
      <StoreDeviceScreen />
    </Suspense>
  );
}
