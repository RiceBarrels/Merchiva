"use client";

// Format options panel (slides.md §7.3): exact position, size and rotation of the one selected item (a line: its two
// end points), and for a picture its alt text, crop and mask. Values are in pt, as stored (1 pt = 1 stage px at
// 100 %). Each committed field is one el.patch() call, so one undo step. A locked item keeps its place: its position,
// size and rotation are read-only until it is unlocked (formatting it stays possible, as in the toolbar).
import { useState } from "react";
import { Lock, SlidersHorizontal } from "lucide-react";

import { useSlidesSelection } from "@/components/slides/chrome/chrome-hooks";
import { NumberField } from "@/components/slides/panels/number-field";
import { useSlidesEditor } from "@/components/slides/editor/slides-context";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/lib/i18n/context";
import { SLIDES_COORD_LIMIT } from "@/lib/slides/constants";
import type { ElementPatch, ImageElement, SlideElement } from "@/lib/slides/model/types";

/** The most a crop may take away across one axis (both sides together). */
const CROP_MAX = 0.95;
const ALT_MAX = 1000;
const MASKS: ReadonlyArray<{ value: ImageElement["mask"]; key: string }> = [
  { value: "", key: "slides.format.maskNone" },
  { value: "ellipse", key: "slides.format.maskEllipse" },
  { value: "roundRect", key: "slides.format.maskRounded" },
];
type MaskChoice = "none" | "ellipse" | "roundRect";
const maskChoice = (mask: ImageElement["mask"]): MaskChoice => (mask === "" ? "none" : mask);

/** Degrees in [0, 360). */
function normalizeDegrees(deg: number): number {
  const n = deg % 360;
  return n < 0 ? n + 360 : n;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <Eyebrow as="h4">{title}</Eyebrow>
      {children}
    </section>
  );
}

function ImageOptions({ image, disabled, set }: { image: ImageElement; disabled: boolean; set(patch: ElementPatch): void }) {
  const t = useT();
  const [alt, setAlt] = useState<{ id: string; text: string } | null>(null);
  const altText = alt?.id === image.id ? alt.text : image.alt;
  const crop = image.crop;
  const setCrop = (side: "l" | "t" | "r" | "b", percent: number) => {
    const other = side === "l" ? crop.r : side === "r" ? crop.l : side === "t" ? crop.b : crop.t;
    const v = Math.max(0, Math.min(percent / 100, CROP_MAX - other));
    set({ crop: { ...crop, [side]: Math.round(v * 1000) / 1000 } });
  };
  const sides = [
    { side: "l", key: "slides.panel.cropLeft", value: crop.l },
    { side: "t", key: "slides.panel.cropTop", value: crop.t },
    { side: "r", key: "slides.panel.cropRight", value: crop.r },
    { side: "b", key: "slides.panel.cropBottom", value: crop.b },
  ] as const;
  return (
    <>
      <Section title={t("slides.format.altText")}>
        <Textarea
          aria-label={t("slides.format.altText")}
          rows={3}
          maxLength={ALT_MAX}
          disabled={disabled}
          value={altText}
          onChange={(event) => setAlt({ id: image.id, text: event.target.value })}
          onBlur={() => {
            if (alt?.id === image.id && alt.text !== image.alt) set({ alt: alt.text });
            setAlt(null);
          }}
          className="min-h-16 text-[12.5px]"
        />
        <p className="text-[11px] text-muted-foreground">{t("slides.panel.altTextHint")}</p>
      </Section>
      <Section title={t("slides.format.crop")}>
        <div className="grid grid-cols-2 gap-2">
          {sides.map(({ side, key, value }) => (
            <NumberField
              key={side}
              label={t(key)}
              value={value * 100}
              min={0}
              max={CROP_MAX * 100}
              decimals={1}
              suffix="%"
              disabled={disabled}
              onCommit={(percent) => setCrop(side, percent)}
            />
          ))}
        </div>
      </Section>
      <Section title={t("slides.format.mask")}>
        <SegmentedControl<MaskChoice>
          aria-label={t("slides.format.mask")}
          size="sm"
          fullWidth
          value={maskChoice(image.mask)}
          options={MASKS.map((m) => ({ value: maskChoice(m.value), label: t(m.key), disabled }))}
          onChange={(value) => set({ mask: value === "none" ? "" : value })}
        />
      </Section>
    </>
  );
}

function Geometry({ element, disabled, set }: { element: SlideElement; disabled: boolean; set(patch: ElementPatch): void }) {
  const t = useT();
  const pt = t("slides.panel.unitPt");
  const coord = { min: -SLIDES_COORD_LIMIT, max: SLIDES_COORD_LIMIT, suffix: pt, disabled };
  if (element.type === "line") {
    return (
      <>
        <Section title={t("slides.format.arrowStart")}>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label={t("slides.panel.x")} value={element.x1} {...coord} onCommit={(x1) => set({ x1 })} />
            <NumberField label={t("slides.panel.y")} value={element.y1} {...coord} onCommit={(y1) => set({ y1 })} />
          </div>
        </Section>
        <Section title={t("slides.format.arrowEnd")}>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label={t("slides.panel.x")} value={element.x2} {...coord} onCommit={(x2) => set({ x2 })} />
            <NumberField label={t("slides.panel.y")} value={element.y2} {...coord} onCommit={(y2) => set({ y2 })} />
          </div>
        </Section>
      </>
    );
  }
  return (
    <>
      <Section title={t("slides.format.position")}>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label={t("slides.panel.x")} value={element.x} {...coord} onCommit={(x) => set({ x })} />
          <NumberField label={t("slides.panel.y")} value={element.y} {...coord} onCommit={(y) => set({ y })} />
        </div>
      </Section>
      <Section title={t("slides.format.size")}>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label={t("slides.panel.width")} value={element.w} {...coord} min={1} onCommit={(w) => set({ w })} />
          <NumberField label={t("slides.panel.height")} value={element.h} {...coord} min={1} onCommit={(h) => set({ h })} />
          <NumberField
            label={t("slides.format.rotation")}
            value={element.rot}
            min={-3600}
            max={3600}
            suffix="°"
            disabled={disabled}
            onCommit={(rot) => set({ rot: normalizeDegrees(rot) })}
          />
        </div>
      </Section>
    </>
  );
}

export function FormatPanel() {
  const t = useT();
  const { el } = useSlidesEditor();
  const sel = useSlidesSelection();
  const element = sel.selected.length === 1 ? sel.selected[0] : null;

  if (!element) {
    return <EmptyState compact icon={SlidersHorizontal} description={t("slides.panel.noSelection")} className="py-8" />;
  }

  const readOnly = !sel.writable;
  const set = (patch: ElementPatch) => el.patch([{ id: element.id, patch }]);
  return (
    <div className="grid gap-5 p-3">
      {element.locked && (
        <Callout
          tone="neutral"
          icon={Lock}
          action={
            readOnly ? undefined : (
              <Button type="button" variant="outline" size="xs" onClick={() => el.setLocked(false)}>
                {t("slides.arrange.unlock")}
              </Button>
            )
          }
        >
          {t("slides.panel.locked")}
        </Callout>
      )}
      <Geometry element={element} disabled={readOnly || element.locked} set={set} />
      {element.type === "image" && <ImageOptions image={element} disabled={readOnly} set={set} />}
    </div>
  );
}
