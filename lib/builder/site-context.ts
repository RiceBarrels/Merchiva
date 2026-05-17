"use client";

import { createContext, useContext } from "react";
import type { Site } from "@/lib/types";

// Lightweight context that exposes the currently-edited Site so builder
// children (ColorPicker, TokenPickerButton, …) can read site.tokens and
// merge the user's custom design tokens into their dropdowns without
// having to thread `site` as a prop through every layer.
//
// Outside the builder (e.g. published storefront) the provider is absent
// and `useBuilderSite()` returns null — pickers fall back to the static
// predefined token list.

const BuilderSiteContext = createContext<Site | null>(null);

export const BuilderSiteProvider = BuilderSiteContext.Provider;

export function useBuilderSite(): Site | null {
  return useContext(BuilderSiteContext);
}
