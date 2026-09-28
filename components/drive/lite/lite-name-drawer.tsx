"use client";

// Naming in the Drive lite app (drive-ui §14.4): "New folder" and "Rename" as a bottom sheet with one big text
// box and Save. The name is checked with the server's rules before it is sent (driveNameProblem) and cleaned the
// way the server stores it; a failed save keeps the sheet open with what was typed.

import { useState } from "react";
import { Check } from "lucide-react";
import { DeviceDrawer } from "@/components/device/device-drawer";
import { LiteButton } from "@/components/device/apps/lite";
import { cleanEntryName, DOC_TITLE_MAX, driveNameProblem, type DriveNameProblem } from "@/components/drive/model/names";
import { DRIVE_NAME_MAX } from "@/lib/drive/rules";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { useLiteDriveContext, type LiteNameTarget } from "./lite-context";

function problemText(problem: DriveNameProblem, kind: LiteNameTarget["kind"], t: (key: string) => string): string {
  switch (problem) {
    case "empty":
      return t("drive.dialogs.nameEmpty");
    case "tooLong":
      return fmt(t("drive.dialogs.nameTooLong"), { max: kind === "folder" || kind === "file" ? DRIVE_NAME_MAX : DOC_TITLE_MAX });
    case "invalid":
      return t("drive.dialogs.nameInvalid");
  }
}

export function LiteNameDrawer() {
  const t = useT();
  const { drive, panels } = useLiteDriveContext();
  const target = panels.state.name;
  const open = panels.state.open === "name";
  const [draft, setDraft] = useState(target?.initialName ?? "");
  const [touched, setTouched] = useState(false);
  const [shown, setShown] = useState<LiteNameTarget | null>(open ? target : null);

  // A fresh draft each time the sheet opens for a new target (adjust-state-on-prop-change).
  if (open && target !== shown) {
    setShown(target);
    setDraft(target?.initialName ?? "");
    setTouched(false);
  }

  const kind = target?.kind ?? "folder";
  const problem = driveNameProblem(draft, kind);
  const unchanged = target?.mode === "rename" && cleanEntryName(draft) === cleanEntryName(target.initialName);

  const save = () => {
    setTouched(true);
    if (!target || problem !== null || drive.busy) return;
    if (unchanged) {
      panels.close();
      return;
    }
    const name = cleanEntryName(draft);
    const write =
      target.mode === "rename" && target.entry
        ? drive.runWrite({ kind: "rename", entry: target.entry, name }, null)
        : target.mode === "newFolder" && target.target
          ? drive.runWrite({ kind: "newFolder", target: target.target, name }, null)
          : null;
    if (!write) return;
    // Closes only if the sheet is still this name's when the write lands (another sheet may be open by then).
    void write.then((ok) => {
      if (ok) panels.closeIf("name", target);
    });
  };

  return (
    <DeviceDrawer
      open={open}
      onOpenChange={(next) => { if (!next) panels.close(); }}
      title={t(target?.mode === "rename" ? "device.lite.drive.rename" : "drive.dialogs.newFolderTitle")}
    >
      <form
        className="flex flex-col gap-3 pb-1"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted-foreground">{t("device.lite.drive.name")}</span>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => setTouched(true)}
            dir="auto"
            autoFocus
            enterKeyHint="done"
            aria-invalid={touched && problem !== null}
            className="h-12 rounded-lg border border-input bg-background px-3 text-[16px] outline-none placeholder:text-muted-foreground aria-invalid:border-destructive"
          />
        </label>
        {touched && problem !== null && <p className="text-[13px] text-destructive">{problemText(problem, kind, t)}</p>}
        <LiteButton icon={Check} label={t("device.lite.drive.save")} busy={drive.busy} disabled={problem !== null} onClick={save} />
      </form>
    </DeviceDrawer>
  );
}
