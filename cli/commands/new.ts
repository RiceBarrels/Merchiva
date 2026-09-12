// `merchiva new page <name>`  — scaffold an authenticated /manager/ page
// `merchiva new hook <name>`  — scaffold a SpacetimeDB domain hook
//
// Page scaffolding follows the conventions in CLAUDE.md / AGENTS.md:
//   - "use client", PermissionGuard wrapper + content split
//   - useT() for i18n, usePermissions() for org context
//   - PageHeader + Spinner loading state
//   - i18n key added to all 6 locale files
//   - sidebar / bottom-bar nav snippets printed for the user to paste
//     (TS arrays are hand-curated with icons + permission keys, so we don't
//      auto-edit them — we hand you the exact line instead.)

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { c, ok, warn, info, fail } from "../lib/ui.ts";
import { LOCALES } from "../lib/config.ts";
import { findRepoRoot, toKebab, toPascal, toCamel, toTitle } from "../lib/repo.ts";

const PERMISSION_SECTIONS = [
  "dashboard",
  "inventory",
  "products",
  "sales",
  "staffing",
  "pos",
  "website",
] as const;

function pageTemplate(slug: string, comp: string, navKey: string, section: string): string {
  return `"use client";

import { useT } from "@/lib/i18n/context";
import { usePermissions } from "@/lib/context/permissions";
import { PermissionGuard } from "@/components/permission-guard";
import { PageHeader } from "@/components/page-header";
import { Spinner } from "@/components/ui/loaders/geometric";
import { useState } from "react";

export default function ${comp}Page() {
  return (
    <PermissionGuard section="${section}">
      <${comp}Content />
    </PermissionGuard>
  );
}

function ${comp}Content() {
  const t = useT();
  const { organizationId } = usePermissions();
  const [ready] = useState(true);

  if (!ready) {
    return (
      <div className="flex flex-col">
        <PageHeader title={t("nav.${navKey}")} />
        <div className="flex h-[60vh] items-center justify-center">
          <Spinner size={20} className="text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <PageHeader title={t("nav.${navKey}")} />
      <div className="p-4">
        {/* TODO: build ${slug} — read data via lib/spacetimedb/hooks, write via actions */}
        <p className="text-sm text-muted-foreground">${toTitle(slug)} — organization {organizationId}</p>
      </div>
    </div>
  );
}
`;
}

function hookTemplate(name: string): string {
  const Pascal = toPascal(name);
  const camel = toCamel(name);
  return `"use client";
// SpacetimeDB — ${toTitle(name)}
// Reads from the real-time SpacetimeDB cache via useTable, filtered by org.
// Mirrors the existing hooks in this directory (useInventory, useSales…).

import { useMemo } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { usePermissions } from "@/lib/context/permissions";

export interface ${Pascal} {
  id: string;
  // TODO: shape this to your generated table row
}

export function use${Pascal}(): [${Pascal}[], boolean] {
  const { organizationId } = usePermissions();

  // TODO: point this at your generated table, e.g. tables.${camel}
  const [rawRows, ready] = useTable(tables.${camel});

  const rows = useMemo<${Pascal}[]>(() => {
    if (!organizationId) return [];
    return rawRows
      .filter((r) => r.organizationId === organizationId)
      .map((r) => ({
        id: r.id.toString(),
        // TODO: map remaining columns
      }));
  }, [rawRows, organizationId]);

  return [rows, ready];
}
`;
}

function addI18nKey(root: string, navKey: string, english: string): { added: string[]; skipped: string[] } {
  const added: string[] = [];
  const skipped: string[] = [];
  for (const loc of LOCALES) {
    const file = join(root, "messages", `${loc}.json`);
    if (!existsSync(file)) continue;
    const json = JSON.parse(readFileSync(file, "utf-8")) as Record<string, Record<string, unknown>>;
    json.nav = json.nav || {};
    if (Object.prototype.hasOwnProperty.call(json.nav, navKey)) {
      skipped.push(loc);
      continue;
    }
    // English is the source string; other locales get it as a placeholder so
    // the app renders something readable until a translator fills it in.
    json.nav[navKey] = english;
    writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf-8");
    added.push(loc);
  }
  return { added, skipped };
}

function navSnippets(navKey: string, slug: string, section: string) {
  const sidebar = `  { labelKey: "nav.${navKey}", href: "/manager/${slug}", icon: Sparkles, permissionKey: "${section}" },`;
  console.log();
  console.log(c.bold("  Next, register navigation (icons are hand-picked, so paste these):"));
  console.log(c.dim(`\n  components/sidebar.tsx  → add to the navItems array:`));
  console.log(c.cyan(sidebar));
  console.log(c.dim(`\n  components/bottom-bar.tsx  → add to NAV_ITEMS (mobile, optional):`));
  console.log(c.cyan(sidebar));
  console.log(
    c.dim(`\n  Swap ${c.bold("Sparkles")} for any lucide-react icon and import it at the top of each file.`),
  );
}

function newPage(name: string) {
  const root = findRepoRoot();
  const slug = toKebab(name);
  if (!slug) {
    fail(`Invalid page name: "${name}"`);
    process.exit(1);
  }
  const comp = toPascal(slug);
  const navKey = toCamel(slug);
  const section = "dashboard"; // safe default; user can tighten it

  const dir = join(root, "app", "manager", slug);
  const file = join(dir, "page.tsx");
  if (existsSync(file)) {
    fail(`Page already exists: app/manager/${slug}/page.tsx`);
    process.exit(1);
  }

  mkdirSync(dir, { recursive: true });
  writeFileSync(file, pageTemplate(slug, comp, navKey, section), "utf-8");
  ok(`Created ${c.bold(`app/manager/${slug}/page.tsx`)}`);

  const { added, skipped } = addI18nKey(root, navKey, toTitle(slug));
  if (added.length) ok(`Added i18n key ${c.bold(`nav.${navKey}`)} to ${added.length} locale file(s)`);
  if (skipped.length) warn(`nav.${navKey} already present in: ${skipped.join(", ")}`);

  navSnippets(navKey, slug, section);

  console.log();
  info(`Default permission section is ${c.bold(`"${section}"`)} — change <PermissionGuard section> if needed.`);
  info(`Available sections: ${PERMISSION_SECTIONS.join(", ")}`);
  console.log();
  info(`Translate the non-English nav.${navKey} placeholders in messages/*.json when ready.`);
}

function newHook(name: string) {
  const root = findRepoRoot();
  const Pascal = toPascal(name);
  if (!Pascal) {
    fail(`Invalid hook name: "${name}"`);
    process.exit(1);
  }
  const dir = join(root, "lib", "spacetimedb", "hooks");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = join(dir, `use${Pascal}.ts`);
  if (existsSync(file)) {
    fail(`Hook already exists: lib/spacetimedb/hooks/use${Pascal}.ts`);
    process.exit(1);
  }
  writeFileSync(file, hookTemplate(name), "utf-8");
  ok(`Created ${c.bold(`lib/spacetimedb/hooks/use${Pascal}.ts`)}`);
  info(`Import it where needed: import { use${Pascal} } from "@/lib/spacetimedb/hooks/use${Pascal}";`);
}

export function newCommand(args: string[]) {
  const [kind, name] = args;
  if (!kind || !name) {
    console.log(`Usage:
  merchiva new page <name>    scaffold app/manager/<name>/page.tsx + i18n + nav snippets
  merchiva new hook <name>    scaffold lib/spacetimedb/hooks/use<Name>.ts

Examples:
  merchiva new page loyalty
  merchiva new page "gift cards"
  merchiva new hook bookings`);
    return;
  }
  switch (kind) {
    case "page":
      newPage(name);
      break;
    case "hook":
      newHook(name);
      break;
    default:
      fail(`Unknown scaffold type: "${kind}". Try: page, hook`);
      // Show available locales as a hint that scaffolding touches i18n.
      info(`(i18n files touched: ${readdirSync(join(findRepoRoot(), "messages")).join(", ")})`);
      process.exit(1);
  }
}
