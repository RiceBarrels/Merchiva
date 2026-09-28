// Univer's palette in our colours (sheets.md §9.4). The app's tokens are neutral greys (app/globals.css), and
// Univer needs hex palettes, so its primary and gray scales become the neutral scale; every other key (the
// accent colours conditional formatting and presence use) stays Univer's. Static on purpose: dark mode is
// Univer's own (`darkMode` + univerAPI.toggleDarkMode), not read from CSS variables at runtime.

import { defaultTheme, type Theme } from "@univerjs/presets";

/** Univer's primary scale → neutral (Tailwind neutral 50–900, the scale the app's tokens come from). */
export const NEUTRAL: Theme["primary"] = {
  50: "#fafafa",
  100: "#f5f5f5",
  200: "#e5e5e5",
  300: "#d4d4d4",
  400: "#a3a3a3",
  500: "#737373",
  600: "#525252",
  700: "#404040",
  800: "#262626",
  900: "#171717",
};

/** Univer's gray scale → neutral, from white to the app's near-black foreground. */
export const NEUTRAL_GRAY: Theme["gray"] = {
  0: "#ffffff",
  50: "#fafafa",
  100: "#f5f5f5",
  200: "#e5e5e5",
  300: "#d4d4d4",
  400: "#a3a3a3",
  500: "#737373",
  600: "#525252",
  700: "#404040",
  800: "#262626",
  900: "#171717",
  1000: "#0a0a0a",
};

export const MERCHIVA_UNIVER_THEME: Theme = { ...defaultTheme, primary: NEUTRAL, gray: NEUTRAL_GRAY };

/** A fresh copy for one Univer instance (it must not share mutable palette objects with another). */
export function buildUniverTheme(): Theme {
  return JSON.parse(JSON.stringify(MERCHIVA_UNIVER_THEME)) as Theme;
}
