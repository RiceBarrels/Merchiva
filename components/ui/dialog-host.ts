"use client";

import { createContext, useContext } from "react";

/*
 * A full-screen surface that hosts DynamicUIElement phone pages outside the /manager browser shell —
 * a device app's window on /store and /personal (components/device/mini-app-shell.tsx). A page opened
 * from inside it pushes the host aside (instead of `#mobile-content`, which is not there) and shows its
 * own visible Back, since the host has no chrome to go back with.
 *
 * Pages are portalled to <body>, but React context follows the component tree, so a page opened by
 * anything rendered inside the host sees it.
 */
export interface DialogHost {
  /** The layer a depth-0 page pushes aside. Must carry no transform of its own. */
  pushTarget(): HTMLElement | null;
  /**
   * A phone page opened in the host is on screen (its fixed outer element); returns its detach. A
   * device app lets a drag down on the page close the page and the app together.
   */
  attachPage?(page: HTMLElement): () => void;
  /**
   * Given when the host covers only part of the screen (a device app on the tablet's apps side,
   * beside the channel): where its pages render. A page opened in it then always takes the phone
   * layout — in from the inline end, Back in its corner — and fills this element's positioned box
   * (the app window's own box) instead of the viewport, so it slides in up to the divider and the
   * rest of the screen stays usable.
   */
  pageRoot?(): HTMLElement | null;
}

export const DialogHostContext = createContext<DialogHost | null>(null);

export function useDialogHost(): DialogHost | null {
  return useContext(DialogHostContext);
}
