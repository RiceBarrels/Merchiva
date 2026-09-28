"use client";

// The holder's side of "Ask to edit" (sheets.md §5.5): "{name} wants to edit". Let them edit (flush, compact,
// release; the server keeps the lease for them for 60 s) or keep editing (decline). Unanswered, the server hands
// the lease over once the request is 30 s old and the holder has not edited since, which the countdown shows.
// Derived from the lease view, so it closes by itself when the request goes away.

import { useState } from "react";
import { useSheetEditor } from "@/components/sheets/editor/sheet-editor-context";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { SHEET_LEASE_REQUEST_GRACE_MS } from "@/lib/sheets/lease";
import { useNow } from "@/lib/use-now";

function Countdown({ deadlineMs }: { deadlineMs: number }) {
  const t = useT();
  const now = useNow(1000);
  const seconds = Math.max(0, Math.ceil((deadlineMs - now.getTime()) / 1000));
  return <p className="font-mono text-xs tabular-nums text-muted-foreground">{fmt(t("sheets.lease.autoHandOver"), { seconds })}</p>;
}

export function LeaseRequestDialog() {
  const t = useT();
  const { facade, actions } = useSheetEditor();
  const request = facade.lease.kind === "mine" ? facade.lease.request : null;
  // The request answered here (by its time), so the dialog stays closed while the answer travels.
  const [answered, setAnswered] = useState<number | null>(null);
  const open = request !== null && answered !== request.sinceMs;

  const answer = (run: () => Promise<void>) => {
    if (!request) return;
    setAnswered(request.sinceMs);
    void run();
  };

  return (
    <AlertDialog open={open} onOpenChange={() => {}}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{fmt(t("sheets.lease.requestTitle"), { name: request?.name ?? "" })}</AlertDialogTitle>
          <AlertDialogDescription>{t("sheets.lease.requestDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        {request && <Countdown deadlineMs={request.sinceMs + SHEET_LEASE_REQUEST_GRACE_MS} />}
        <AlertDialogFooter>
          <Button type="button" variant="outline" onClick={() => answer(actions.declineRequest)}>
            {t("sheets.lease.keepEditing")}
          </Button>
          <AlertDialogAction onClick={() => answer(actions.handOver)}>{fmt(t("sheets.lease.handOver"), { name: request?.name ?? "" })}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
