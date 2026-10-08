"use client";

// The renderer, loaded on demand (design B.7): the vendor bundle and its stylesheets reach the browser only when a
// /manager screen shows a form. If the chunk cannot load (offline, a stale deploy), the in-house fallback renders
// the same definition with the inputs the device apps use.

import dynamic from "next/dynamic";
import { Spinner } from "@/components/ui/loaders/geometric";
import { FallbackForm } from "./fallback-form";
import type { SurveyHostProps } from "./survey-host";

export type { SurveyHostProps } from "./survey-host";

export const LazySurveyHost = dynamic<SurveyHostProps>(
  () => import("./survey-host").then((m) => m.SurveyHost).catch(() => FallbackForm),
  { ssr: false, loading: () => <div className="flex justify-center py-10"><Spinner size={20} /></div> },
);
