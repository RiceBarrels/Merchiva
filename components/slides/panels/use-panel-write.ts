"use client";

// A deck write started from a side panel that the element actions don't cover (Theme panel ▸ Layouts and the
// uploaded background): refused while the viewer can't edit, the deck is from a newer version or a version is being
// previewed; fenced as one undo step (the same stopCapturing fence the element actions use); a refusal becomes a
// toast. `write` is stable and checks the state when it runs, so a write made after an upload finishes sees a
// preview or a lost edit right that began while the upload was running. Call it in a component that outlives the
// panel (the desktop editor does, and hands it to the Theme panel): opening version history, which starts a preview,
// closes the Theme panel, and an unmounted component's view of the state stops updating.
import { useCallback, useLayoutEffect, useRef } from "react";
import { toast } from "sonner";
import type * as Y from "yjs";

import { useSlidesEditor } from "@/components/slides/editor/slides-context";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { SLIDES_MAX_ELEMENTS_PER_SLIDE } from "@/lib/slides/constants";
import { SlidesOpError } from "@/lib/slides/model/ops-slides";

export interface PanelWrite {
  writable: boolean;
  write(fn: (doc: Y.Doc) => void): void;
}

export function usePanelWrite(): PanelWrite {
  const t = useT();
  const { canEditNow, deck, ui, ydoc, undo } = useSlidesEditor();
  const writable = canEditNow && !deck.schemaTooNew && ui.previewVersionId === null;
  const { stopCapturing } = undo;
  const latest = useRef({ writable, stopCapturing, ydoc, t });
  useLayoutEffect(() => {
    latest.current = { writable, stopCapturing, ydoc, t };
  });
  const write = useCallback(
    (fn: (doc: Y.Doc) => void) => {
      const cur = latest.current;
      if (!cur.writable) return;
      cur.stopCapturing();
      try {
        fn(cur.ydoc);
      } catch (err) {
        if (err instanceof SlidesOpError && err.code === "tooManyElements") {
          toast.error(fmt(cur.t("slides.editor.tooManyElements"), { n: SLIDES_MAX_ELEMENTS_PER_SLIDE }));
        } else {
          console.error("[slides] panel edit failed", err);
          toast.error(cur.t("docs.errors.generic"));
        }
      } finally {
        cur.stopCapturing();
      }
    },
    [],
  );
  return { writable, write };
}
