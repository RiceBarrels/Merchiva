"use client";

// The phone's bottom sheets (slides.md §11), one at a time as ui.mobileSheet says: Add and Item
// (mobile-object-sheets.tsx), Notes, Slide (duplicate, skip, background, delete) and More (share, download,
// version history, rename, trash; share not while acting for a PIN operator: useSlidesFileCommands). The hidden
// picture inputs live here, outside the sheets, so they are still mounted when the camera or the photo picker
// returns after the sheet closed.
import { useRef, useState } from "react";
import { Copy, Download, Eraser, Eye, EyeOff, FileDown, History, Palette, Pencil, RotateCcw, Share2, Trash2 } from "lucide-react";

import { MobileDrawer, SheetDivider, SheetRow } from "@/components/docs/mobile/mobile-drawer";
import { SlidesColorSwatches } from "@/components/slides/chrome/color-picker";
import { currentSlideOf, useSlidesEditor, type SlidesMobileSheet } from "@/components/slides/editor/slides-context";
import { useSlidesFileCommands, type SlidesExportFormat } from "@/components/slides/editor/use-slides-actions";
import { MobileNotesEditor } from "@/components/slides/mobile/mobile-notes-editor";
import { AddSheetBody, ItemSheetBody, type AddView, type ItemView } from "@/components/slides/mobile/mobile-object-sheets";
import { DOC_IMAGE_ACCEPT } from "@/lib/docs/uploads";
import { useT } from "@/lib/i18n/context";

type SheetView = AddView | ItemView | "background" | "download";

const TITLES: Readonly<Record<SlidesMobileSheet, string>> = {
  add: "slides.mobile.add",
  element: "slides.mobile.element",
  notes: "slides.mobile.notes",
  slide: "slides.mobile.slide",
  more: "slides.mobile.more",
};

const DOWNLOADS: ReadonlyArray<{ format: SlidesExportFormat; key: string }> = [
  { format: "pptx", key: "slides.file.downloadPptx" },
  { format: "pdf", key: "slides.file.downloadPdf" },
  { format: "png", key: "slides.file.downloadPng" },
];

function SlideSheetBody({ view, onView, onClose }: { view: SheetView; onView(view: SheetView): void; onClose(): void }) {
  const t = useT();
  const { deck, ui, el, canEditNow } = useSlidesEditor();
  const slide = currentSlideOf(deck, ui);
  const off = !canEditNow || deck.schemaTooNew || ui.previewVersionId !== null || !slide;
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
  if (view === "background" && slide) {
    const bg = slide.background;
    return (
      <div className="flex flex-col items-center gap-2 px-4 pb-3">
        <SlidesColorSwatches
          label={t("slides.slide.background")}
          value={bg && bg.t === "solid" ? bg.color : null}
          theme={deck.meta.theme}
          onPick={(color) => run(() => el.setBackground(color ? { t: "solid", color } : null))()}
        />
        <SheetRow icon={Eraser} label={t("slides.slide.resetBackground")} disabled={off || bg === null} onSelect={run(() => el.setBackground(null))} />
      </div>
    );
  }
  return (
    <>
      <SheetRow icon={Copy} label={t("slides.slide.duplicate")} disabled={off} onSelect={run(() => el.duplicateSlides())} />
      <SheetRow
        icon={slide?.hidden ? Eye : EyeOff}
        label={t(slide?.hidden ? "slides.slide.unskip" : "slides.slide.skip")}
        disabled={off}
        onSelect={run(() => el.toggleSkip())}
      />
      <SheetRow icon={Palette} label={t("slides.slide.background")} chevron disabled={off} onSelect={() => onView("background")} />
      <SheetDivider />
      <SheetRow icon={Trash2} label={t("slides.slide.delete")} destructive disabled={off || deck.slideIds.length <= 1} onSelect={run(() => el.deleteSlides())} />
    </>
  );
}

function MoreSheetBody({ view, onView, onClose }: { view: SheetView; onView(view: SheetView): void; onClose(): void }) {
  const t = useT();
  const { doc, access, canEditNow, deck, actions, dispatch } = useSlidesEditor();
  const commands = useSlidesFileCommands();
  const trashed = doc.trashedAt !== null;
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
  if (view === "download") {
    return (
      <>
        {DOWNLOADS.map(({ format, key }) => (
          <SheetRow key={format} icon={FileDown} label={t(key)} disabled={deck.slideIds.length === 0} onSelect={run(() => void actions.download(format))} />
        ))}
      </>
    );
  }
  return (
    <>
      {commands.share ? <SheetRow icon={Share2} label={t("slides.file.share")} onSelect={run(actions.openShare)} /> : null}
      <SheetRow icon={Download} label={t("slides.file.download")} chevron onSelect={() => onView("download")} />
      <SheetRow icon={History} label={t("slides.file.versionHistory")} onSelect={run(actions.showVersionHistory)} />
      {canEditNow && !trashed ? <SheetRow icon={Pencil} label={t("slides.file.rename")} onSelect={run(() => dispatch({ type: "openDialog", dialog: "rename" }))} /> : null}
      {access.canManage ? (
        <>
          <SheetDivider />
          {trashed ? (
            <SheetRow icon={RotateCcw} label={t("slides.editor.restore")} onSelect={run(() => void actions.restoreFromTrash())} />
          ) : (
            <SheetRow icon={Trash2} label={t("slides.file.moveToTrash")} destructive onSelect={run(() => dispatch({ type: "openDialog", dialog: "trashConfirm" }))} />
          )}
        </>
      ) : null}
    </>
  );
}

export function MobileSheets() {
  const t = useT();
  const { ui, dispatch, deck, canEditNow, el } = useSlidesEditor();
  const cameraRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<HTMLInputElement>(null);
  const sheet = ui.mobileSheet;
  // The nested view belongs to the sheet it was opened in: another sheet starts at its main list.
  const [nested, setNested] = useState<{ sheet: SlidesMobileSheet | null; view: SheetView }>({ sheet, view: "main" });
  if (sheet === null && nested.sheet !== null) setNested({ sheet: null, view: "main" });
  const view = nested.sheet === sheet ? nested.view : "main";
  const onView = (next: SheetView) => setNested({ sheet, view: next });
  const close = () => dispatch({ type: "closeMobileSheet" });
  const editable = ui.mobileMode === "edit" && canEditNow && !deck.schemaTooNew && ui.previewVersionId === null;
  const slide = currentSlideOf(deck, ui);

  const onFiles = (input: HTMLInputElement) => {
    const files = Array.from(input.files ?? []);
    input.value = "";
    if (files.length > 0) void el.insertImageFiles(files);
  };

  let body: React.ReactNode = null;
  if (sheet === "add") body = <AddSheetBody view={view === "image" || view === "shape" ? view : "main"} onView={onView} onClose={close} onCamera={() => cameraRef.current?.click()} onPhotos={() => photosRef.current?.click()} />;
  else if (sheet === "element") body = <ItemSheetBody view={view === "fill" || view === "border" || view === "alt" ? view : "main"} onView={onView} onClose={close} />;
  else if (sheet === "slide") body = <SlideSheetBody view={view} onView={onView} onClose={close} />;
  else if (sheet === "more") body = <MoreSheetBody view={view} onView={onView} onClose={close} />;
  else if (sheet === "notes") body = <div className="px-4 pb-4">{slide ? <MobileNotesEditor slideId={slide.id} editable={editable} /> : null}</div>;

  return (
    <>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" tabIndex={-1} aria-hidden onChange={(event) => onFiles(event.currentTarget)} />
      <input ref={photosRef} type="file" accept={DOC_IMAGE_ACCEPT} multiple className="hidden" tabIndex={-1} aria-hidden onChange={(event) => onFiles(event.currentTarget)} />
      <MobileDrawer
        open={sheet !== null}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        title={sheet ? t(TITLES[sheet]) : ""}
      >
        {body}
      </MobileDrawer>
    </>
  );
}
