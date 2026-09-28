"use client";

// Theme panel (slides.md §7.3, §8): the six starter themes, previewed on the current slide; the six layouts for the
// current slide; and the background of the picked slides (a colour, a picture from the device, back to the
// theme's, or the current slide's background on every slide). Each choice is one undo step. A viewer who cannot
// edit sees the panel with its choices disabled.
import { useMemo, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { toast } from "sonner";

import { SlideView } from "@/components/slides/canvas/slide-view";
import { SlidesColorSwatches } from "@/components/slides/chrome/color-picker";
import { pickedSlides } from "@/components/slides/menubar/slide-order";
import { applyLayoutChange } from "@/components/slides/panels/apply-layout";
import type { PanelWrite } from "@/components/slides/panels/use-panel-write";
import { currentSlideOf, useSlideViewLabels, useSlidesEditor } from "@/components/slides/editor/slides-context";
import { useDriveActor } from "@/components/drive/drive-actor";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { DOC_IMAGE_ACCEPT, docImageProblemKey, validateDocImage } from "@/lib/docs/uploads";
import { useT } from "@/lib/i18n/context";
import { targetForNewFromDeck } from "@/lib/slides/create";
import { uploadSlidesImage } from "@/lib/slides/images";
import { setSlidesProps } from "@/lib/slides/model/ops-slides";
import type { ColorValue, StarterThemeId } from "@/lib/slides/model/types";
import { LAYOUTS, LAYOUT_LABEL_KEYS, layoutPlaceholders, type StarterLayout } from "@/lib/slides/themes/layouts";
import { STARTER_THEMES, STARTER_THEME_IDS, THEME_LABEL_KEYS } from "@/lib/slides/themes/themes";
import { cn } from "@/lib/utils";

/** Theme previews are this wide (two per row in the 320 px panel). */
const THEME_THUMB_PX = 136;
/** Layout sketches: the 960×540 design size at this scale. */
const SKETCH_SCALE = 0.08;
const SKETCH_SIZE = { w: 960, h: 540 };

/** Each layout's placeholder boxes at sketch scale (static). */
const LAYOUT_SKETCHES: ReadonlyArray<{ layout: StarterLayout; boxes: ReadonlyArray<{ key: number; title: boolean; x: number; y: number; w: number; h: number }> }> =
  LAYOUTS.map((layout) => ({
    layout,
    boxes: layoutPlaceholders(layout, SKETCH_SIZE).flatMap((el, key) =>
      el.type === "text"
        ? [{ key, title: el.placeholder === "title", x: el.x * SKETCH_SCALE, y: el.y * SKETCH_SCALE, w: el.w * SKETCH_SCALE, h: el.h * SKETCH_SCALE }]
        : [],
    ),
  }));

const CHOICE_CLASS =
  "flex flex-col items-center gap-1 rounded-[3px] border p-1.5 text-[11.5px] text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60 aria-pressed:border-foreground aria-pressed:ring-1 aria-pressed:ring-foreground";

function ThemeSwatch({ id }: { id: StarterThemeId }) {
  const theme = STARTER_THEMES[id];
  return (
    <span
      aria-hidden
      className="flex flex-col justify-between border border-border p-2"
      style={{ width: THEME_THUMB_PX, height: Math.round((THEME_THUMB_PX * 9) / 16), backgroundColor: theme.colors.bg }}
    >
      <span className="h-2 w-3/5" style={{ backgroundColor: theme.colors.text }} />
      <span className="flex gap-0.5">
        {(["accent1", "accent2", "accent3", "accent4"] as const).map((slot) => (
          <span key={slot} className="h-1.5 w-4" style={{ backgroundColor: theme.colors[slot] }} />
        ))}
      </span>
    </span>
  );
}

export interface ThemePanelProps {
  /** The editor's panel writer (usePanelWrite in a host that outlives this panel, so an upload that finishes after
   * the panel closed still sees a version preview that began meanwhile). */
  panelWrite: PanelWrite;
}

export function ThemePanel({ panelWrite }: ThemePanelProps) {
  const t = useT();
  const labels = useSlideViewLabels();
  const actor = useDriveActor();
  const { deck, ui, el, doc } = useSlidesEditor();
  const { writable, write } = panelWrite;
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const slide = currentSlideOf(deck, ui);

  const previews = useMemo(
    () => STARTER_THEME_IDS.map((id) => ({ id, deck: { meta: { ...deck.meta, theme: STARTER_THEMES[id] }, masters: deck.masters } })),
    [deck.meta, deck.masters],
  );
  const scale = deck.meta.size.w > 0 ? THEME_THUMB_PX / deck.meta.size.w : 0;
  const background = slide?.background ?? null;
  const backgroundColor: ColorValue | null = background?.t === "solid" ? background.color : null;

  const uploadBackground = async (file: File) => {
    if (!writable) return;
    const problem = validateDocImage(file);
    if (problem) {
      toast.error(t(docImageProblemKey(problem)));
      return;
    }
    // The picture goes to the slides picked when it was chosen, even if the upload outlasts a change of slide (slides
    // deleted meanwhile are skipped). The write is refused if a version preview began or the edit right went.
    const picked = new Set(pickedSlides(ui.slideSelection, ui.currentSlideId));
    const ids = deck.slideIds.filter((slideId) => picked.has(slideId));
    if (ids.length === 0) return;
    const id = toast.loading(t("docs.image.uploading"));
    setUploading(true);
    try {
      const src = await uploadSlidesImage(file, { documentId: doc.id, target: targetForNewFromDeck(doc, actor) });
      toast.dismiss(id);
      write((ydoc) => setSlidesProps(ydoc, ids, { background: { t: "image", src, mode: "cover" } }));
    } catch (err) {
      console.error("[slides] background upload failed", err);
      toast.error(t("docs.image.failed"), { id });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="grid gap-5 p-3">
      <section className="grid gap-2">
        <Eyebrow as="h4">{t("slides.panel.themes")}</Eyebrow>
        <div className="grid grid-cols-2 gap-2">
          {previews.map(({ id, deck: preview }) => (
            <button
              key={id}
              type="button"
              aria-pressed={deck.meta.theme.id === id}
              disabled={!writable}
              onClick={() => el.applyTheme(id)}
              className={cn(CHOICE_CLASS, "border-border")}
            >
              {slide && scale > 0 ? (
                <span aria-hidden className="pointer-events-none border border-border">
                  <SlideView deck={preview} slide={slide} scale={scale} mode="thumb" labels={labels} />
                </span>
              ) : (
                <ThemeSwatch id={id} />
              )}
              <span className="w-full truncate text-center">{t(THEME_LABEL_KEYS[id])}</span>
            </button>
          ))}
        </div>
      </section>

      {slide && (
        <section className="grid gap-2">
          <Eyebrow as="h4">{t("slides.panel.layouts")}</Eyebrow>
          <div className="grid grid-cols-3 gap-2">
            {LAYOUT_SKETCHES.map(({ layout, boxes }) => (
              <button
                key={layout}
                type="button"
                aria-pressed={slide.layout === layout}
                disabled={!writable}
                onClick={() => write((ydoc) => applyLayoutChange(ydoc, slide, layout, deck.meta.size))}
                className={cn(CHOICE_CLASS, "border-border")}
              >
                <span aria-hidden className="relative block border border-border bg-background" style={{ width: SKETCH_SIZE.w * SKETCH_SCALE, height: SKETCH_SIZE.h * SKETCH_SCALE }}>
                  {boxes.map((box) => (
                    <span
                      key={box.key}
                      className={cn("absolute rounded-[1px]", box.title ? "bg-muted-foreground/45" : "bg-muted-foreground/20")}
                      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
                    />
                  ))}
                </span>
                <span className="line-clamp-2 w-full text-center leading-tight">{t(LAYOUT_LABEL_KEYS[layout])}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {slide && (
        <section className="grid gap-2">
          <Eyebrow as="h4">{t("slides.panel.background")}</Eyebrow>
          <fieldset disabled={!writable} className="grid gap-2.5 disabled:opacity-60">
            <div className="flex flex-wrap gap-1.5">
              <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                <ImagePlus className="h-3.5 w-3.5" />
                {t("slides.insert.imageUpload")}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => el.setBackground(background, true)}>
                {t("slides.slide.applyToAll")}
              </Button>
            </div>
            <SlidesColorSwatches
              label={t("slides.panel.backgroundColor")}
              value={backgroundColor}
              theme={deck.meta.theme}
              noneLabel={t("slides.slide.resetBackground")}
              onPick={(color) => el.setBackground(color === null ? null : { t: "solid", color })}
            />
          </fieldset>
          <input
            ref={fileRef}
            type="file"
            accept={DOC_IMAGE_ACCEPT}
            className="hidden"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void uploadBackground(file);
            }}
          />
        </section>
      )}
    </div>
  );
}
