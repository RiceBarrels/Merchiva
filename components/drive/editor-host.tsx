"use client";

// Drive's host for its three editors (drive-ui UI-3b, CONTRACTS §2.11): the same route components /manager uses —
// Docs, Sheets and Slides — rendered for one document inside a device panel (the Drive lite app), in their phone
// layout. Each route loads with next/dynamic and ssr: false, so the lite app's own chunk carries none of them and
// a panel pulls only the editor it opens (each route then loads its heavy editor chunk itself).
//
// The routes do the rest: access for the panel's person (DriveActorOverrideContext), not found / no access /
// wrong type states, the management notice (already acknowledged by the lite host), and navigation through the
// panel's opener (DocsOpenProvider), so an editor's Back returns to the Drive screens instead of leaving the panel.

import dynamic from "next/dynamic";
import { LiteLoading } from "@/components/device/apps/lite";
import type { DriveDocKind } from "@/lib/drive/editors";

/**
 * What the panel hands a route. `isNew` stands in for `?new=1`, which a panel has no URL for: the document was just
 * made here (New ▸ Doc / Sheet / Slides, "Open as …"). A route that does not take `isNew` yet ignores it.
 */
interface PanelRouteProps {
  documentId: string;
  mobile?: boolean;
  isNew?: boolean;
}

const DocEditorRoute = dynamic<PanelRouteProps>(
  () => import("@/components/docs/editor/doc-editor-route").then((mod) => mod.DocEditorRoute),
  { ssr: false, loading: () => <LiteLoading /> },
);
const SheetEditorRoute = dynamic<PanelRouteProps>(
  () => import("@/components/sheets/sheet-editor-route").then((mod) => mod.SheetEditorRoute),
  { ssr: false, loading: () => <LiteLoading /> },
);
const SlidesEditorRoute = dynamic<PanelRouteProps>(
  () => import("@/components/slides/editor/slides-editor-route").then((mod) => mod.SlidesEditorRoute),
  { ssr: false, loading: () => <LiteLoading /> },
);

export interface DriveEditorScreenProps {
  kind: DriveDocKind;
  documentId: string;
  /** The phone layout (a device panel is narrow even on a wide tablet). */
  mobile?: boolean;
  /** The document was just made in this panel (what `?new=1` says on /manager). */
  isNew?: boolean;
}

/** One document's editor inside a panel; give it a `key` per document, so switching documents starts fresh. */
export function DriveEditorScreen({ kind, documentId, mobile, isNew }: DriveEditorScreenProps): React.JSX.Element {
  return (
    <div data-drive-editor={kind} className="flex h-full min-h-0 flex-1 flex-col">
      {kind === "doc" ? (
        <DocEditorRoute documentId={documentId} mobile={mobile} isNew={isNew} />
      ) : kind === "sheet" ? (
        <SheetEditorRoute documentId={documentId} mobile={mobile} isNew={isNew} />
      ) : (
        <SlidesEditorRoute documentId={documentId} mobile={mobile} isNew={isNew} />
      )}
    </div>
  );
}
