// Isolated fixture for scripts/tests/docs-home/home-render.test.ts — NOT auto-discovered by
// `bun test` (no .test. in the name). It replaces modules with mock.module, so it must run in
// its own process; the harness spawns it once per scenario (DOCS_HOME_SCENARIO).
//
// Server-renders the real DocsHome tree (toolbar, template band, grid, empty states) with the
// data hooks, router and shell mocked, and checks what each backend / data state shows.
//
// The management notice (components/drive/notice) and the Drive actor are mocked too: the
// banner and the gate render markers, and their state is switched between renders, so every
// scenario checks the banner and the gate, and "empty" checks that creation waits for the
// acknowledgement. "empty" also runs the create and import paths with and without a device
// placement (a /store panel), checking which reducer wrapper each one reaches — through
// lib/docs directly, and through the page's own template band and drop zone, whose callback
// props are captured on render, the import dialog and the editor's File menu actions — and which
// copy a Drive failure shows. "docs" checks that star and copy are hidden and refused on /store
// while the operator is not the tablet account, from the list and the editor (they would be
// written for the tablet account), that they work when the operator is the tablet account, and
// that a rename on /store goes through Drive's renameDriveDocument for the operator.

import { expect, mock, test } from "bun:test";
import { createElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { docItemActionGroups, type DocItemAction, type DocListItem } from "@/components/docs/home/doc-list-model";
import { docAccessFromRole } from "@/lib/docs/access";
import type { DocPlacement } from "@/lib/docs/create";
import { documentHref } from "@/lib/docs/hrefs";
import type { DocTemplateId } from "@/lib/docs/templates";
import type { DocumentMeta } from "@/lib/docs/types";
import { DriveClientError } from "@/lib/drive/errors";

type Scenario = "checking" | "not_published" | "empty" | "docs" | "trash-empty" | "no-matches";
const SCENARIO = (process.env.DOCS_HOME_SCENARIO ?? "checking") as Scenario;

const SEARCH: Record<Scenario, string> = {
  checking: "",
  not_published: "",
  empty: "",
  docs: "",
  "trash-empty": "?scope=trash",
  "no-matches": "?q=zzzz-nothing",
};

const DOC_A = "1f0e4c52-8d1a-4b6e-9c3f-2a7b5d9e0c11";
const DOC_B = "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

function makeDoc(patch: Partial<DocumentMeta> & { id: string }): DocumentMeta {
  return {
    organizationId: "org-1",
    ownerMemberId: "m-1",
    title: "",
    excerpt: "",
    icon: null,
    visibility: "org_edit",
    templateId: null,
    pageSetup: null,
    wordCount: 0,
    createdAt: new Date("2026-09-01T10:00:00Z"),
    updatedAt: new Date("2026-09-14T10:00:00Z"),
    lastEditorMemberId: null,
    trashedAt: null,
    trashedByMemberId: null,
    fileType: "doc",
    folderId: "",
    ...patch,
  };
}

const withDocs = SCENARIO === "docs" || SCENARIO === "no-matches";
const docs = withDocs
  ? [
      makeDoc({ id: DOC_A, title: "Shift handover notes", excerpt: "Cash drawer counted" }),
      makeDoc({ id: DOC_B, title: "", visibility: "private", ownerMemberId: "m-2" }),
    ]
  : [];

const docsState = {
  docs,
  trashed: [] as DocumentMeta[],
  starredIds: new Set<string>(withDocs ? [DOC_A] : []),
  grants: [],
  accessFor: () => docAccessFromRole("manager", false),
  isReady: SCENARIO !== "checking",
  backendStatus: SCENARIO === "checking" ? "checking" : SCENARIO === "not_published" ? "not_published" : "ready",
};

const MEMBERS = [
  { id: "m-1", organizationId: "org-1", displayName: "Ana Ruiz", email: "ana@example.test", status: "active", role: "owner" },
  { id: "m-2", organizationId: "org-1", displayName: "Priya Patel", email: "priya@example.test", status: "active", role: "staff" },
];

const noop = () => {};
const resolved = async () => {};

// Switched between renders: the notice acknowledgement. The page renders as /manager unless a check sets
// placementNow (below).
let notice = { ready: true, needsAck: false, acknowledge: resolved };
const OPERATOR = "5b2f8e1c-3a4d-4e6f-8a9b-0c1d2e3f4a5b";
const STORE_PLACEMENT: DocPlacement = { space: "store", folderId: "", actingMemberId: OPERATOR };

/** Every document-creating reducer wrapper call, in order. */
const creates: { via: "createDocument" | "createDriveDocument"; input: Record<string, unknown> }[] = [];
// Switched between checks: the device placement (null = /manager), whether its operator is someone other than
// the tablet account (useDocsSender), and a failure for the next createDriveDocument / renameDriveDocument.
let placementNow: DocPlacement | null = null;
let actingForOtherNow = false;
let driveFailure: Error | null = null;
/** URLs the page opened, toasts it showed, and star / copy / rename writes, in order. */
const opened: string[] = [];
const toasts: { kind: string; message: string }[] = [];
const itemWrites: string[] = [];
const toastOf = (kind: string) => (message: string) => void toasts.push({ kind, message });

mock.module("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(SEARCH[SCENARIO]),
  useRouter: () => ({ push: noop, replace: noop, back: noop, forward: noop, refresh: noop, prefetch: noop }),
  usePathname: () => "/manager/docs",
  useParams: () => ({}),
}));
mock.module("next/link", () => ({
  default: (props: { href: string; prefetch?: boolean; children?: ReactNode } & Record<string, unknown>) => {
    const { href, prefetch, ...rest } = props;
    void prefetch;
    return createElement("a", { href, ...rest });
  },
}));
mock.module("next/dynamic", () => ({ default: () => () => null }));
mock.module("@/lib/spacetimedb/hooks/useDocs", () => ({
  useDocuments: () => docsState,
  useCurrentMemberId: () => "m-1",
  useDocsSender: () => ({ memberId: "m-1", actingForOther: actingForOtherNow }),
}));
mock.module("@/lib/spacetimedb/hooks", () => ({ useOrgMembers: () => [MEMBERS, true] }));
mock.module("@/lib/spacetimedb/actions", () => ({
  createDocument: async (input: Record<string, unknown>) => {
    creates.push({ via: "createDocument", input });
    return DOC_A;
  },
  duplicateDocument: async () => {
    itemWrites.push("copy");
    return DOC_B;
  },
  renameDocument: async (id: string, title: string) => void itemWrites.push(`rename:${id}:${title}`),
  restoreDocument: resolved,
  toggleDocumentStar: async (id: string) => void itemWrites.push(`star:${id}`),
  trashDocument: resolved,
  deleteDocumentForever: resolved,
}));
mock.module("@/lib/spacetimedb/actions/drive", () => ({
  createDriveDocument: async (input: Record<string, unknown>) => {
    creates.push({ via: "createDriveDocument", input });
    const failure = driveFailure;
    driveFailure = null;
    if (failure) throw failure;
    return DOC_B;
  },
  renameDriveDocument: async (id: string, title: string, opts?: { actingMemberId?: string | null }) => {
    const failure = driveFailure;
    driveFailure = null;
    if (failure) throw failure;
    itemWrites.push(`driveRename:${id}:${title}:${opts?.actingMemberId ?? ""}`);
  },
}));
mock.module("sonner", () => ({
  toast: Object.assign(toastOf("message"), {
    error: toastOf("error"),
    success: toastOf("success"),
    warning: toastOf("warning"),
    loading: toastOf("loading"),
    dismiss: noop,
  }),
}));
mock.module("@/components/drive/notice/use-notice-ack", () => ({ useManagementNoticeAck: () => notice }));
mock.module("@/components/drive/notice/management-notice", () => ({
  ManagementNoticeBanner: ({ compact }: { compact?: boolean }) =>
    createElement("div", { "data-drive-notice": "banner", "data-compact": String(compact === true) }, "drive.disclosure.short"),
  ManagementNoticeGate: () => createElement("div", { "data-drive-notice": "gate", "data-open": String(notice.needsAck) }),
}));
mock.module("@/components/drive/drive-actor", () => ({
  useDocCreatePlacement: () => placementNow,
  useDriveActor: () => ({
    memberId: "m-1",
    actingMemberId: "",
    acting: false,
    role: "owner",
    surface: "manager",
    canViewAll: true,
    canEditAll: true,
    ceiling: null,
    ready: true,
  }),
}));
mock.module("@/lib/context/permissions", () => ({
  usePermissions: () => ({
    organizationId: "org-1",
    currentOrg: { id: "org-1", name: "Downtown" },
    role: "owner",
    permissions: {},
    organizations: [],
  }),
}));
mock.module("@/lib/auth/context", () => ({
  useAuth: () => ({ user: { id: "user-1", email: "ana@example.test", firstName: "Ana", lastName: "Ruiz" } }),
}));
mock.module("@/lib/browser-shell", () => ({
  useTabActions: () => ({ openUrl: (url: string) => void opened.push(url) }),
  dispositionFromKeyboard: () => "current",
}));
mock.module("@/lib/haptics", () => ({
  hapticLight: resolved,
  hapticMedium: resolved,
  hapticHeavy: resolved,
  hapticSuccess: resolved,
  hapticError: resolved,
  hapticWarning: resolved,
}));
mock.module("@/components/page-header", () => ({
  PageHeader: ({ title, right }: { title: string; right?: ReactNode }) =>
    createElement("header", null, createElement("h1", null, title), right),
}));
// DocsHome gets a stub dialog; the real one is kept for checkImportDialogPlacement.
const { ImportDialog: RealImportDialog } = await import("@/components/docs/dialogs/import-dialog");
mock.module("@/components/docs/dialogs/import-dialog", () => ({ ImportDialog: () => null }));
mock.module("@/components/docs/dialogs/rename-dialog", () => ({ RenameDialog: () => null }));
mock.module("@/components/docs/dialogs/delete-forever-dialog", () => ({ DeleteForeverDialog: () => null }));

// The real template band, drop zone and grid, recording the callbacks DocsHome hands them.
const captured: {
  onPick?: (id: DocTemplateId) => void;
  onFile?: (file: File) => void;
  onAction?: (item: DocListItem, action: DocItemAction) => void;
  items?: readonly DocListItem[];
} = {};
const templateRow = await import("@/components/docs/home/template-row");
const dropZone = await import("@/components/docs/home/import-drop-zone");
const docGrid = await import("@/components/docs/home/doc-grid");
const { TemplateRow } = templateRow;
const { ImportDropZone } = dropZone;
const { DocGrid } = docGrid;
mock.module("@/components/docs/home/template-row", () => ({
  ...templateRow,
  TemplateRow: (props: ComponentProps<typeof TemplateRow>) => {
    captured.onPick = props.onPick;
    return createElement(TemplateRow, props);
  },
}));
mock.module("@/components/docs/home/import-drop-zone", () => ({
  ...dropZone,
  ImportDropZone: (props: ComponentProps<typeof ImportDropZone>) => {
    captured.onFile = props.onFile;
    return createElement(ImportDropZone, props);
  },
}));
mock.module("@/components/docs/home/doc-grid", () => ({
  ...docGrid,
  DocGrid: (props: ComponentProps<typeof DocGrid>) => {
    captured.onAction = props.onAction;
    captured.items = props.items;
    return createElement(DocGrid, props);
  },
}));

const { renderToStaticMarkup } = await import("react-dom/server");
const { DocsHome } = await import("@/components/docs/home/docs-home");
const { createBlankDocument, createDocumentFromTemplate } = await import("@/lib/docs/create");
const { importAsNewDocument } = await import("@/lib/docs/import");
const { useDocActions } = await import("@/components/docs/editor/use-doc-actions");

function render(): string {
  return renderToStaticMarkup(createElement(DocsHome))
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

function disabledButtons(html: string): number {
  return html.match(/<button[^>]*disabled=""/g)?.length ?? 0;
}

function headerOf(html: string): string {
  return html.slice(html.indexOf("<header>"), html.indexOf("</header>"));
}

function occurrences(html: string, text: string): number {
  return html.split(text).length - 1;
}

/** Until the notice is acknowledged (or while that is unknown), nothing can be created or imported. */
function checkNoticeBlocksCreation(acked: string): void {
  expect(disabledButtons(headerOf(acked))).toBe(0);
  expect(occurrences(acked, "New document")).toBe(2); // the header's button and the empty state's
  for (const state of [{ ready: true, needsAck: true }, { ready: false, needsAck: false }]) {
    notice = { ...state, acknowledge: resolved };
    const html = render();
    expect(html).toContain(`data-drive-notice="gate" data-open="${state.needsAck}"`);
    expect(disabledButtons(headerOf(html))).toBe(2); // Import + New document
    expect(occurrences(html, "New document")).toBe(1); // the empty state offers none
    expect(disabledButtons(html)).toBeGreaterThan(disabledButtons(acked)); // the template band too
  }
  notice = { ready: true, needsAck: false, acknowledge: resolved };
}

/** /manager creates with createDocument; a /store panel with createDriveDocument, for the operator. */
async function checkCreatePlacement(): Promise<void> {
  const deps = { t: (key: string) => key, locale: "en", storeName: "Downtown", authorName: "Ana Ruiz" };
  const file = new File(["Till counted twice"], "Closing notes.txt", { type: "text/plain" });
  creates.length = 0;
  expect(await createDocumentFromTemplate("blank", deps)).toBe(DOC_A);
  expect(await createBlankDocument(null)).toBe(DOC_A);
  expect((await importAsNewDocument(file, { t: deps.t, locale: "en" })).documentId).toBe(DOC_A);
  expect(await createDocumentFromTemplate("blank", { ...deps, placement: STORE_PLACEMENT })).toBe(DOC_B);
  expect(await createBlankDocument(STORE_PLACEMENT)).toBe(DOC_B);
  expect(await createDocumentFromTemplate("shiftHandover", { ...deps, placement: STORE_PLACEMENT })).toBe(DOC_B);
  expect((await importAsNewDocument(file, { t: deps.t, locale: "en", placement: STORE_PLACEMENT })).documentId).toBe(DOC_B);

  expect(creates.map((call) => call.via)).toEqual([
    ...Array<"createDocument">(3).fill("createDocument"),
    ...Array<"createDriveDocument">(4).fill("createDriveDocument"),
  ]);
  for (const call of creates.slice(0, 3)) expect(call.input).not.toHaveProperty("actingMemberId");
  const placed = { fileType: "doc", space: "store", folderId: "", actingMemberId: OPERATOR };
  const [blank, blankAgain, template, imported] = creates.slice(3).map((call) => call.input);
  expect(blank).toMatchObject({ ...placed, templateId: "blank", html: "<p></p>", plainText: "", wordCount: 0 });
  expect(blank.initialState).toBeInstanceOf(Uint8Array);
  // The same input but for the Yjs state, whose client id is random per build.
  expect(blankAgain.initialState).toBeInstanceOf(Uint8Array);
  expect({ ...blankAgain, initialState: null }).toEqual({ ...blank, initialState: null });
  expect(template).toMatchObject({ ...placed, templateId: "shiftHandover" });
  expect(template.initialState).toBeInstanceOf(Uint8Array);
  expect(imported).toMatchObject({ ...placed, templateId: "blank", title: "Closing notes" });
  expect(String(imported.plainText)).toContain("Till counted twice");
}

async function until(done: () => boolean): Promise<void> {
  for (let i = 0; i < 400 && !done(); i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  expect(done()).toBe(true);
}

/** The error toast a check expects: the English copy, or the key while the drive fragments are not merged yet. */
const errorToasts = () => toasts.filter((entry) => entry.kind === "error").map((entry) => entry.message);

function expectErrorToast(key: string, english: string): void {
  const errors = errorToasts();
  expect(errors).toHaveLength(1);
  expect([key, english]).toContain(errors[0]);
}

/** On /store, the page's own create and import (template band, drop zone) reach createDriveDocument for the operator. */
async function checkHomePlacement(): Promise<void> {
  const file = new File(["Till counted twice"], "Closing notes.txt", { type: "text/plain" });
  placementNow = STORE_PLACEMENT;
  creates.length = 0;
  opened.length = 0;
  render();
  const starts = [() => captured.onPick?.("blank"), () => captured.onPick?.("shiftHandover"), () => captured.onFile?.(file)];
  for (const [index, start] of starts.entries()) {
    start();
    await until(() => opened.length === index + 1);
  }
  expect(creates.map((call) => call.via)).toEqual(Array<string>(3).fill("createDriveDocument"));
  for (const call of creates) {
    expect(call.input).toMatchObject({ fileType: "doc", space: "store", folderId: "", actingMemberId: OPERATOR });
  }
  expect(creates.map((call) => call.input.templateId)).toEqual(["blank", "shiftHandover", "blank"]);
  expect(opened).toEqual(Array<string>(3).fill(documentHref(DOC_B, { isNew: true })));

  // A Drive failure shows its own copy, not the generic "couldn't create" / "import failed".
  const failures: [() => void, Error, string, string][] = [
    [starts[0], new Error("[drive.operator] Operator session expired"), "drive.errors.operator", "Enter your PIN again to continue."],
    [starts[2], new DriveClientError("device_scope"), "drive.errors.deviceScope", "On a shared store device you can only use Store files."],
  ];
  for (const [start, failure, key, english] of failures) {
    toasts.length = 0;
    driveFailure = failure;
    start();
    await until(() => errorToasts().length > 0);
    expectErrorToast(key, english);
  }
  expect(opened).toHaveLength(3);
  placementNow = null;
}

type ElementProps = { children?: ReactNode; onChange?: (event: { target: { files: File[]; value: string } }) => void };

function findElement(node: ReactNode, match: (element: ReactElement<ElementProps>) => boolean): ReactElement<ElementProps> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, match);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement<ElementProps>(node)) return null;
  return match(node) ? node : findElement(node.props.children, match);
}

/** The import dialog (a file chosen in its hidden input) hands the placement on as well. */
async function checkImportDialogPlacement(): Promise<void> {
  const imported: string[] = [];
  // The dialog's element tree (its hooks run in the probe's render), reported through a prop.
  function Probe({ report }: { report(tree: ReactNode): void }) {
    report(RealImportDialog({ open: true, onOpenChange: noop, onImported: (id) => void imported.push(id) }));
    return null;
  }
  const file = new File(["Float checked"], "Opening.txt", { type: "text/plain" });
  for (const placement of [STORE_PLACEMENT, null]) {
    placementNow = placement;
    creates.length = 0;
    let tree: ReactNode = null;
    renderToStaticMarkup(createElement(Probe, { report: (rendered: ReactNode) => void (tree = rendered) }));
    const input = findElement(tree, (element) => element.type === "input");
    input?.props.onChange?.({ target: { files: [file], value: "" } });
    await until(() => creates.length === 1 && imported.length > 0);
    expect(creates[0].via).toBe(placement ? "createDriveDocument" : "createDocument");
    if (placement) expect(creates[0].input).toMatchObject({ fileType: "doc", space: "store", actingMemberId: OPERATOR });
    else expect(creates[0].input).not.toHaveProperty("actingMemberId");
    imported.length = 0;
  }
  placementNow = null;
}

/**
 * The editor's File ▸ New / template, star, copy and rename under a /store placement (an operator other than the
 * tablet account, then the tablet account itself) and on /manager.
 */
async function checkEditorActions(): Promise<void> {
  type Actions = ReturnType<typeof useDocActions>;
  const depsFor = (actingForOther: boolean) =>
    ({
      doc: makeDoc({ id: DOC_A, title: "Shift handover notes" }),
      access: docAccessFromRole("manager", false),
      canEditNow: true,
      editor: null,
      contentEditor: null,
      provider: null,
      ui: {},
      dispatch: noop,
      refs: {},
      pendingFocus: { current: null },
      t: (key: string) => key,
      locale: "en",
      pageSetup: null,
      ydoc: null,
      isMobile: true,
      tabActions: {},
      openDocsUrl: (url: string) => void opened.push(url),
      storeName: "Downtown",
      authorName: "Ana Ruiz",
      findVersion: () => undefined,
      setPreviewVersion: noop,
      pasteShortcut: "Ctrl+V",
      actingForOther,
    }) as unknown as Parameters<typeof useDocActions>[0];
  function Probe({ report, actingForOther }: { report(actions: Actions): void; actingForOther: boolean }) {
    report(useDocActions(depsFor(actingForOther)));
    return null;
  }
  const actionsFor = (placement: DocPlacement | null, actingForOther = false): Actions => {
    placementNow = placement;
    let actions: Actions | null = null;
    renderToStaticMarkup(createElement(Probe, { actingForOther, report: (rendered: Actions) => void (actions = rendered) }));
    if (!actions) throw new Error("useDocActions returned nothing");
    return actions;
  };

  const store = actionsFor(STORE_PLACEMENT, true);
  creates.length = 0;
  opened.length = 0;
  toasts.length = 0;
  itemWrites.length = 0;
  await store.createBlank();
  await store.createFromTemplate("shiftHandover");
  expect(creates.map((call) => [call.via, call.input.templateId, call.input.actingMemberId])).toEqual([
    ["createDriveDocument", "blank", OPERATOR],
    ["createDriveDocument", "shiftHandover", OPERATOR],
  ]);
  expect(opened).toEqual(Array<string>(2).fill(documentHref(DOC_B, { isNew: true })));
  driveFailure = new Error("[drive.operator] Operator session expired");
  await store.createBlank();
  expect(errorToasts()).toEqual(["drive.errors.operator"]); // this probe's t() returns the key
  for (const refused of [store.toggleStar, store.makeCopy]) {
    toasts.length = 0;
    await refused();
    expect(errorToasts()).toEqual(["drive.errors.forbidden"]);
  }
  expect(itemWrites).toEqual([]);

  // A rename on /store goes through Drive for the operator; a Drive failure shows its own copy and rejects.
  toasts.length = 0;
  await store.renameTo("Closing checklist");
  expect(itemWrites).toEqual([`driveRename:${DOC_A}:Closing checklist:${OPERATOR}`]);
  driveFailure = new Error("[drive.operator] Operator session expired");
  await expect(store.renameTo("Again")).rejects.toThrow("[drive.operator]");
  expect(errorToasts()).toEqual(["drive.errors.operator"]);

  // The operator is the tablet account: star and copy are theirs, so they run.
  const self = actionsFor(STORE_PLACEMENT, false);
  itemWrites.length = 0;
  toasts.length = 0;
  await self.toggleStar();
  await self.makeCopy();
  expect(itemWrites).toEqual([`star:${DOC_A}`, "copy"]);
  expect(errorToasts()).toEqual([]);

  const manager = actionsFor(null);
  creates.length = 0;
  toasts.length = 0;
  itemWrites.length = 0;
  await manager.createBlank();
  await manager.toggleStar();
  await manager.makeCopy();
  await manager.renameTo("Closing checklist");
  expect(creates.map((call) => call.via)).toEqual(["createDocument"]);
  expect(itemWrites).toEqual([`star:${DOC_A}`, "copy", `rename:${DOC_A}:Closing checklist`]);
  expect(errorToasts()).toEqual([]);
}

/**
 * On /store for an operator other than the tablet account, star and copy are left out of the list's menus and
 * refused (they would be written for the tablet account); for the tablet account itself and on /manager they run.
 */
async function checkActingItemActions(): Promise<void> {
  placementNow = STORE_PLACEMENT;
  actingForOtherNow = true;
  render();
  const item = captured.items?.find((entry) => entry.doc.id === DOC_A);
  if (!item || !captured.onAction) throw new Error("DocGrid was not rendered with the documents");
  expect(item.canStarAndCopy).toBe(false);
  expect(docItemActionGroups(item)).toEqual([["open", "openNewTab"], ["rename", "share"], ["trash"]]);
  for (const action of ["star", "unstar", "copy"] as const) {
    toasts.length = 0;
    captured.onAction(item, action);
    expectErrorToast("drive.errors.forbidden", "You don't have permission to do that.");
  }
  expect(itemWrites).toEqual([]);

  for (const placement of [STORE_PLACEMENT, null]) {
    placementNow = placement;
    actingForOtherNow = false;
    render();
    const own = captured.items?.find((entry) => entry.doc.id === DOC_A);
    if (!own || !captured.onAction) throw new Error("DocGrid was not rendered with the documents");
    expect(own.canStarAndCopy).toBe(true);
    expect(docItemActionGroups(own).flat()).toEqual(expect.arrayContaining(["unstar", "copy"]));
    itemWrites.length = 0;
    toasts.length = 0;
    captured.onAction(own, "star");
    captured.onAction(own, "copy");
    await until(() => itemWrites.length === 2);
    expect(itemWrites).toEqual([`star:${DOC_A}`, "copy"]);
    expect(errorToasts()).toEqual([]);
  }
  placementNow = null;
}

test(`docs home: ${SCENARIO}`, async () => {
  const html = render();
  expect(html).toContain("<h1>Docs</h1>");
  // The management notice in every state: the banner under the header, and the gate (closed once acknowledged).
  expect(html).toContain('</header><div data-drive-notice="banner" data-compact="false">drive.disclosure.short</div>');
  expect(html).toContain('data-drive-notice="gate" data-open="false"');

  switch (SCENARIO) {
    case "checking":
      expect(html).toContain("Loading documents…");
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain("Start a new document");
      expect(html).not.toContain("No documents yet");
      break;
    case "not_published":
      expect(html).toContain("Docs isn't available yet");
      expect(html).toContain("Documents will be ready after the next Merchiva update.");
      expect(html).not.toContain("Start a new document");
      expect(html).not.toContain("Loading documents…");
      // Import + New document are disabled.
      expect(html.match(/<button[^>]*disabled=""/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
      break;
    case "empty":
      expect(html).toContain("No documents yet");
      expect(html).toContain("Create a document or start from a template.");
      expect(html).toContain("Blank document");
      expect(html).not.toContain("Loading documents…");
      checkNoticeBlocksCreation(html);
      await checkCreatePlacement();
      await checkHomePlacement();
      await checkImportDialogPlacement();
      break;
    case "docs":
      expect(html).toContain("Shift handover notes");
      expect(html).toContain(`href="/manager/docs/edit?id=${DOC_A}"`);
      expect(html).toContain("Untitled document");
      expect(html).toContain("Cash drawer counted");
      expect(html).toContain("Today");
      expect(html).toContain('aria-label="More actions"');
      expect(html).not.toContain("No documents yet");
      await checkActingItemActions();
      itemWrites.length = 0;
      await checkEditorActions();
      break;
    case "trash-empty":
      expect(html).toContain("Trash is empty");
      expect(html).toContain("Documents stay in trash until someone deletes them forever.");
      break;
    case "no-matches":
      expect(html).toContain("No matching documents");
      expect(html).toContain("Clear filters");
      expect(html).not.toContain("Shift handover notes");
      break;
  }
});
