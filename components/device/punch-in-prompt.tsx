"use client";

// "Punch in now?" bottom sheet with Yes highlighted. "No" continues without
// a punch straight away (one drawer, no second warning). When `scan` is
// given, "Yes" opens that scanner pane instead of punching directly (the
// personal phone must scan the store QR to punch).

import { useEffect, useState, type ReactNode } from "react";
import { Clock } from "lucide-react";
import { toast } from "sonner";
import { hapticLight, hapticSuccess } from "@/lib/haptics";
import { recordPunch } from "@/lib/spacetimedb/actions";
import { Button } from "@/components/ui/button";
import { DeviceDrawer } from "./device-drawer";

export interface PunchInPromptLabels {
  title: string;
  body: string;
  yes: string;
  no: string;
  punchedIn: string;
  failed: string;
}

export interface PunchInPromptProps {
  open: boolean;
  /** Member's 4-digit punch-in code; the prompt is inert without one. */
  code: string | null | undefined;
  /** Shown after the "punched in" toast. */
  name?: string;
  labels: PunchInPromptLabels;
  /** Punched in successfully. */
  onDone: () => void;
  /** Chose to continue without punching in. */
  onSkip?: () => void;
  maxWidth?: number;
  /** Scan-gated punch: "Yes" opens this pane; call `done` once the punch is recorded. */
  scan?: { title: string; render: (done: () => void) => ReactNode };
}

export function PunchInPrompt({ open, code, name, labels, onDone, onSkip, maxWidth = 400, scan }: PunchInPromptProps) {
  const [pane, setPane] = useState<"ask" | "scan">("ask");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setPane("ask");
  }, [open]);

  const punchIn = async () => {
    if (!code || busy) return;
    if (scan) {
      hapticLight();
      setPane("scan");
      return;
    }
    setBusy(true);
    try {
      await recordPunch(code, "in");
      hapticSuccess();
      toast.success(name ? `${labels.punchedIn} · ${name}` : labels.punchedIn);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : labels.failed);
    } finally {
      setBusy(false);
    }
  };

  const skip = () => {
    hapticLight();
    (onSkip ?? onDone)();
  };

  if (pane === "scan" && scan) {
    return (
      <DeviceDrawer
        open={open}
        onOpenChange={(o) => { if (!o) setPane("ask"); }}
        title={scan.title}
        onCancel={() => setPane("ask")}
        maxWidth={maxWidth}
      >
        {scan.render(() => { setPane("ask"); onDone(); })}
      </DeviceDrawer>
    );
  }

  return (
    <DeviceDrawer
      open={open}
      onOpenChange={(o) => { if (!o) skip(); }}
      title={labels.title}
      cancelLabel={labels.no}
      onCancel={skip}
      maxWidth={maxWidth}
    >
      <p className="text-[13px] text-muted-foreground leading-relaxed mb-3">{labels.body}</p>
      <Button type="button" autoFocus onClick={punchIn} disabled={busy} className="h-11 w-full text-[14px] gap-2">
        <Clock className="h-4 w-4" />
        {labels.yes}
      </Button>
    </DeviceDrawer>
  );
}
