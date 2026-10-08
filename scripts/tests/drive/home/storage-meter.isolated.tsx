// Isolated fixture for scripts/tests/drive/home-render.test.ts — NOT auto-discovered by `bun test` (no .test. in the
// name). It replaces the popover and the copy with mock.module, so it runs in its own process.
//
// The manager storage meter (components/drive/nav/storage-meter.tsx): used is everything the store keeps against
// the quota, and the popover — drawn inline here — says so and breaks it down into uploads, documents,
// presentations and forms, spreadsheets and files in other apps. A popover, not a tooltip, so a tap (touch) and
// the keyboard open it too, and screen readers reach it as a labelled dialog.

import { expect, mock, test } from "bun:test";
import { createElement as h, type ReactNode } from "react";
import { formatDriveBytes } from "@/lib/drive/format";
import type { DriveUsageView } from "@/lib/drive/types";
import { decode, translator } from "./fixture";

const tr = translator();
const noop = () => {};
mock.module("@/lib/i18n/context", () => ({ useT: () => tr, useI18n: () => ({ locale: "en", dir: "ltr", setLocale: noop, t: tr }) }));
type TriggerProps = { children?: ReactNode; nativeButton?: boolean; openOnHover?: boolean };
type ContentProps = { children?: ReactNode; "aria-label"?: string };
mock.module("@/components/ui/popover", () => ({
  Popover: ({ children }: { children?: ReactNode }) => h("div", { "data-popover": "" }, children),
  PopoverTrigger: ({ children, nativeButton, openOnHover }: TriggerProps) =>
    h("div", { "data-trigger": "", "data-native-button": String(nativeButton), "data-open-on-hover": String(openOnHover) }, children),
  PopoverContent: ({ children, ...props }: ContentProps) => h("div", { "data-popover-content": "", "data-label": props["aria-label"] }, children),
}));

const { renderToStaticMarkup } = await import("react-dom/server");
const { StorageMeter } = await import("@/components/drive/nav/storage-meter");

const GB = 1024 ** 3;
function usage(parts: { files: number; documents: number | null; sheets: number; apps: number | null }, quota = 10 * GB): DriveUsageView {
  const total = parts.files + (parts.documents ?? 0) + parts.sheets + (parts.apps ?? 0);
  return {
    usedBytes: parts.files, reservedBytes: 0, quotaBytes: quota, fileCount: 1, sheetBytes: parts.sheets,
    breakdown: { ...parts, total, quota },
  };
}
const render = (u: DriveUsageView | null) => decode(renderToStaticMarkup(h(StorageMeter, { usage: u })));

test("used is the total of every part; the tooltip says everything counts and breaks it down", () => {
  const parts = { files: 4096, documents: 2_000_000, sheets: 300_000, apps: 45_000_000 };
  const html = render(usage(parts));
  const total = parts.files + parts.documents + parts.sheets + parts.apps;
  expect(html).toContain(`${formatDriveBytes(total, "en")} of ${formatDriveBytes(10 * GB, "en")} used`);
  expect(html).toContain(tr("drive.storage.includesEverything"));
  expect(html).not.toContain("don't count toward storage");
  const tip = html.slice(html.indexOf("data-drive-storage-breakdown"));
  expect(tip).toContain(tr("drive.storage.breakdown.title"));
  for (const [part, bytes] of Object.entries(parts)) {
    expect(tip).toContain(`>${tr(`drive.storage.breakdown.${part}`)}</dt><dd`);
    expect(tip).toContain(`>${formatDriveBytes(bytes, "en")}</dd>`);
  }
  expect(html).not.toContain(tr("drive.storage.almostFull"));
});

test("a popover that a tap, the keyboard and hover all open, labelled for screen readers", () => {
  const html = render(usage({ files: 1, documents: 0, sheets: 0, apps: 0 }));
  expect(html).toContain('data-native-button="false" data-open-on-hover="true"');
  expect(html).toContain(`data-label="${tr("drive.storage.breakdown.title")}"`);
});

test("parts the module does not measure read unknown, and the copy does not claim everything", () => {
  const html = render(usage({ files: 4096, documents: null, sheets: 0, apps: null }));
  const tip = html.slice(html.indexOf("data-drive-storage-breakdown"));
  expect(tip).toContain(`>${tr("drive.storage.breakdown.documents")}</dt><dd class="text-end font-mono tabular-nums">—</dd>`);
  expect(tip).toContain(`>${tr("drive.storage.breakdown.apps")}</dt><dd class="text-end font-mono tabular-nums">—</dd>`);
  expect(tip).not.toContain(">0 B</dd>");
  expect(html).not.toContain(tr("drive.storage.includesEverything"));
});

test("documents and app files alone can fill it: warning from 90%, full at the quota", () => {
  expect(render(usage({ files: 0, documents: 6 * GB, sheets: 0, apps: 3.2 * GB }))).toContain(tr("drive.storage.almostFull"));
  expect(render(usage({ files: 0, documents: 4 * GB, sheets: 1 * GB, apps: 5 * GB }))).toContain(tr("drive.storage.full"));
});

test("nothing while the usage is loading", () => {
  expect(render(null)).toBe("");
});
