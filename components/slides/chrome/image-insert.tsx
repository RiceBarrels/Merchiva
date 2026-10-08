"use client";

// Insert ▸ Image (slides.md §7.3, §12.2): pictures from the device (a hidden file input; uploads go through
// el.insertImageFiles → uploadSlidesImage) or by URL (the imageUrl dialog the editor mounts).
import { useRef, type ReactNode } from "react";
import { ImagePlus, Link as LinkIcon, Upload } from "lucide-react";

import { ToolbarIconButton } from "@/components/docs/toolbar/toolbar-button";
import { DocMenu, DocMenuContent, DocMenuItem, DocMenuTrigger } from "@/components/docs/ui/doc-menu";
import { useSlidesFinalFocus } from "@/components/slides/chrome/chrome-hooks";
import { useSlidesEditor } from "@/components/slides/editor/slides-context";
import { DOC_IMAGE_ACCEPT } from "@/lib/docs/uploads";
import { useT } from "@/lib/i18n/context";

/**
 * A hidden picture file input and the function that opens it. Render `input` outside every menu and popover: a
 * popup's content unmounts when it closes, and the input must still be there when the file dialog returns.
 */
export function useImageFilePicker(): { input: ReactNode; open(): void } {
  const { el } = useSlidesEditor();
  const ref = useRef<HTMLInputElement>(null);
  const input = (
    <input
      ref={ref}
      type="file"
      accept={DOC_IMAGE_ACCEPT}
      multiple
      className="hidden"
      tabIndex={-1}
      aria-hidden
      onChange={(event) => {
        const files = Array.from(event.currentTarget.files ?? []);
        event.currentTarget.value = "";
        if (files.length > 0) void el.insertImageFiles(files);
      }}
    />
  );
  return { input, open: () => ref.current?.click() };
}

/** The two image sources as menu items (toolbar menu and Insert ▸ Image). */
export function ImageSourceItems({ onUpload }: { onUpload(): void }) {
  const t = useT();
  const { dispatch } = useSlidesEditor();
  return (
    <>
      <DocMenuItem icon={Upload} onClick={onUpload}>
        {t("slides.insert.imageUpload")}
      </DocMenuItem>
      <DocMenuItem icon={LinkIcon} onClick={() => dispatch({ type: "openDialog", dialog: "imageUrl" })}>
        {t("slides.insert.imageUrl")}
      </DocMenuItem>
    </>
  );
}

/** Toolbar button with the two image sources; `onUpload` opens a useImageFilePicker() input rendered outside it. */
export function ImageInsertMenu({ disabled, onUpload }: { disabled?: boolean; onUpload(): void }) {
  const t = useT();
  const finalFocus = useSlidesFinalFocus();
  const label = t("slides.insert.image");
  return (
    <DocMenu>
      <DocMenuTrigger disabled={disabled} render={<ToolbarIconButton aria-label={label} title={label} />}>
        <ImagePlus className="h-4 w-4" />
      </DocMenuTrigger>
      <DocMenuContent finalFocus={finalFocus}>
        <ImageSourceItems onUpload={onUpload} />
      </DocMenuContent>
    </DocMenu>
  );
}
