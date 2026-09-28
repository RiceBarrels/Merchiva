"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { canonicalUuidText, isDocumentId } from "@/lib/docs/ids";
import { docEditorPageContext, type DocAccessLevel } from "@/lib/merchiva/workspace-page-context";
import { useMerchivaPageContext } from "@/lib/merchiva/page-context";
import { useDocument } from "@/lib/spacetimedb/hooks/useDocs";

/**
 * Tells Mr. Merchiva which document the Docs editor has open (`?id=`), with its title and what
 * this member may do in it. The title is only sent once the member may open the document — the
 * same rule DocEditorRoute follows for the tab title. Renders nothing; sits inside the page's
 * Suspense for useSearchParams.
 */
export function DocEditPageContext() {
  const search = useSearchParams();
  const rawId = search.get("id");
  const id = rawId && isDocumentId(rawId) ? rawId.toLowerCase() : null;
  const rawVersion = search.get("version")?.trim();
  const versionId = rawVersion ? canonicalUuidText(rawVersion) : null;
  const { doc, access } = useDocument(id);
  const open = !!doc && doc.fileType === "doc" && access.canView;
  const title = open ? doc.title : null;
  const level: DocAccessLevel = access.canEdit ? "edit" : access.canComment ? "comment" : "view";
  const context = useMemo(
    () =>
      id ? docEditorPageContext({ docId: id, doc: title !== null ? { title, access: level } : null, versionId }) : null,
    [id, title, level, versionId],
  );
  useMerchivaPageContext(context);
  return null;
}
