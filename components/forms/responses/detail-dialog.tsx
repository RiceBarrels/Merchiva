"use client";

// One response in full: every answer in definition order (archived questions included when answered), file and photo
// answers as links into the respondent's Drive files, and — for a builder — the review state, the reviewer's note
// (form_response_review: Drive admins only, never the respondent) and delete.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Paperclip, Save, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import {
  DynamicUIElement, DynamicUIElementContent, DynamicUIElementFooter, DynamicUIElementHeader, DynamicUIElementTitle,
} from "@/components/ui/dynamic-ui-element";
import { Spinner } from "@/components/ui/loaders/geometric";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { driveHref } from "@/lib/drive/hrefs";
import { buildResponseTable } from "@/lib/forms/export";
import { FORM_MAX_REVIEW_NOTE_LENGTH } from "@/lib/forms/limits";
import type { FormDefinitionV1, FormResponseReviewView, FormResponseView, ReviewStatus } from "@/lib/forms/types";
import { useT } from "@/lib/i18n/context";
import { useDateFormat } from "@/lib/i18n/use-date-format";
import { deleteFormResponse, formsErrorKey, reviewFormResponse } from "@/lib/spacetimedb/actions/forms";
import { useSignedInMember } from "@/lib/spacetimedb/hooks/useDocs";
import { REVIEW_TONE } from "./table";

export interface ResponseDetailDialogProps {
  definition: FormDefinitionV1;
  /** null = closed. */
  response: FormResponseView | null;
  review: FormResponseReviewView | null;
  /** A builder of this form (owner or manager role): review, note and delete. */
  canReview: boolean;
  onClose: () => void;
}

/**
 * Where a file or photo answer opens in Drive: the viewer's own My files when they are the respondent, else the
 * respondent's files under Members (a Drive admin's view; anyone else would see Drive's "forbidden" there).
 */
export function responseFileHref(respondentMemberId: string, viewerMemberId: string | null, driveItemId: string): string {
  const preview = `item:${driveItemId}`;
  const own = !!viewerMemberId && viewerMemberId.toLowerCase() === respondentMemberId.toLowerCase();
  return own ? driveHref({ space: "my", preview }) : driveHref({ space: "members", member: respondentMemberId, preview });
}

function fileIds(value: unknown): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
  const ids = (value as { driveItemIds?: unknown }).driveItemIds;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

export function ResponseDetailDialog({ definition, response, review, canReview, onClose }: ResponseDetailDialogProps) {
  const t = useT();
  const formatDate = useDateFormat();
  const { memberId: viewerMemberId } = useSignedInMember();
  const [status, setStatus] = useState<ReviewStatus>("new");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset the editor whenever another response opens (or its saved review changes underneath).
  const responseId = response?.id ?? "";
  const savedStatus = response?.reviewStatus ?? "new";
  const savedNote = review?.reviewNote ?? "";
  useEffect(() => {
    setStatus(savedStatus);
    setNote(savedNote);
    setError(null);
  }, [responseId, savedStatus, savedNote]);

  const rows = useMemo(() => {
    if (!response) return [];
    const table = buildResponseTable(definition, [response], { t });
    return table.columns.flatMap((c, i) => {
      if (!c.questionId) return [];
      const question = definition.questions.find((q) => q.id === c.questionId);
      const value = response.answers[c.questionId];
      if (question?.archived && value === undefined) return [];
      const isFile = question?.type === "photo" || question?.type === "file";
      return [{ id: c.questionId, title: c.header, cell: table.rows[0]?.[i] ?? "", files: isFile ? fileIds(value) : [] }];
    });
  }, [definition, response, t]);

  if (!response) return null;
  const dirty = status !== savedStatus || note !== savedNote;

  const save = async () => {
    setBusy("save");
    setError(null);
    try {
      await reviewFormResponse(response.id, status, note.trim());
    } catch (err) {
      setError(t(formsErrorKey(err)));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("delete");
    setError(null);
    try {
      await deleteFormResponse(response.id);
      setConfirmDelete(false);
      onClose();
    } catch (err) {
      setConfirmDelete(false);
      setError(t(formsErrorKey(err)));
    } finally {
      setBusy(null);
    }
  };

  return (
    <DynamicUIElement open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DynamicUIElementContent className="sm:max-w-lg">
        <DynamicUIElementHeader>
          <DynamicUIElementTitle>{response.respondentName || t("forms.export.anonymous")}</DynamicUIElementTitle>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono tabular-nums">{formatDate(response.createdAt, { dateStyle: "medium", timeStyle: "short" })}</span>
            <span>·</span>
            <span>{t(`forms.export.source.${response.source}`)}</span>
            <StatusBadge tone={REVIEW_TONE[response.reviewStatus]} dot>{t(`forms.export.review.${response.reviewStatus}`)}</StatusBadge>
          </div>
        </DynamicUIElementHeader>

        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto p-4">
          <dl className="flex flex-col divide-y divide-border">
            {rows.map((row) => (
              <div key={row.id} className="flex flex-col gap-1 py-2.5 first:pt-0">
                <dt className="text-xs font-medium text-muted-foreground break-words">{row.title}</dt>
                <dd className="text-sm break-words whitespace-pre-line">
                  {row.files.length > 0 ? (
                    <span className="flex flex-col gap-1">
                      {row.files.map((id, i) => (
                        <Link
                          key={id}
                          href={responseFileHref(response.respondentMemberId, viewerMemberId, id)}
                          className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                          {`${t("forms.responses.file")} ${i + 1}`}
                        </Link>
                      ))}
                    </span>
                  ) : row.cell === "" ? (
                    <span className="text-muted-foreground">—</span>
                  ) : typeof row.cell === "number" ? (
                    <span className="font-mono tabular-nums">{row.cell}</span>
                  ) : (
                    row.cell
                  )}
                </dd>
              </div>
            ))}
          </dl>

          {canReview && (
            <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{t("forms.responses.review")}</span>
                <SegmentedControl<ReviewStatus>
                  size="sm"
                  value={status}
                  onChange={setStatus}
                  options={[
                    { value: "new", label: t("forms.export.review.new") },
                    { value: "reviewed", label: t("forms.export.review.reviewed") },
                  ]}
                />
              </div>
              <Textarea
                value={note}
                maxLength={FORM_MAX_REVIEW_NOTE_LENGTH}
                rows={3}
                placeholder={t("forms.responses.notePlaceholder")}
                onChange={(e) => setNote(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {review?.reviewedByName ? `${t("forms.responses.noteBy")} ${review.reviewedByName} · ` : ""}
                {t("forms.responses.noteHint")}
              </p>
            </div>
          )}
          {error && <Callout tone="danger">{error}</Callout>}
        </div>

        <DynamicUIElementFooter>
          {canReview && (
            <Button variant="ghost" className="me-auto text-destructive" disabled={busy !== null} onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" />
              {t("forms.responses.delete")}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>{t("forms.responses.close")}</Button>
          {canReview && (
            <Button onClick={() => void save()} disabled={!dirty || busy !== null}>
              {busy === "save" ? <Spinner size={14} /> : <Save className="h-4 w-4" />}
              {t("forms.responses.save")}
            </Button>
          )}
        </DynamicUIElementFooter>
      </DynamicUIElementContent>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("forms.responses.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("forms.responses.deleteBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "delete"}>{t("forms.responses.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy === "delete"} onClick={() => void remove()}>
              {busy === "delete" && <Spinner size={14} />}
              {t("forms.responses.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DynamicUIElement>
  );
}
