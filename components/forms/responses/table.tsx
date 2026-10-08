"use client";

// Responses ▸ Table: one compact row per response, newest first. Timestamps in mono tabular figures, the review
// state as a StatusBadge, the first answers as plain text (cells from buildResponseTable, so option ids always show
// as their labels). A row opens the detail dialog.

import { useMemo } from "react";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildResponseTable } from "@/lib/forms/export";
import type { FormDefinitionV1, FormResponseView, ReviewStatus } from "@/lib/forms/types";
import { useT } from "@/lib/i18n/context";
import { useDateFormat } from "@/lib/i18n/use-date-format";

/** Answer columns shown inline; the rest are in the detail dialog. */
const PREVIEW_COLUMNS = 2;
const META_COLUMNS = 4;

export const REVIEW_TONE: Record<ReviewStatus, StatusTone> = { new: "info", reviewed: "success" };

export function ResponsesTable({ definition, responses, onOpen }: {
  definition: FormDefinitionV1;
  /** Newest first. */
  responses: readonly FormResponseView[];
  onOpen: (responseId: string) => void;
}) {
  const t = useT();
  const formatDate = useDateFormat();
  const table = useMemo(() => {
    const built = buildResponseTable(definition, responses, { t, includeArchived: false });
    // buildResponseTable orders oldest first; key the rows back to their responses.
    const ordered = [...responses].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const cells = new Map(ordered.map((r, i) => [r.id, built.rows[i]]));
    return { columns: built.columns.slice(META_COLUMNS, META_COLUMNS + PREVIEW_COLUMNS), cells };
  }, [definition, responses, t]);

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-nowrap">{t("forms.export.submittedAt")}</TableHead>
            <TableHead>{t("forms.export.respondent")}</TableHead>
            <TableHead className="hidden md:table-cell">{t("forms.export.sourceHeader")}</TableHead>
            <TableHead>{t("forms.export.reviewHeader")}</TableHead>
            {table.columns.map((c) => (
              <TableHead key={c.id} className="hidden max-w-48 truncate lg:table-cell">{c.header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {responses.map((r) => {
            const cells = table.cells.get(r.id) ?? [];
            return (
              <TableRow
                key={r.id}
                tabIndex={0}
                className="cursor-pointer"
                onClick={() => onOpen(r.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(r.id); } }}
              >
                <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums">
                  {formatDate(r.createdAt, { dateStyle: "medium", timeStyle: "short" })}
                </TableCell>
                <TableCell className="max-w-40 truncate">{r.respondentName || t("forms.export.anonymous")}</TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">{t(`forms.export.source.${r.source}`)}</TableCell>
                <TableCell>
                  <StatusBadge tone={REVIEW_TONE[r.reviewStatus]} dot>{t(`forms.export.review.${r.reviewStatus}`)}</StatusBadge>
                </TableCell>
                {table.columns.map((c, i) => {
                  const cell = cells[META_COLUMNS + i];
                  return (
                    <TableCell key={c.id} className={typeof cell === "number" ? "hidden font-mono tabular-nums lg:table-cell" : "hidden max-w-48 truncate lg:table-cell"}>
                      {cell === "" || cell === undefined ? <span className="text-muted-foreground">—</span> : String(cell)}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
