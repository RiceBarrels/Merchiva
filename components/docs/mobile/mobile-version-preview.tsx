"use client";

/** Full-screen version preview on mobile (docs-editor-ui spec §7.3); the live editor stays mounted underneath. */
import { useDocEditor } from "@/components/docs/editor/doc-editor-context";
import { PageSheet } from "@/components/docs/editor/page-sheet";
import { VersionPreview, VersionPreviewHeader } from "@/components/docs/panels/version-preview";
import { useT } from "@/lib/i18n/context";

export function MobileVersionPreview({ versionId }: { versionId: string }) {
  const t = useT();
  const { doc, canEditNow, actions, pageSetup, setPreviewEditor } = useDocEditor();
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("docs.versions.title")}
      className="fixed inset-0 z-[49] flex flex-col bg-background"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <VersionPreviewHeader
        variant="mobile"
        documentId={doc.id}
        versionId={versionId}
        canRestore={canEditNow}
        onBack={() => actions.selectVersion(null)}
        onRestore={() => actions.requestRestore(versionId)}
      />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <PageSheet setup={pageSetup} mobile>
          <VersionPreview documentId={doc.id} versionId={versionId} onEditorChange={setPreviewEditor} />
        </PageSheet>
      </div>
    </div>
  );
}
