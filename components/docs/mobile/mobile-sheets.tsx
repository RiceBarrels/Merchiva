"use client";

import { useDocEditor } from "@/components/docs/editor/doc-editor-context";
import { MobileActionsSheet, MobileDownloadSheet } from "./mobile-actions-sheet";
import { MobileFormatSheet } from "./mobile-format-sheet";
import { MobileInsertSheet, MobileTableSheet } from "./mobile-insert-sheet";
import { MobileLinkSheet } from "./mobile-link-sheet";

/** Host for the transient mobile drawers; only one is open at a time (`ui.mobileSheet`). */
export function MobileSheets({ tappedLink }: { tappedLink: string | null }) {
  const { ui, dispatch } = useDocEditor();
  const sheet = ui.mobileSheet;
  const onOpenChange = (open: boolean) => {
    if (!open) dispatch({ type: "closeMobileSheet" });
  };
  return (
    <>
      <MobileFormatSheet open={sheet === "format"} onOpenChange={onOpenChange} />
      <MobileActionsSheet open={sheet === "actions"} onOpenChange={onOpenChange} />
      <MobileInsertSheet open={sheet === "insert"} onOpenChange={onOpenChange} />
      <MobileDownloadSheet open={sheet === "download"} onOpenChange={onOpenChange} />
      <MobileLinkSheet open={sheet === "link"} onOpenChange={onOpenChange} tappedLink={tappedLink} />
      <MobileTableSheet open={sheet === "table"} onOpenChange={onOpenChange} />
    </>
  );
}
