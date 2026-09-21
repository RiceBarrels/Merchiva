// Isolated fixture for scripts/tests/browser-shell/context-menu-render.test.ts — NOT auto-discovered
// by `bun test`. ShellContextMenu is mounted in app/manager/layout.tsx beside ManagerShell, so it
// server-renders on every /manager request: if it threw, or emitted markup before the first
// right-click, every page would pay for it. Module mocks stand in for Next's router and the auth /
// permissions / i18n providers the layout supplies, so this runs in its own process.

import { expect, mock, test } from "bun:test";

const ROUTER = { push: () => {}, replace: () => {}, back: () => {}, forward: () => {}, refresh: () => {}, prefetch: () => {} };

mock.module("next/navigation", () => ({
  useRouter: () => ROUTER,
  usePathname: () => "/manager/inventory",
  useSearchParams: () => new URLSearchParams(""),
  useParams: () => ({}),
  useSelectedLayoutSegment: () => null,
  useSelectedLayoutSegments: () => [],
}));
mock.module("@/lib/auth/context", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false }),
}));
mock.module("@/lib/context/permissions", () => ({
  usePermissions: () => ({ organizationId: "org-1", role: "owner", permissions: {} }),
}));
mock.module("@/lib/i18n/context", () => ({
  useT: () => (key: string) => key,
  useLocale: () => "en",
}));

const { createElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { ShellContextMenu } = await import("@/components/browser-shell/shared/shell-context-menu");

test("ShellContextMenu server-renders to nothing until a right-click resolves a hit", () => {
  expect(renderToStaticMarkup(createElement(ShellContextMenu))).toBe("");
});

test("server-rendering it twice is stable (no module-level state leaks between requests)", () => {
  expect(renderToStaticMarkup(createElement(ShellContextMenu))).toBe("");
  expect(renderToStaticMarkup(createElement(ShellContextMenu))).toBe("");
});
