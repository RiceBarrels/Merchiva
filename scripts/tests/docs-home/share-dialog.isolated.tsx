// Isolated fixture for scripts/tests/docs-home/panels.test.ts — NOT auto-discovered by `bun test` (no .test. in the
// name). It replaces modules with mock.module, so it runs in its own process.
//
// The share dialog's "General access" against setDocumentVisibility's owner rule: only a private document's owner
// may open it to the store (while the owner is an active member), checked against the member the reducer sees
// (useDocsSender: the tablet account on /store). For anyone else the store options are disabled with a hint and
// refused; making a colleague's store document private asks first (the confirm's onConfirm makes the call); and a
// refusal by the owner rule says so instead of "you don't have access anymore". The sheet, selects and confirm
// dialog are replaced with plain elements that record their props, so the static render shows everything.
import { expect, mock, test } from "bun:test";
import { createElement as h, Fragment, type ReactNode } from "react";

import { docAccessFromRole } from "@/lib/docs/access";
import type { DocVisibility, DocumentMeta } from "@/lib/docs/types";

const DOC = "1f0e4c52-8d1a-4b6e-9c3f-2a7b5d9e0c11";
const OWNER = "5b2f8e1c-3a4d-4e6f-8a9b-0c1d2e3f4a5b";
const MANAGER = "9d1c2b3a-4e5f-4a6b-8c7d-0e1f2a3b4c5d";

let doc: DocumentMeta;
let sender = { memberId: MANAGER as string | null, actingForOther: false };
let ownerStatus = "active";
let visibilityFailure: Error | null = null;
const visibilityCalls: [string, string][] = [];
const toasts: string[] = [];

interface SelectProps {
  items: { value: string }[];
  value: string | null;
  disabled?: boolean;
  onValueChange?: (value: string | null) => void;
  children?: ReactNode;
}
let selects: SelectProps[] = [];
let confirm: { open: boolean; ownerName: string; onConfirm(): void } | null = null;

function makeDoc(visibility: DocVisibility): DocumentMeta {
  return {
    id: DOC, organizationId: "org-1", ownerMemberId: OWNER, title: "Rota", excerpt: "", icon: null, visibility,
    templateId: null, pageSetup: null, wordCount: 0, createdAt: new Date(), updatedAt: new Date(),
    lastEditorMemberId: null, trashedAt: null, trashedByMemberId: null, fileType: "doc", folderId: "",
  };
}

const passthrough = ({ children }: { children?: ReactNode }) => h(Fragment, null, children);

mock.module("@/components/ui/sheet", () => ({
  Sheet: passthrough,
  SheetContent: passthrough,
  SheetHeader: passthrough,
  SheetTitle: passthrough,
  SheetDescription: passthrough,
}));
mock.module("@/components/ui/select", () => ({
  Select: (props: SelectProps) => {
    selects.push(props);
    return h("div", { "data-select": props.items.map((item) => item.value).join(",") }, props.children);
  },
  SelectTrigger: passthrough,
  SelectValue: () => null,
  SelectContent: passthrough,
  SelectItem: ({ value, disabled, children }: { value: string; disabled?: boolean; children?: ReactNode }) =>
    h("option", { value, "data-disabled": disabled ? "true" : "false" }, children),
}));
mock.module("@/components/docs/dialogs/make-private-dialog", () => ({
  MakePrivateDialog: (props: { open: boolean; ownerName: string; onConfirm(): void }) => {
    confirm = props;
    return null;
  },
}));
mock.module("@/lib/spacetimedb/hooks/useDocs", () => ({
  useDocuments: () => ({ docs: [doc], trashed: [], grants: [], accessFor: () => docAccessFromRole("manager", false) }),
  useCurrentMemberId: () => sender.memberId,
  useDocsSender: () => sender,
}));
mock.module("@/lib/spacetimedb/hooks", () => ({
  useOrgMembers: () => [
    [
      { id: OWNER, organizationId: "org-1", displayName: "Priya Patel", email: "p@example.test", role: "staff", status: ownerStatus, permissions: "{}" },
      { id: MANAGER, organizationId: "org-1", displayName: "Ana Ruiz", email: "a@example.test", role: "manager", status: "active", permissions: "{}" },
    ],
    true,
  ],
}));
mock.module("@/lib/context/permissions", () => ({
  usePermissions: () => ({ organizations: [], currentOrg: { id: "org-1", name: "Downtown" } }),
}));
mock.module("@/lib/spacetimedb/actions", () => ({
  grantDocumentAccess: async () => {},
  revokeDocumentAccess: async () => {},
  setDocumentVisibility: async (id: string, visibility: string) => {
    visibilityCalls.push([id, visibility]);
    const failure = visibilityFailure;
    visibilityFailure = null;
    if (failure) throw failure;
  },
}));
mock.module("sonner", () => ({
  toast: Object.assign((message: string) => void toasts.push(message), {
    error: (message: string) => void toasts.push(`error:${message}`),
    success: (message: string) => void toasts.push(`success:${message}`),
  }),
}));

const { renderToStaticMarkup } = await import("react-dom/server");
const { ShareDialog } = await import("@/components/docs/dialogs/share-dialog");

function render(visibility: DocVisibility): { html: string; general: SelectProps } {
  doc = makeDoc(visibility);
  selects = [];
  confirm = null;
  const html = renderToStaticMarkup(
    h(ShareDialog, { open: true, onOpenChange: () => {}, doc, access: docAccessFromRole("manager", false) }),
  ).replace(/&#x27;/g, "'");
  const general = selects.find((select) => select.items.some((item) => item.value === "org_edit"));
  if (!general) throw new Error("no General access select");
  return { html, general };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

const OWNER_ONLY = /docs\.share\.ownerOnlyStore|Only the owner can share it with everyone in the store\./;

function reset(): void {
  visibilityCalls.length = 0;
  toasts.length = 0;
}

test("a manager cannot open a colleague's private document to the store", async () => {
  sender = { memberId: MANAGER, actingForOther: false };
  ownerStatus = "active";
  reset();
  const { html, general } = render("private");
  expect(html).toContain('<option value="org_view" data-disabled="true">');
  expect(html).toContain('<option value="org_edit" data-disabled="true">');
  expect(html).toContain('<option value="private" data-disabled="false">');
  expect(html).toMatch(OWNER_ONLY);
  general.onValueChange?.("org_edit");
  await settle();
  expect(visibilityCalls).toEqual([]);
  expect(toasts).toHaveLength(1);
  expect(toasts[0]).toMatch(/^error:/);
  expect(toasts[0]).toMatch(OWNER_ONLY);
});

test("the owner can, and so can a manager once the owner has left", async () => {
  for (const [who, status] of [[OWNER, "active"], [MANAGER, "removed"]] as const) {
    sender = { memberId: who, actingForOther: false };
    ownerStatus = status;
    reset();
    const { html, general } = render("private");
    expect(html).toContain('<option value="org_edit" data-disabled="false">');
    expect(html).not.toMatch(OWNER_ONLY);
    general.onValueChange?.("org_edit");
    await settle();
    expect(visibilityCalls).toEqual([[DOC, "org_edit"]]);
  }
  ownerStatus = "active";
});

test("on /store the rule is checked for the tablet account the reducer sees, not the operator", () => {
  // The operator (the owner) acts at a tablet signed in as the manager: the reducer compares the manager.
  sender = { memberId: MANAGER, actingForOther: true };
  const { html } = render("private");
  expect(html).toContain('<option value="org_edit" data-disabled="true">');
});

test("making a colleague's store document private asks first; the owner is not asked", async () => {
  sender = { memberId: MANAGER, actingForOther: false };
  reset();
  let { general } = render("org_edit");
  general.onValueChange?.("private");
  await settle();
  expect(visibilityCalls).toEqual([]);
  if (!confirm) throw new Error("no confirm dialog");
  expect(confirm.ownerName).toBe("Priya Patel");
  confirm.onConfirm();
  await settle();
  expect(visibilityCalls).toEqual([[DOC, "private"]]);

  sender = { memberId: OWNER, actingForOther: false };
  reset();
  ({ general } = render("org_edit"));
  general.onValueChange?.("private");
  await settle();
  expect(visibilityCalls).toEqual([[DOC, "private"]]);
});

test("a refusal by the owner rule says why, not 'no access anymore'", async () => {
  // The owner's row went away while the dialog was open, then came back: the server still refuses.
  sender = { memberId: MANAGER, actingForOther: false };
  ownerStatus = "removed";
  reset();
  const { general } = render("private");
  visibilityFailure = new Error("[doc.forbidden] Only the owner can share a private file with the whole store");
  general.onValueChange?.("org_view");
  await settle();
  expect(visibilityCalls).toEqual([[DOC, "org_view"]]);
  expect(toasts).toHaveLength(1);
  expect(toasts[0]).toMatch(OWNER_ONLY);
  ownerStatus = "active";
});
