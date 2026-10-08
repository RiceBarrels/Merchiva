"use client";

// The phone's Add and Item sheets (slides.md §11).
// Add: text box; image ▸ take photo / choose photo (with the management notice, since pictures are stored with the
// deck); a shape from the grid; a 3 × 3 table; a new slide.
// Item (the selected items): duplicate, delete, bring to front, send to back, fill, border, alt text.
// Every command is one el.* call, so one undo step. Nested choices open inside the same sheet.
import { useState, type ReactNode } from "react";
import {
  BringToFront, Camera, Copy, ImagePlus, Images, PaintBucket, PenLine, Plus, SendToBack, Shapes, Table, TextCursorInput, Trash2, Type,
} from "lucide-react";

import { SheetDivider, SheetRow } from "@/components/docs/mobile/mobile-drawer";
import { ManagementNoticeBanner } from "@/components/drive/notice/management-notice";
import { useSlidesSelection } from "@/components/slides/chrome/chrome-hooks";
import { SlidesColorSwatches } from "@/components/slides/chrome/color-picker";
import { currentFill, currentStroke, fillPatches, strokeColorPatches } from "@/components/slides/chrome/format-patches";
import { ShapeGrid } from "@/components/slides/chrome/shape-picker";
import { useSlidesEditor } from "@/components/slides/editor/slides-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/lib/i18n/context";

/** Alt text longer than this is cut (the model sanitizes too). */
const ALT_MAX = 1000;

export type AddView = "main" | "image" | "shape";
export type ItemView = "main" | "fill" | "border" | "alt";

/** A nested choice's body, centred under the sheet title. */
function Nested({ children }: { children: ReactNode }) {
  return <div className="flex flex-col items-center gap-3 px-4 pb-3">{children}</div>;
}

export function AddSheetBody({ view, onView, onClose, onCamera, onPhotos }: {
  view: AddView;
  onView(view: AddView): void;
  onClose(): void;
  /** Open the hidden camera / photo inputs (synchronously, inside the tap). */
  onCamera(): void;
  onPhotos(): void;
}) {
  const t = useT();
  const { el } = useSlidesEditor();
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
  if (view === "image") {
    return (
      <>
        <ManagementNoticeBanner compact className="mx-4 mb-2" />
        <SheetRow icon={Camera} label={t("slides.mobile.takePhoto")} onSelect={run(onCamera)} />
        <SheetRow icon={Images} label={t("slides.mobile.choosePhoto")} onSelect={run(onPhotos)} />
      </>
    );
  }
  if (view === "shape") {
    return (
      <Nested>
        <ShapeGrid onPick={(preset) => run(() => el.insertShape(preset))()} />
      </Nested>
    );
  }
  return (
    <>
      <SheetRow icon={Type} label={t("slides.insert.textBox")} onSelect={run(() => el.insertTextBox())} />
      <SheetRow icon={ImagePlus} label={t("slides.insert.image")} chevron onSelect={() => onView("image")} />
      <SheetRow icon={Shapes} label={t("slides.insert.shape")} chevron onSelect={() => onView("shape")} />
      <SheetRow icon={Table} label={t("slides.insert.table")} onSelect={run(() => el.insertTable(3, 3))} />
      <SheetDivider />
      <SheetRow icon={Plus} label={t("slides.insert.newSlide")} onSelect={run(() => el.addSlide())} />
    </>
  );
}

function AltTextForm({ initial, onSave }: { initial: string; onSave(alt: string): void }) {
  const t = useT();
  const [draft, setDraft] = useState(initial);
  return (
    <form
      className="flex w-full flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft.replace(/\s+/g, " ").trim().slice(0, ALT_MAX));
      }}
    >
      <Textarea
        value={draft}
        maxLength={ALT_MAX}
        rows={3}
        aria-label={t("slides.format.altText")}
        placeholder={t("slides.mobile.altTextPlaceholder")}
        onChange={(event) => setDraft(event.target.value)}
      />
      <Button type="submit" className="self-end">
        {t("common.save")}
      </Button>
    </form>
  );
}

export function ItemSheetBody({ view, onView, onClose }: { view: ItemView; onView(view: ItemView): void; onClose(): void }) {
  const t = useT();
  const { el, deck } = useSlidesEditor();
  const sel = useSlidesSelection();
  const theme = deck.meta.theme;
  const off = !sel.writable || sel.selected.length === 0;
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
  const image = sel.images.length === 1 && sel.selected.length === 1 ? sel.images[0] : null;
  const bordered = sel.outlined.length > 0 || sel.lines.length > 0;

  if (view === "fill") {
    return (
      <Nested>
        <SlidesColorSwatches
          label={t("slides.format.fill")}
          value={currentFill(sel.selected)}
          theme={theme}
          noneLabel={t("slides.format.noFill")}
          onPick={(color) => run(() => el.patch(fillPatches(sel.selected, color)))()}
        />
      </Nested>
    );
  }
  if (view === "border") {
    return (
      <Nested>
        <SlidesColorSwatches
          label={t("slides.format.border")}
          value={currentStroke(sel.selected)?.color ?? null}
          theme={theme}
          noneLabel={sel.outlined.length > 0 ? t("slides.format.noBorder") : undefined}
          onPick={(color) => run(() => el.patch(strokeColorPatches(sel.selected, color)))()}
        />
      </Nested>
    );
  }
  if (view === "alt" && image) {
    return (
      <Nested>
        <AltTextForm key={image.id} initial={image.alt} onSave={(alt) => run(() => el.patch([{ id: image.id, patch: { alt } }]))()} />
      </Nested>
    );
  }
  return (
    <>
      <SheetRow icon={Copy} label={t("slides.edit.duplicate")} disabled={off} onSelect={run(() => el.duplicateSelection())} />
      <SheetRow icon={BringToFront} label={t("slides.arrange.bringToFront")} disabled={off} onSelect={run(() => el.arrange("front"))} />
      <SheetRow icon={SendToBack} label={t("slides.arrange.sendToBack")} disabled={off} onSelect={run(() => el.arrange("back"))} />
      {sel.texts.length > 0 ? <SheetRow icon={PaintBucket} label={t("slides.format.fill")} chevron disabled={off} onSelect={() => onView("fill")} /> : null}
      {bordered ? <SheetRow icon={PenLine} label={t("slides.format.border")} chevron disabled={off} onSelect={() => onView("border")} /> : null}
      {image ? <SheetRow icon={TextCursorInput} label={t("slides.format.altText")} chevron disabled={off} onSelect={() => onView("alt")} /> : null}
      <SheetDivider />
      <SheetRow icon={Trash2} label={t("slides.edit.delete")} destructive disabled={off || sel.allLocked} onSelect={run(() => el.deleteSelection())} />
    </>
  );
}
