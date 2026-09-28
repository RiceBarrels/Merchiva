// Isolated fixture for scripts/tests/docs-home/panels.test.ts — NOT auto-discovered by `bun test` (no .test. in the
// name). It replaces modules with mock.module, so it runs in its own process.
//
// DocsLite (components/device/apps/docs.tsx) wraps the manager's Docs screens in DriveActorProvider and
// LiteNoticeGate: on /store the screens see the PIN operator (override, placement), nothing renders before the
// management notice is acknowledged, and a spreadsheet or deck link keeps the current screen with a notice.
// useDocsSender says who the Docs reducers without an actingMemberId write for — the signed-in account, which on
// /store is the tablet — and whether that is someone other than the operator: star and copy hide then, and
// comment / version authorship is checked against the tablet account.
import { expect, mock, test } from "bun:test";
import { createElement as h, useContext } from "react";

const TABLET = "9d1c2b3a-4e5f-4a6b-8c7d-0e1f2a3b4c5d";
const OP = "5b2f8e1c-3a4d-4e6f-8a9b-0c1d2e3f4a5b";
const IDENTITY = "c0ffee".padEnd(64, "0");

let notice = { ready: true, needsAck: false, scope: "scope-1" };
/** The signed-in identity's org_member rows (the tablet account on /store). */
let memberRows: Record<string, unknown>[] = [];
const toasts: string[] = [];

function memberRow(id: string, role: string): Record<string, unknown> {
  return {
    id,
    organizationId: "org-1",
    status: "active",
    role,
    permissions: "{}",
    displayName: "Tablet",
    email: "tablet@example.test",
    userId: { toHexString: () => IDENTITY },
  };
}

const hooks = await import("@/lib/spacetimedb/hooks");
mock.module("@/lib/spacetimedb/hooks", () => ({
  ...hooks,
  useOrgMembers: () => [memberRows, true],
  useSpacetimeDB: () => ({ identity: { toHexString: () => IDENTITY } }),
}));
mock.module("@/lib/context/permissions", () => ({
  usePermissions: () => ({ organizationId: "org-1", role: "owner", permissions: {} }),
}));
mock.module("@/components/drive/notice/use-notice-ack", () => ({
  useManagementNoticeAck: () => ({ ...notice, acknowledge: async () => {} }),
}));
mock.module("@/lib/browser-shell", () => ({ useTabActions: () => ({ openUrl: () => {} }) }));
mock.module("sonner", () => ({
  toast: Object.assign((message: string) => void toasts.push(message), { error: (message: string) => void toasts.push(`error:${message}`) }),
}));
mock.module("@/components/docs/editor/doc-editor-route", () => ({ DocEditorRoute: () => h("main", null, "EDITOR") }));

const { useDriveActorOverride } = await import("@/lib/drive/actor-context");
const actor = await import("@/components/drive/drive-actor");
const { NoticeGateScope } = await import("@/components/drive/notice/management-notice");
const { useDocsOpenUrl } = await import("@/components/docs/docs-open-context");
const { useDocsSender } = await import("@/lib/spacetimedb/hooks/useDocs");

/** Links the home opens while rendering (the store-open check). */
let openOnRender: string[] = [];
mock.module("@/components/docs/home/docs-home", () => ({
  DocsHome: () => {
    const override = useDriveActorOverride();
    const placement = actor.useDocCreatePlacement();
    const scoped = useContext(NoticeGateScope);
    const sender = useDocsSender();
    const open = useDocsOpenUrl();
    for (const url of openOnRender) open(url, "current");
    return h("pre", null, `HOME ${JSON.stringify({ override, placement, scoped, sender })}`);
  },
}));

const { renderToStaticMarkup } = await import("react-dom/server");
const { DocsLite } = await import("@/components/device/apps/docs");

// 32-hex form on purpose: the provider canonicalizes it to the module's hyphenated reference form.
const OPERATOR = { id: "5B2F8E1C3A4D4E6F8A9B0C1D2E3F4A5B", displayName: "Op", role: "staff", userIdHex: null, punchInCode: null };

function renderLite(surface: "store" | "personal", member = OPERATOR): string {
  return renderToStaticMarkup(h(DocsLite, { surface, organizationId: "org-1", member, isManager: false })).replace(/&quot;/g, '"');
}

function home(html: string): {
  override: unknown;
  placement: unknown;
  scoped: boolean;
  sender: { memberId: string | null; actingForOther: boolean };
} {
  const at = html.indexOf("HOME ");
  if (at === -1) throw new Error(`no home in ${html.slice(0, 300)}`);
  return JSON.parse(html.slice(at + 5, html.indexOf("</pre>", at)));
}

test("/store: the screens see the operator; Docs reducers write for the tablet account, someone else", () => {
  notice = { ready: true, needsAck: false, scope: "scope-1" };
  memberRows = [memberRow(TABLET, "owner")];
  const json = home(renderLite("store"));
  expect(json.override).toEqual({ memberId: OP, actingMemberId: OP });
  expect(json.placement).toEqual({ space: "store", folderId: "", actingMemberId: OP });
  expect(json.scoped).toBe(true);
  expect(json.sender).toEqual({ memberId: TABLET, actingForOther: true });
});

test("/store with the tablet account as its own operator: nothing is written for someone else", () => {
  memberRows = [memberRow(OP, "owner")];
  expect(home(renderLite("store")).sender).toEqual({ memberId: OP, actingForOther: false });
  // Until the signed-in member is known, assume someone else (star and copy stay hidden).
  memberRows = [];
  expect(home(renderLite("store")).sender).toEqual({ memberId: null, actingForOther: true });
});

test("/personal: the panel's member, acting for no one", () => {
  memberRows = [memberRow(OP, "staff")];
  const json = home(renderLite("personal"));
  expect(json.override).toEqual({ memberId: OP, actingMemberId: "" });
  expect(json.placement).toBeNull();
  expect(json.sender).toEqual({ memberId: OP, actingForOther: false });
});

test("/manager (no provider): the signed-in member", () => {
  memberRows = [memberRow(TABLET, "owner")];
  const seen: unknown[] = [];
  function Probe({ report }: { report(sender: unknown): void }) {
    report(useDocsSender());
    return null;
  }
  renderToStaticMarkup(h(Probe, { report: (sender: unknown) => void seen.push(sender) }));
  expect(seen).toEqual([{ memberId: TABLET, actingForOther: false }]);
});

test("nothing renders before the management notice is acknowledged", () => {
  memberRows = [memberRow(TABLET, "owner")];
  notice = { ready: true, needsAck: true, scope: "scope-2" };
  let html = renderLite("store");
  expect(html).toContain('data-drive-notice="lite-gate"');
  expect(html).not.toContain("HOME ");
  notice = { ready: false, needsAck: false, scope: null as unknown as string };
  html = renderLite("store");
  expect(html).not.toContain("HOME ");
  expect(html).not.toContain("lite-gate");
  notice = { ready: true, needsAck: false, scope: "scope-1" };
});

test("a spreadsheet or deck link keeps the current screen and says where it opens", () => {
  toasts.length = 0;
  openOnRender = [
    "/manager/drive/sheet?id=3c9e2a41-7b5d-4f8e-9a1c-2d3e4f5a6b7c",
    "/manager/drive/slides?id=3c9e2a41-7b5d-4f8e-9a1c-2d3e4f5a6b7c",
    "/manager/docs",
  ];
  const html = renderLite("store");
  openOnRender = [];
  expect(html).toContain("HOME ");
  expect(toasts).toHaveLength(2);
  for (const message of toasts) expect(message).toMatch(/^(This file opens in Drive|docs\.editor\.otherTypeTitle)$/);
});
