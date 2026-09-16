"use client";

/**
 * Version preview (docs-editor-ui spec §5.2–5.3).
 *
 * `VersionPreview` renders inside the editor core's `PageSheet` while `ui.previewVersionId` is set. The live
 * `EditorContent` stays mounted but hidden, so the session stays alive.
 * - Loads the row from `useDocumentVersions(documentId, true)` and decodes it with `loadVersionJson(version)`.
 * - Renders a separate read-only `useEditor({ immediatelyRender: false, editable: false, content: json,
 *   extensions: buildDocExtensions({ mode: "preview", canEdit: false, … }) })`.
 * - States: loading (`Loader2`), error (`Callout tone="danger"` with `docs.versions.loadFailed` + retry), ready.
 * - `onEditorChange(editor | null)` hands the preview editor to the core, so export, print, word count, find and the
 *   outline use preview content.
 *
 * `VersionPreviewHeader` replaces `DocHeader` in preview mode: `flex h-12 items-center gap-2 border-b px-3`, containing:
 * - a back button (`docs.versions.back`) → `onBack`
 * - the title `fmt(t("docs.versions.previewing"), { time })`, and the version name when it has one
 * - "Restore this version" → `onRestore`, shown when `canRestore` (the core passes `access.canEdit`)
 *
 * `variant="mobile"` renders the compact safe-area header used by the mobile preview page.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Editor, JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { ArrowLeft, Loader2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { buildDocExtensions } from "@/lib/docs/editor-extensions";
import { formatDateTime } from "@/lib/docs/format";
import { loadVersionJson } from "@/lib/docs/versions";
import { useI18n } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { useDocumentVersions } from "@/lib/spacetimedb/hooks/useDocs";
import { cn } from "@/lib/utils";

export interface VersionPreviewProps {
  documentId: string;
  versionId: string;
  onEditorChange?: (editor: Editor | null) => void;
}

type PreviewState =
  | { readonly key: string; readonly status: "ready"; readonly json: JSONContent }
  | { readonly key: string; readonly status: "error" };

interface PreviewEditorProps {
  json: JSONContent;
  label: string;
  onEditorChange?: (editor: Editor | null) => void;
}

function PreviewEditor({ json, label, onEditorChange }: PreviewEditorProps) {
  const { t } = useI18n();
  const extensions = useMemo(() => buildDocExtensions({ mode: "preview", canEdit: false, coarsePointer: false, t }), [t]);
  const editor = useEditor(
    {
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      editable: false,
      textDirection: "auto",
      extensions,
      content: json,
      editorProps: {
        attributes: { class: "doc-prose", "aria-readonly": "true", "aria-label": label, spellcheck: "false" },
      },
    },
    [json, extensions],
  );

  const callbackRef = useRef(onEditorChange);
  useEffect(() => {
    callbackRef.current = onEditorChange;
  }, [onEditorChange]);

  useEffect(() => {
    const notify = callbackRef.current;
    notify?.(editor);
    return () => notify?.(null);
  }, [editor]);

  return <EditorContent editor={editor} />;
}

export function VersionPreview({ documentId, versionId, onEditorChange }: VersionPreviewProps): React.JSX.Element {
  const { t, locale } = useI18n();
  const { versions, isReady } = useDocumentVersions(documentId, true);
  const version = versions.find((item) => item.id === versionId) ?? null;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<PreviewState | null>(null);

  const key = version ? `${version.id}:${attempt}` : null;

  useEffect(() => {
    if (!version) return;
    const requestKey = `${version.id}:${attempt}`;
    let cancelled = false;
    let result: PreviewState | null = null;
    loadVersionJson(version)
      .then((json) => {
        result = { key: requestKey, status: "ready", json };
      })
      .catch((err: unknown) => {
        console.error("[docs] version preview failed", err);
        result = { key: requestKey, status: "error" };
      })
      .finally(() => {
        if (!cancelled && result) setState(result);
      });
    return () => {
      cancelled = true;
    };
  }, [version, attempt]);

  const failed = (isReady && !version) || (state !== null && state.key === key && state.status === "error");

  if (failed) {
    return (
      <div className="py-6">
        <Callout
          tone="danger"
          title={t("docs.versions.loadFailed")}
          action={
            version ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setAttempt((n) => n + 1)}>
                {t("docs.versions.retry")}
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  if (!version || !state || state.key !== key || state.status !== "ready") {
    return (
      <div data-version-id={versionId} className="flex min-h-[40vh] items-center justify-center" role="status" aria-label={t("common.loading")}>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div data-version-id={versionId} data-version-preview="">
      <PreviewEditor
        key={state.key}
        json={state.json}
        label={fmt(t("docs.versions.previewing"), { time: formatDateTime(version.createdAt, locale) })}
        onEditorChange={onEditorChange}
      />
    </div>
  );
}

export interface VersionPreviewHeaderProps {
  documentId: string;
  versionId: string;
  canRestore: boolean;
  onBack(): void;
  onRestore(): void;
  variant?: "desktop" | "mobile";
}

export function VersionPreviewHeader({
  documentId,
  versionId,
  canRestore,
  onBack,
  onRestore,
  variant = "desktop",
}: VersionPreviewHeaderProps): React.JSX.Element {
  const { t, locale } = useI18n();
  const { versions } = useDocumentVersions(documentId, true);
  const version = versions.find((item) => item.id === versionId) ?? null;
  const mobile = variant === "mobile";
  const title = version ? fmt(t("docs.versions.previewing"), { time: formatDateTime(version.createdAt, locale) }) : t("docs.versions.title");

  return (
    <header
      data-version-id={versionId}
      className={cn(
        "shrink-0 border-b border-border bg-background",
        mobile && "sticky top-[env(safe-area-inset-top,0px)] z-30",
      )}
    >
      <div className={cn("flex h-12 items-center gap-2", mobile ? "px-1.5" : "px-3")}>
        <Button
          type="button"
          variant="ghost"
          size={mobile ? "icon" : "icon-sm"}
          aria-label={t("docs.versions.back")}
          title={t("docs.versions.back")}
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className={cn("truncate font-medium text-foreground", mobile ? "text-[15px]" : "text-[13px]")}>{title}</h2>
          {version?.name && <p className="truncate text-[11.5px] text-muted-foreground">{version.name}</p>}
        </div>
        {canRestore && (
          <Button type="button" size="sm" disabled={!version} onClick={onRestore}>
            <RotateCcw className="h-3.5 w-3.5 rtl:-scale-x-100" />
            <span className={cn(mobile && "max-[380px]:sr-only")}>{t("docs.versions.restore")}</span>
          </Button>
        )}
      </div>
    </header>
  );
}
