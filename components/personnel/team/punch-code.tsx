"use client";

// The punch-in code on a member's card in the org inspector.
//
// The same 4 digits also unlock the shared store tablet, so `member_punch_code`
// is RLS'd to `userId = :sender`: you can read your own code and nobody else's,
// not even as the owner. A manager therefore gets two things here — whether a
// code exists (`org_member.hasPunchCode`, the colleague-visible half) and the
// ability to set a new one. The digits themselves are never shown to anyone but
// their owner, and `setPunchInCode` rejects a duplicate within the store.

import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/loaders/geometric";
import { StatusBadge } from "@/components/ui/status-badge";
import { hapticSuccess, hapticWarning } from "@/lib/haptics";
import { useT } from "@/lib/i18n/context";
import { setPunchInCode } from "@/lib/spacetimedb/actions";
import { usePunchCode } from "@/lib/spacetimedb/hooks/usePunchCode";

const k = (key: string) => `personnel.team.punch.${key}`;

export interface PunchCodeFieldProps {
  /** org_member id of the person whose card this is. */
  memberId: string;
  /** True when the card is the signed-in user's own. */
  isMe: boolean;
  /** `org_member.hasPunchCode` — whether a code exists, never what it is. */
  hasCode: boolean;
  /** Caller may set other people's codes (owner, or team.edit). */
  canEdit: boolean;
  /** Invited-but-not-joined rows have no member to give a code to. */
  disabled?: boolean;
}

export function PunchCodeField({ memberId, isMe, hasCode, canEdit, disabled = false }: PunchCodeFieldProps) {
  const t = useT();
  const { code: myCode } = usePunchCode();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  // You always control your own; changing someone else's needs team.edit.
  const mayChange = !disabled && (isMe || canEdit);
  // Only the owner of a code can be told what it is.
  const shown = isMe ? myCode : null;
  const isSet = isMe ? !!myCode : hasCode;

  const save = async () => {
    if (!/^[0-9]{4}$/.test(draft)) {
      toast.error(t(k("mustBeFour")));
      return;
    }
    setBusy(true);
    try {
      await setPunchInCode(memberId, draft);
      hapticSuccess();
      toast.success(t(k("saved")));
      setEditing(false);
      setDraft("");
    } catch (err) {
      hapticWarning();
      // The reducer rejects a code already used at this store — its message is
      // the useful one, so it is shown rather than a generic failure.
      toast.error(err instanceof Error ? err.message : t(k("saveFailed")));
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    try {
      await setPunchInCode(memberId, null);
      hapticSuccess();
      toast.success(t(k("cleared")));
      setEditing(false);
      setDraft("");
    } catch (err) {
      hapticWarning();
      toast.error(err instanceof Error ? err.message : t(k("clearFailed")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">{t(k("label"))}</span>
        <StatusBadge tone={isSet ? "success" : "neutral"} size="xs">
          {isSet ? t(k("set")) : t(k("notSet"))}
        </StatusBadge>
      </div>

      {!editing ? (
        <div className="mt-1.5 flex items-center gap-2">
          <span className="flex h-8 flex-1 items-center rounded border border-border bg-muted/30 px-2.5 font-mono text-[12.5px] tabular-nums tracking-[0.3em]">
            {shown ?? (isSet ? "••••" : "—")}
          </span>
          {mayChange && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 shrink-0 text-[12px]"
              onClick={() => { setDraft(""); setEditing(true); }}
            >
              <KeyRound className="h-3.5 w-3.5" strokeWidth={1.75} />
              {isSet ? t(k("change")) : t(k("set_action"))}
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-1.5 space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              autoFocus
              placeholder={t(k("placeholder"))}
              className="h-8 flex-1 font-mono text-[12.5px] tabular-nums tracking-[0.3em]"
              onKeyDown={(e) => { if (e.key === "Enter" && draft.length === 4) void save(); }}
            />
            <Button size="sm" className="h-8 shrink-0 text-[12px]" onClick={save} disabled={busy || draft.length < 4}>
              {busy ? <Spinner size={14} /> : t("common.save")}
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              className="shrink-0"
              aria-label={t("common.cancel")}
              onClick={() => { setEditing(false); setDraft(""); }}
              disabled={busy}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          {isSet && (
            <Button variant="ghost" size="sm" className="h-7 w-full text-[12px] text-muted-foreground" onClick={clear} disabled={busy}>
              {t(k("clear"))}
            </Button>
          )}
        </div>
      )}

      <p className="mt-1.5 text-[10.5px] leading-snug text-muted-foreground">
        {isMe ? t(k("hintSelf")) : t(k("hintOther"))}
      </p>
    </div>
  );
}
