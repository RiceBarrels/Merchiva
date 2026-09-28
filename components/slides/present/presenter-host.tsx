"use client";

// Mounts the slideshow while the editor UI state says one is running (ui.presenting, set by actions.present() or
// `?present=1`). Exactly one host per open deck: the phone layout mounts it in MobileSlidesEditor, the desktop
// layout in DesktopSlidesEditor. When the show ends, the editor shows the slide it ended on and the stage gets the
// keys back.
import { useCallback } from "react";

import { useSlidesEditor } from "@/components/slides/editor/slides-context";
import { PresenterOverlay } from "@/components/slides/present/presenter-overlay";
import { useT } from "@/lib/i18n/context";

export function SlidesPresenterHost(): React.JSX.Element | null {
  const t = useT();
  const { deck, ui, dispatch, doc, provider, refs } = useSlidesEditor();
  const presenting = ui.presenting;
  const onExit = useCallback(
    (lastSlideId: string) => {
      dispatch({ type: "stopPresenting" });
      if (deck.slides.has(lastSlideId)) dispatch({ type: "selectSlide", slideId: lastSlideId });
      refs.stageFocus.focus();
    },
    [deck, dispatch, refs],
  );
  if (!presenting) return null;
  return (
    <PresenterOverlay
      deck={deck}
      startSlideId={presenting.startSlideId}
      speaker={presenting.speaker}
      title={doc.title || t("slides.untitled")}
      sessionId={provider.sessionId}
      onExit={onExit}
    />
  );
}
