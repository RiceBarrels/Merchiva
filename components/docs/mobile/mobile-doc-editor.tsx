"use client";

/**
 * Mobile editor (docs-editor-ui spec §7): opens in read mode; Edit (or a double tap) enters editing, which makes the
 * shell immersive and shows the keyboard-anchored format bar. Checklists can be ticked while reading. Panels are
 * DynamicUIElement pages (the Safari back control closes them); transient choices are vaul drawers.
 */
import { useState } from "react";
import { EditorContent } from "@tiptap/react";

import { DocBanners } from "@/components/docs/editor/banners";
import { useDocEditor } from "@/components/docs/editor/doc-editor-context";
import { PageSheet } from "@/components/docs/editor/page-sheet";
import { linkFromEvent, safeLinkHref } from "@/components/docs/editor/read-only-links";
import { FindReplaceBar } from "@/components/docs/panels/find-replace-bar";
import { useShellBackHandler, useVirtualKeyboard } from "@/lib/browser-shell";
import { MOBILE_FORMAT_BAR_HEIGHT, MobileFormatBar } from "./mobile-format-bar";
import { MobileDocHeader } from "./mobile-doc-header";
import { MobilePages } from "./mobile-pages";
import { MobileSheets } from "./mobile-sheets";
import { MobileVersionPreview } from "./mobile-version-preview";

export function MobileDocEditor() {
  const { editor, contentEditor, ui, dispatch, previewVersionId, actions, scrollRef, sheetRef, pageSetup, canEditNow, editable } = useDocEditor();
  const keyboard = useVirtualKeyboard();
  const editing = ui.mobileMode === "editing";
  const [tappedLink, setTappedLink] = useState<string | null>(null);

  useShellBackHandler(() => {
    dispatch({ type: "closeMobileSheet" });
    return true;
  }, ui.mobileSheet !== null);
  useShellBackHandler(() => {
    dispatch({ type: "closeFind" });
    return true;
  }, ui.find.open);

  return (
    <>
      <MobileDocHeader />
      <DocBanners compact />
      {ui.find.open && (
        <FindReplaceBar
          editor={contentEditor}
          open
          withReplace={ui.find.withReplace}
          onWithReplaceChange={(withReplace) => dispatch({ type: "setFindReplace", withReplace })}
          canEdit={canEditNow && editing}
          onClose={() => dispatch({ type: "closeFind" })}
          focusRequest={ui.find.focusRequest}
          variant="docked"
        />
      )}
      <div
        ref={scrollRef}
        data-tab-scroll-root=""
        className="min-h-0 flex-1 touch-manipulation overflow-y-auto overscroll-contain bg-background"
        style={editing ? { paddingBottom: MOBILE_FORMAT_BAR_HEIGHT + keyboard.inset } : undefined}
        onClickCapture={(event) => {
          if (editable) return;
          const anchor = linkFromEvent(event);
          if (!anchor) return;
          event.preventDefault();
          event.stopPropagation();
          const href = safeLinkHref(anchor);
          if (!href) return;
          setTappedLink(href);
          dispatch({ type: "openMobileSheet", sheet: "link" });
        }}
        onDoubleClick={(event) => {
          if (editing || !canEditNow || !editor || editor.isDestroyed) return;
          const pos = editor.view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
          actions.enterEditing(pos);
        }}
      >
        <PageSheet ref={sheetRef} setup={pageSetup} mobile>
          <EditorContent editor={editor} />
        </PageSheet>
      </div>
      {editing && previewVersionId === null && <MobileFormatBar />}
      <MobileSheets tappedLink={tappedLink} />
      <MobilePages />
      {previewVersionId && <MobileVersionPreview versionId={previewVersionId} />}
    </>
  );
}
