"use client";

// Share settings for one document: add people from the store, change or remove
// their access, set general access, copy the link.
//
// Loaded lazily by the docs home and the Docs, Sheets and Slides editors; must
// not import Tiptap or Yjs. Reads live rows (the document of any file type,
// grants, members) so the dialog reflects changes made by other people while
// it's open, and the copied link opens the file's own editor. Only the people
// who may open a document receive its rows (document_reader_index), and that
// always includes store management: "private" reads "Only people added and
// store management", and `docs.share.managersNote` says so.
//
// Only the owner may open a private file to the whole store (setDocumentVisibility,
// mirrored by lib/docs/access.ts docVisibilityRule and checked against the member
// the reducer sees: the tablet account on /store). For anyone else those options
// are off, and making a store file private asks first, since they could not undo it.

import { useId, useMemo, useState } from "react";
import { Link2, Loader2, Lock, Store, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Eyebrow } from "@/components/ui/eyebrow";
import { IconTile } from "@/components/ui/icon-tile";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MakePrivateDialog } from "@/components/docs/dialogs/make-private-dialog";
import { memberCanUseDocs } from "@/components/docs/home/member-gate";
import { usePermissions } from "@/lib/context/permissions";
import { DOC_GRANT_ROLES, docVisibilityRule, sameMemberId } from "@/lib/docs/access";
import { DOC_ERROR_I18N_KEYS, docErrorCode } from "@/lib/docs/errors";
import { idString } from "@/lib/docs/mappers";
import type { DocAccess, DocAccessGrant, DocGrantRole, DocVisibility, DocumentMeta } from "@/lib/docs/types";
import { documentFileHref } from "@/lib/drive/hrefs";
import { useI18n } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { grantDocumentAccess, revokeDocumentAccess, setDocumentVisibility } from "@/lib/spacetimedb/actions";
import { useOrgMembers } from "@/lib/spacetimedb/hooks";
import { useCurrentMemberId, useDocsSender, useDocuments } from "@/lib/spacetimedb/hooks/useDocs";

export interface ShareDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  doc: DocumentMeta;
  access: DocAccess;
}

interface ShareMember {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  /** Passes the Docs gate; without it every document role resolves to none, grants included. */
  canUseDocs: boolean;
}

const ROLE_LABEL_KEYS: Readonly<Record<DocGrantRole, string>> = {
  viewer: "docs.share.roleViewer",
  commenter: "docs.share.roleCommenter",
  editor: "docs.share.roleEditor",
};

const VISIBILITY_ORDER: readonly DocVisibility[] = ["private", "org_view", "org_edit"];

const VISIBILITY_HINT_KEYS: Readonly<Record<DocVisibility, string>> = {
  private: "docs.share.visibilityPrivateHint",
  org_view: "docs.share.visibilityOrgViewHint",
  org_edit: "docs.share.visibilityOrgEditHint",
};

const DEFAULT_NEW_ROLE: DocGrantRole = "editor";

/**
 * Absolute link to the file's own editor (Docs, Sheets or Slides). On Capacitor the page origin is `capacitor://`,
 * so prefer the public app URL.
 */
function shareLink(doc: Pick<DocumentMeta, "id" | "fileType">): string {
  const configured = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "");
  const pageOrigin =
    typeof window !== "undefined" && /^https?:$/.test(window.location.protocol) ? window.location.origin : "";
  return `${configured || pageOrigin}${documentFileHref(doc)}`;
}

function PersonRow({
  name,
  detail,
  children,
}: {
  name: string;
  detail?: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex min-w-0 items-center gap-2.5 py-1.5">
      <Avatar size="sm" name={name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-foreground">{name}</p>
        {detail && <p className="truncate text-[11.5px] text-muted-foreground">{detail}</p>}
      </div>
      {children}
    </li>
  );
}

export function ShareDialog({ open, onOpenChange, doc: docProp, access: accessProp }: ShareDialogProps): React.JSX.Element {
  const { t, locale } = useI18n();
  const peopleHeadingId = useId();
  const generalHeadingId = useId();
  const hintId = useId();

  // Every file type: Sheets and Slides share through this dialog too.
  const { docs, trashed, grants, accessFor } = useDocuments({ fileTypes: "all" });
  const memberId = useCurrentMemberId();
  const sender = useDocsSender();
  const [memberRows] = useOrgMembers();
  const { organizations, currentOrg } = usePermissions();

  const liveDoc = useMemo(
    () => docs.find((d) => d.id === docProp.id) ?? trashed.find((d) => d.id === docProp.id) ?? null,
    [docs, trashed, docProp.id],
  );
  const doc = liveDoc ?? docProp;
  const access = liveDoc ? accessFor(liveDoc) : accessProp;
  // Visibility and grant changes are rejected on a trashed document, so its controls are read-only there.
  const canManage = access.canManage && !doc.trashedAt;

  const collator = useMemo(() => {
    try {
      return new Intl.Collator(locale, { sensitivity: "base" });
    } catch {
      return new Intl.Collator(undefined, { sensitivity: "base" });
    }
  }, [locale]);

  const members = useMemo(() => {
    const byId = new Map<string, ShareMember>();
    for (const row of memberRows) {
      if (row.organizationId !== doc.organizationId) continue;
      const id = idString(row.id);
      byId.set(id, {
        id,
        name: row.displayName.trim() || row.email,
        email: row.email,
        role: row.role,
        active: row.status === "active",
        canUseDocs: memberCanUseDocs({ role: row.role, permissions: row.permissions }),
      });
    }
    return byId;
  }, [memberRows, doc.organizationId]);

  const owner = members.get(doc.ownerMemberId);
  const visibilityRule = docVisibilityRule({
    visibility: doc.visibility,
    ownerMemberId: doc.ownerMemberId,
    senderMemberId: sender.memberId,
    ownerActive: owner?.active === true,
  });

  const docGrants = useMemo(() => {
    const list: { grant: DocAccessGrant; member: ShareMember | null }[] = [];
    for (const grant of grants) {
      if (grant.documentId === doc.id && grant.memberId !== doc.ownerMemberId) {
        list.push({ grant, member: members.get(grant.memberId) ?? null });
      }
    }
    return list.sort((a, b) => collator.compare(a.member?.name ?? "", b.member?.name ?? ""));
  }, [grants, doc.id, doc.ownerMemberId, members, collator]);

  // Owners and managers already manage every document, so they aren't offered here. Nor are
  // members who can't use Docs: a grant would list them without ever letting them open it.
  const candidates = useMemo(() => {
    const granted = new Set(docGrants.map(({ grant }) => grant.memberId));
    return [...members.values()]
      .filter(
        (m) =>
          m.active &&
          m.canUseDocs &&
          m.id !== doc.ownerMemberId &&
          m.role !== "owner" &&
          m.role !== "manager" &&
          !granted.has(m.id),
      )
      .sort((a, b) => collator.compare(a.name, b.name));
  }, [members, docGrants, doc.ownerMemberId, collator]);

  const storeName =
    organizations.find((org) => org.id === doc.organizationId)?.name ?? currentOrg?.name ?? t("docs.share.thisStore");

  const candidateItems = useMemo(() => candidates.map((m) => ({ value: m.id, label: m.name })), [candidates]);
  const roleItems = useMemo(
    () => DOC_GRANT_ROLES.map((role) => ({ value: role, label: t(ROLE_LABEL_KEYS[role]) })),
    [t],
  );
  const visibilityItems = useMemo(
    () =>
      VISIBILITY_ORDER.map((value) => ({
        value,
        label:
          value === "private"
            ? t("docs.share.visibilityPrivate")
            : fmt(t(value === "org_view" ? "docs.share.visibilityOrgView" : "docs.share.visibilityOrgEdit"), {
                store: storeName,
              }),
      })),
    [t, storeName],
  );

  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [newRole, setNewRole] = useState<DocGrantRole>(DEFAULT_NEW_ROLE);
  const [adding, setAdding] = useState(false);
  const [pendingMemberIds, setPendingMemberIds] = useState<ReadonlySet<string>>(() => new Set());
  const [visibilityPending, setVisibilityPending] = useState(false);
  const [confirmPrivate, setConfirmPrivate] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSelectedMemberId(null);
      setNewRole(DEFAULT_NEW_ROLE);
      setConfirmPrivate(false);
    }
  }

  // A pick that someone else granted in the meantime is no longer valid.
  const selected = selectedMemberId && candidates.some((m) => m.id === selectedMemberId) ? selectedMemberId : null;

  const reportError = (err: unknown) => {
    const code = docErrorCode(err);
    toast.error(t(code ? DOC_ERROR_I18N_KEYS[code] : "docs.share.failed"));
  };

  const setMemberPending = (id: string, pending: boolean) =>
    setPendingMemberIds((prev) => {
      const next = new Set(prev);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });

  const addPerson = async () => {
    if (!selected || adding || !canManage) return;
    setAdding(true);
    try {
      await grantDocumentAccess(doc.id, selected, newRole);
      setSelectedMemberId(null);
      toast.success(t("docs.share.updated"));
    } catch (err) {
      reportError(err);
    } finally {
      setAdding(false);
    }
  };

  const runForMember = async (id: string, task: () => Promise<void>) => {
    if (pendingMemberIds.has(id) || !canManage) return;
    setMemberPending(id, true);
    try {
      await task();
      toast.success(t("docs.share.updated"));
    } catch (err) {
      reportError(err);
    } finally {
      setMemberPending(id, false);
    }
  };

  const applyVisibility = async (visibility: DocVisibility) => {
    const openingToStore = doc.visibility === "private" && visibility !== "private";
    setVisibilityPending(true);
    try {
      await setDocumentVisibility(doc.id, visibility);
      toast.success(t("docs.share.updated"));
    } catch (err) {
      // The owner rule refused it (the rows changed while this was open): say so, not "no access anymore".
      const ownerRule = openingToStore && docErrorCode(err) === "forbidden" && !sameMemberId(sender.memberId, doc.ownerMemberId);
      if (ownerRule) toast.error(t("docs.share.ownerOnlyStore"));
      else reportError(err);
    } finally {
      setVisibilityPending(false);
    }
  };

  const changeVisibility = (visibility: DocVisibility) => {
    if (visibility === doc.visibility || visibilityPending || !canManage) return;
    if (visibility !== "private" && visibilityRule.storeLocked) {
      toast.error(t("docs.share.ownerOnlyStore"));
      return;
    }
    if (visibility === "private" && visibilityRule.privateIsOneWay) {
      setConfirmPrivate(true);
      return;
    }
    void applyVisibility(visibility);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink(doc));
      toast.success(t("docs.share.linkCopied"));
    } catch {
      toast.error(t("docs.share.copyFailed"));
    }
  };

  const displayName = (id: string, name: string | undefined) => {
    const base = name ?? t("docs.home.formerMember");
    return id === memberId ? fmt(t("docs.share.nameYou"), { name: base }) : base;
  };

  // Someone listed here who fails the Docs gate still can't open the document; say so instead of the email.
  const memberDetail = (member: ShareMember | null | undefined) =>
    member && !member.canUseDocs ? t("docs.share.noDocsAccess") : member?.email;

  const docTitle = doc.title.trim() || t("docs.untitled");

  return (
    <Sheet open={open} onOpenChange={(next) => onOpenChange(next)}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          {/* Stable i18n title: DynamicUIElement writes titles into ?dialogs= (never the document title). */}
          <SheetTitle>{t("docs.share.title")}</SheetTitle>
          <SheetDescription className="truncate" dir="auto">
            {docTitle}
          </SheetDescription>
        </SheetHeader>

        <div className="grid min-w-0 gap-4">
          <p className="truncate text-[13px] font-medium text-foreground sm:hidden" dir="auto">
            {docTitle}
          </p>

          {canManage ? (
            <div className="grid gap-1.5">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select
                  items={candidateItems}
                  value={selected}
                  onValueChange={(value) => setSelectedMemberId(typeof value === "string" ? value : null)}
                  disabled={adding || candidates.length === 0}
                >
                  <SelectTrigger aria-label={t("docs.share.addPeople")} className="w-full min-w-0 sm:flex-1">
                    <SelectValue placeholder={t("docs.share.addPeople")} />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        <Avatar size="xs" name={member.name} />
                        <span className="truncate">{member.name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Select
                    items={roleItems}
                    value={newRole}
                    onValueChange={(value) => {
                      if (value) setNewRole(value as DocGrantRole);
                    }}
                    disabled={adding}
                  >
                    <SelectTrigger aria-label={t("docs.share.role")} className="flex-1 sm:w-32 sm:flex-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roleItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" onClick={() => void addPerson()} disabled={!selected || adding} className="gap-1.5">
                    {adding ? (
                      <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserPlus aria-hidden className="h-4 w-4" />
                    )}
                    {t("docs.share.add")}
                  </Button>
                </div>
              </div>
              {candidates.length === 0 && <p className="text-xs text-muted-foreground">{t("docs.share.noMembers")}</p>}
            </div>
          ) : (
            <Callout tone="neutral">{t("docs.share.readOnlyNote")}</Callout>
          )}

          <section aria-labelledby={peopleHeadingId} className="grid min-w-0 gap-1">
            <Eyebrow as="h3" id={peopleHeadingId}>
              {t("docs.share.peopleWithAccess")}
            </Eyebrow>
            <ul className="max-h-64 min-w-0 divide-y divide-border overflow-y-auto">
              <PersonRow name={displayName(doc.ownerMemberId, owner?.name)} detail={memberDetail(owner)}>
                <span className="shrink-0 text-[12px] text-muted-foreground">{t("docs.share.owner")}</span>
              </PersonRow>
              {docGrants.map(({ grant, member }) => {
                const pending = pendingMemberIds.has(grant.memberId);
                const plainName = member?.name ?? t("docs.home.formerMember");
                return (
                  <PersonRow key={grant.id} name={displayName(grant.memberId, member?.name)} detail={memberDetail(member)}>
                    <Select
                      items={roleItems}
                      value={grant.role}
                      onValueChange={(value) => {
                        if (value && value !== grant.role) {
                          void runForMember(grant.memberId, () =>
                            grantDocumentAccess(doc.id, grant.memberId, value as DocGrantRole),
                          );
                        }
                      }}
                      disabled={!canManage || pending}
                    >
                      <SelectTrigger
                        size="sm"
                        aria-label={fmt(t("docs.share.roleFor"), { name: plainName })}
                        className="w-28 shrink-0 text-xs"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {roleItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {canManage && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={fmt(t("docs.share.removeAccessFor"), { name: plainName })}
                        title={t("docs.share.removeAccess")}
                        disabled={pending}
                        onClick={() => void runForMember(grant.memberId, () => revokeDocumentAccess(doc.id, grant.memberId))}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        {pending ? (
                          <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                        ) : (
                          <X aria-hidden className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </PersonRow>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby={generalHeadingId} className="grid min-w-0 gap-1.5">
            <Eyebrow as="h3" id={generalHeadingId}>
              {t("docs.share.generalAccess")}
            </Eyebrow>
            <div className="flex min-w-0 items-start gap-2.5">
              <IconTile icon={doc.visibility === "private" ? Lock : Store} size="sm" />
              <div className="grid min-w-0 flex-1 gap-1">
                <Select
                  items={visibilityItems}
                  value={doc.visibility}
                  onValueChange={(value) => {
                    if (value) changeVisibility(value as DocVisibility);
                  }}
                  disabled={!canManage || visibilityPending}
                >
                  <SelectTrigger
                    size="sm"
                    aria-labelledby={generalHeadingId}
                    aria-describedby={hintId}
                    className="w-full min-w-0 text-[13px]"
                  >
                    <SelectValue />
                    {visibilityPending && <Loader2 aria-hidden className="ms-auto h-3.5 w-3.5 animate-spin" />}
                  </SelectTrigger>
                  <SelectContent>
                    {visibilityItems.map((item) => (
                      <SelectItem
                        key={item.value}
                        value={item.value}
                        disabled={item.value !== "private" && visibilityRule.storeLocked}
                      >
                        {item.value === "private" ? <Lock aria-hidden /> : <Store aria-hidden />}
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p id={hintId} className="text-xs text-muted-foreground">
                  {t(VISIBILITY_HINT_KEYS[doc.visibility])}
                  {canManage && visibilityRule.storeLocked && ` ${t("docs.share.ownerOnlyStore")}`}
                </p>
              </div>
            </div>
          </section>

          <Callout tone="neutral">{t("docs.share.managersNote")}</Callout>

          <div className="flex items-center gap-2 border-t border-border pt-3">
            <Button type="button" variant="outline" size="sm" onClick={() => void copyLink()} className="gap-1.5">
              <Link2 aria-hidden className="h-3.5 w-3.5" />
              {t("docs.share.copyLink")}
            </Button>
            <Button type="button" size="sm" className="ms-auto" onClick={() => onOpenChange(false)}>
              {t("docs.share.done")}
            </Button>
          </div>
        </div>
        <MakePrivateDialog
          open={confirmPrivate}
          onOpenChange={setConfirmPrivate}
          ownerName={owner?.name ?? t("docs.home.formerMember")}
          onConfirm={() => void applyVisibility("private")}
        />
      </SheetContent>
    </Sheet>
  );
}
