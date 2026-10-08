/*
 * The round button in the top inline-start corner of the phone layout. The /manager mobile
 * chrome's menu button and a DynamicUIElement page's Back button share its look and its spot,
 * so opening a page reads as the menu turning into Back.
 *
 * The button sits CORNER_OFFSET_PX from the top and the start edge of its surface's safe area
 * (inside the shell frame the body padding already clears the notch; a fixed layer adds the
 * safe-area inset itself). Content that starts in that corner clears CORNER_RESERVE_PX, the
 * same 56px as Tailwind's `pl-14` / `ps-14`.
 */

export const CORNER_BUTTON_CLASS =
  "grid h-10 w-10 place-items-center rounded-full border border-border bg-background/90 text-foreground shadow-sm backdrop-blur-sm transition-transform active:scale-95";

export const CORNER_BUTTON_SIZE_PX = 40;
export const CORNER_OFFSET_PX = 12;
export const CORNER_RESERVE_PX = 56;
