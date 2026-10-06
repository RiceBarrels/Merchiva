"use client";

import { useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  DynamicUIElement, DynamicUIElementContent, DynamicUIElementDescription, DynamicUIElementHeader, DynamicUIElementTitle,
} from "@/components/ui/dynamic-ui-element";
import { CHAT_TOPIC_MAX_LENGTH } from "@/spacetimedb/src/chat/logic";
import { useChannelWorkspace } from "@/components/channel/context";

/** Searchable list of colleagues; `exclude` hides people already in. */
function PeoplePicker({ selected, onToggle, exclude, single = false }: {
  selected: string[];
  onToggle: (hex: string) => void;
  exclude: string[];
  single?: boolean;
}) {
  const t = useT();
  const { people, meHex, nameOf, avatarOf } = useChannelWorkspace();
  const [q, setQ] = useState("");
  const list = useMemo(
    () => [...people.values()]
      .filter((p) => p.hex !== meHex && !exclude.includes(p.hex) && p.name.toLowerCase().includes(q.trim().toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [people, meHex, exclude, q],
  );
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute start-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("chat.searchTeam")} className="ps-8" />
      </div>
      {!single && selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((hex) => (
            <StatusBadge key={hex} tone="neutral" className="gap-1">
              {nameOf(hex)}
              <button type="button" onClick={() => onToggle(hex)} aria-label={t("chat.ws.close")}><X className="h-3 w-3" /></button>
            </StatusBadge>
          ))}
        </div>
      )}
      <div className="max-h-64 space-y-px overflow-y-auto">
        {list.length === 0 && <p className="px-2 py-4 text-center text-sm text-muted-foreground">{t("chat.noMatches")}</p>}
        {list.map((p) => {
          const on = selected.includes(p.hex);
          return (
            <button
              key={p.hex}
              type="button"
              onClick={() => onToggle(p.hex)}
              className={cn("flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-start", on ? "bg-muted" : "hover:bg-muted")}
            >
              <Avatar name={p.name} src={avatarOf(p.hex)} size="md" shape="square" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{p.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{t(`personnel.team.role.${p.role}`)}</span>
              </span>
              {on && <Check className="h-4 w-4 text-foreground" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Form state starts fresh on each open: the workspace remounts these with a new `key`. */
interface DialogProps { open: boolean; onOpenChange: (open: boolean) => void }

export function NewDmDialog({ open, onOpenChange, onPick }: DialogProps & { onPick: (hex: string) => void }) {
  const t = useT();
  return (
    <DynamicUIElement open={open} onOpenChange={onOpenChange}>
      <DynamicUIElementContent>
        <DynamicUIElementHeader>
          <DynamicUIElementTitle mobileTitle={t("chat.newMessageShort")}>{t("chat.newDirectMessage")}</DynamicUIElementTitle>
          <DynamicUIElementDescription>{t("chat.chooseTeamMember")}</DynamicUIElementDescription>
        </DynamicUIElementHeader>
        <PeoplePicker single selected={[]} exclude={[]} onToggle={onPick} />
      </DynamicUIElementContent>
    </DynamicUIElement>
  );
}

export function NewChannelDialog({ open, onOpenChange, onCreate }: DialogProps & {
  onCreate: (name: string, memberHexes: string[]) => Promise<boolean>;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const toggle = (hex: string) => setMembers((m) => (m.includes(hex) ? m.filter((x) => x !== hex) : [...m, hex]));
  const submit = async () => {
    setBusy(true);
    try {
      if (await onCreate(name.trim(), members)) onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <DynamicUIElement open={open} onOpenChange={onOpenChange}>
      <DynamicUIElementContent>
        <DynamicUIElementHeader>
          <DynamicUIElementTitle mobileTitle={t("chat.ws.newChannel")}>{t("chat.ws.newChannel")}</DynamicUIElementTitle>
          <DynamicUIElementDescription>{t("chat.ws.newChannelDesc")}</DynamicUIElementDescription>
        </DynamicUIElementHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("chat.groupNameRequired")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("chat.groupNamePlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("chat.ws.membersOptional")}</Label>
            <PeoplePicker selected={members} exclude={[]} onToggle={toggle} />
          </div>
          <Button className="w-full" onClick={() => void submit()} disabled={busy || !name.trim()}>
            {t("chat.ws.createChannelButton")}{members.length > 0 && ` (+${members.length})`}
          </Button>
        </div>
      </DynamicUIElementContent>
    </DynamicUIElement>
  );
}

export function AddPeopleDialog({ open, onOpenChange, existing, onAdd }: DialogProps & {
  existing: string[];
  onAdd: (memberHexes: string[]) => Promise<boolean>;
}) {
  const t = useT();
  const [members, setMembers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const toggle = (hex: string) => setMembers((m) => (m.includes(hex) ? m.filter((x) => x !== hex) : [...m, hex]));
  return (
    <DynamicUIElement open={open} onOpenChange={onOpenChange}>
      <DynamicUIElementContent>
        <DynamicUIElementHeader>
          <DynamicUIElementTitle mobileTitle={t("chat.addMembersMobile")}>{t("chat.addMembersToGroup")}</DynamicUIElementTitle>
          <DynamicUIElementDescription>{t("chat.selectMembersDesc")}</DynamicUIElementDescription>
        </DynamicUIElementHeader>
        <div className="space-y-4">
          <PeoplePicker selected={members} exclude={existing} onToggle={toggle} />
          <Button
            className="w-full"
            disabled={busy || members.length === 0}
            onClick={() => {
              setBusy(true);
              onAdd(members).then((ok) => { if (ok) onOpenChange(false); }).finally(() => setBusy(false));
            }}
          >
            {t("chat.add")} {members.length > 0 && `(${members.length})`}
          </Button>
        </div>
      </DynamicUIElementContent>
    </DynamicUIElement>
  );
}

export function TopicDialog({ open, onOpenChange, initial, onSave }: DialogProps & {
  initial: string;
  onSave: (topic: string) => Promise<boolean>;
}) {
  const t = useT();
  const [topic, setTopic] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <DynamicUIElement open={open} onOpenChange={onOpenChange}>
      <DynamicUIElementContent>
        <DynamicUIElementHeader>
          <DynamicUIElementTitle mobileTitle={t("chat.ws.editTopic")}>{t("chat.ws.editTopic")}</DynamicUIElementTitle>
          <DynamicUIElementDescription>{t("chat.ws.topicDesc")}</DynamicUIElementDescription>
        </DynamicUIElementHeader>
        <div className="space-y-3">
          <Input
            value={topic}
            maxLength={CHAT_TOPIC_MAX_LENGTH}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={t("chat.ws.topicPlaceholder")}
          />
          <p className="text-end font-mono text-[11px] tabular-nums text-muted-foreground">{topic.length}/{CHAT_TOPIC_MAX_LENGTH}</p>
          <Button
            className="w-full"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              onSave(topic).then((ok) => { if (ok) onOpenChange(false); }).finally(() => setBusy(false));
            }}
          >
            {t("chat.ws.save")}
          </Button>
        </div>
      </DynamicUIElementContent>
    </DynamicUIElement>
  );
}
