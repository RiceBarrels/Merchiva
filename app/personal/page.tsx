"use client";

import { Suspense } from "react";
import { Spinner } from "@/components/ui/loaders/geometric";
import { PersonalDeviceScreen } from "@/components/personal-device/personal-device-screen";

export default function PersonalDevicePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[100dvh] items-center justify-center bg-background">
          <Spinner size={24} className="text-muted-foreground" />
        </div>
      }
    >
      <PersonalDeviceScreen />
    </Suspense>
  );
}
