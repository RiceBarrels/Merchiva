"use client";

// The Slides menu bar (slides.md §7.3): File · Edit · View · Insert · Format · Slide · Arrange, on Base UI Menubar
// (arrow keys between menus, typeahead inside them) with the Docs menu parts. Items that need edit rights or a
// selection are disabled, not hidden. When a menu closes, focus goes back to what was being edited
// (useSlidesFinalFocus). The picture file input lives here, outside the menus, so it outlives the Insert menu.
import { Menubar } from "@base-ui/react/menubar";

import { useImageFilePicker } from "@/components/slides/chrome/image-insert";
import { ArrangeMenu } from "@/components/slides/menubar/arrange-menu";
import { EditMenu } from "@/components/slides/menubar/edit-menu";
import { FileMenu } from "@/components/slides/menubar/file-menu";
import { FormatMenu } from "@/components/slides/menubar/format-menu";
import { InsertMenu } from "@/components/slides/menubar/insert-menu";
import { SlideMenu } from "@/components/slides/menubar/slide-menu";
import { ViewMenu } from "@/components/slides/menubar/view-menu";
import { useT } from "@/lib/i18n/context";

export function SlidesMenubar() {
  const t = useT();
  const picker = useImageFilePicker();
  return (
    <>
      <Menubar aria-label={t("docs.menubar.label")} className="-ms-1 flex h-7 min-w-0 items-center gap-0.5 overflow-x-auto no-scrollbar" modal={false}>
        <FileMenu />
        <EditMenu />
        <ViewMenu />
        <InsertMenu onUploadImage={picker.open} />
        <FormatMenu />
        <SlideMenu />
        <ArrangeMenu />
      </Menubar>
      {picker.input}
    </>
  );
}
