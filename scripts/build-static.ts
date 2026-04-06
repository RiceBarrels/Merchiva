#!/usr/bin/env bun
/**
 * build:static — Static export for Capacitor/native builds.
 *
 * 1. Any page.static.tsx found anywhere replaces its page.tsx during build
 * 2. Dynamic route folders ([param]): page.tsx removed if no page.static.tsx
 * 3. API routes (app/api/): temporarily removed
 * 4. Runs `next build` with output: "export"
 * 5. Restores all original files (even on failure)
 *
 * Usage:
 *   bun scripts/build-static.ts [options]
 *
 * Options:
 *   --dry-run    Show what would be done without modifying files
 *   --verbose    Print detailed file operations
 *   --help       Show this help message
 */

import { execSync } from "child_process";
import { existsSync, renameSync, unlinkSync, writeFileSync, readFileSync, readdirSync, statSync, mkdirSync } from "fs";
import { join, relative } from "path";

const ROOT = join(import.meta.dir, "..");
const APP_DIR = join(ROOT, "app");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const verbose = args.includes("--verbose");
if (args.includes("--help")) {
  console.log(`
  build:static — Static export for Capacitor/native builds

  Usage:  bun scripts/build-static.ts [options]

  Options:
    --dry-run    Show what would be done without modifying files
    --verbose    Print detailed file operations
    --help       Show this help message

  How it works:
    • page.static.tsx: if found anywhere, replaces page.tsx during build.
    • Dynamic routes ([param] folders): page.tsx removed if no static fallback.
    • API routes (app/api/): temporarily removed for static export.
    • All files are restored after build (even on failure).
    • Output goes to ./out/
  `);
  process.exit(0);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function findFilesRecursive(dir: string, match: (name: string) => boolean): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...findFilesRecursive(full, match));
    } else if (match(entry)) {
      results.push(full);
    }
  }
  return results;
}

function isDynamicPath(filePath: string): boolean {
  return filePath.includes("[");
}

function rel(p: string) { return relative(ROOT, p); }

// ─── Backup/Restore ─────────────────────────────────────────────────────────

const BACKUP_DIR = join(ROOT, ".static-build-backup");
const backedUpFiles: string[] = [];

function backupFile(filePath: string) {
  if (!existsSync(filePath)) return;
  const backupPath = join(BACKUP_DIR, rel(filePath));
  mkdirSync(join(backupPath, ".."), { recursive: true });
  writeFileSync(backupPath, readFileSync(filePath));
  backedUpFiles.push(filePath);
}

function restoreAll() {
  for (const filePath of backedUpFiles) {
    const backupPath = join(BACKUP_DIR, rel(filePath));
    if (existsSync(backupPath)) {
      if (existsSync(filePath)) unlinkSync(filePath);
      renameSync(backupPath, filePath);
      if (verbose) console.log(`  restored: ${rel(filePath)}`);
    }
  }
  try { execSync(`rm -rf "${BACKUP_DIR}"`, { stdio: "ignore" }); } catch {}
}

// ─── Collect ────────────────────────────────────────────────────────────────

// 1. Find ALL page.static.tsx files (any directory)
const staticPages = findFilesRecursive(APP_DIR, (n) => /^page\.static\.(tsx|ts)$/.test(n));

// 2. Find dynamic route pages WITHOUT a page.static.tsx
const allPages = findFilesRecursive(APP_DIR, (n) => /^page\.(tsx|ts)$/.test(n));
const dynamicPagesNoStatic = allPages.filter((p) => {
  if (!isDynamicPath(p)) return false;
  const ext = p.endsWith(".ts") ? "ts" : "tsx";
  const staticVersion = p.replace(/page\.(tsx|ts)$/, `page.static.${ext}`);
  return !existsSync(staticVersion);
});

// 3. API routes
const apiRoutes = findFilesRecursive(join(APP_DIR, "api"), (n) => n === "route.ts");

const swappedStatic: { staticPath: string; pagePath: string }[] = [];

console.log(`
📦 build:static${dryRun ? " (dry run)" : ""}
   ${staticPages.length} page.static.tsx swap(s)
   ${dynamicPagesNoStatic.length} dynamic page(s) to remove
   ${apiRoutes.length} API route(s) to remove
`);

// ─── Execute ────────────────────────────────────────────────────────────────

try {
  // Swap page.static.tsx → page.tsx (anywhere)
  for (const staticPath of staticPages) {
    const pagePath = staticPath.replace(/page\.static\.(tsx|ts)$/, "page.$1");
    console.log(`  ✦ ${rel(pagePath)} → swap with ${staticPath.split("/").pop()}`);
    if (!dryRun) {
      if (existsSync(pagePath)) backupFile(pagePath);
      renameSync(staticPath, pagePath);
      swappedStatic.push({ staticPath, pagePath });
    }
  }

  // Remove dynamic pages with no static fallback
  for (const pagePath of dynamicPagesNoStatic) {
    console.log(`  ✕ ${rel(pagePath)} → remove (dynamic, no fallback)`);
    if (!dryRun) {
      backupFile(pagePath);
      unlinkSync(pagePath);
    }
  }

  // Remove API routes
  for (const routePath of apiRoutes) {
    console.log(`  ✕ ${rel(routePath)} → remove (API)`);
    if (!dryRun) {
      backupFile(routePath);
      unlinkSync(routePath);
    }
  }

  if (dryRun) {
    console.log("\n  (dry run — no files modified, no build executed)\n");
    process.exit(0);
  }

  console.log(`\n🔨 Running next build with output: "export"...\n`);
  execSync("bun next build", {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, NEXT_OUTPUT: "static" },
  });
  console.log(`\n✅ Static build complete! Output in ./out/\n`);

} catch (err) {
  console.error("\n❌ Build failed!\n");
  process.exitCode = 1;
} finally {
  if (!dryRun) {
    console.log("🔄 Restoring original files...");
    // Restore swapped static files
    for (const { staticPath, pagePath } of swappedStatic) {
      if (existsSync(pagePath)) renameSync(pagePath, staticPath);
    }
    // Restore backed up originals
    restoreAll();
    console.log("✅ All files restored.\n");
  }
}
