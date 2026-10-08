import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DRIVE_TRASH_RETENTION_MS } from "@/lib/drive/rules";

/*
 * Drive UI copy makes no privacy promise it cannot keep (drive-ui.md §17, CONTRACTS C33). Store management (the
 * owner, managers and members granted drive.view / drive.edit) can open everything, including My files, so the
 * copy says who the product shows a file to and adds that management can see it. It never says a file is
 * "only yours" or "hidden".
 *
 * Scope: the drive-ui subtrees and leaves plus its overwrites, as they will ship (messages/, replaced by the
 * fragment value where a fragment defines the key). drive.disclosure.* is out of scope: it is integration-legal's
 * reviewed legal copy (drive-disclosure.json), and it is accurate at the data layer (C1).
 *
 * The i18n fragments under scripts/i18n/drive/ are temporary (integration-legal §6.7): W3.3 deletes them after
 * the release, once messages/ holds every key. So nothing here imports that folder statically; the overlay is
 * loaded only while it exists, and afterwards messages/ alone is the shipped copy.
 */

const LOCALES = ["en", "ar", "es", "fr", "hi", "zh-cn", "zh-hk", "zh-tw"] as const;
type Locale = (typeof LOCALES)[number];

const ROOT = join(import.meta.dir, "..", "..", "..");
const FRAGMENT_MODULE = join(ROOT, "scripts", "i18n", "drive", "fragment.ts");

const DRIVE_UI_OWNED = [
  "drive.home", "drive.nav", "drive.list", "drive.menu", "drive.dialogs", "drive.upload", "drive.preview",
  "drive.apps", "drive.members", "drive.storage", "drive.kind", "device.lite.drive", "nav.drive", "nav.sheets",
  "nav.slides", "device.catalog.drive", "device.catalogDesc.drive", "personnel.team.permissionSection.drive",
];
const DRIVE_UI_OVERWRITES = ["docs.share.managersNote", "docs.share.visibilityPrivate", "device.catalogDesc.drive", "drive.apps.notIncluded"];

const underPrefix = (key: string, prefix: string) => key === prefix || key.startsWith(`${prefix}.`);
const inScope = (key: string) => DRIVE_UI_OVERWRITES.includes(key) || DRIVE_UI_OWNED.some((p) => underPrefix(key, p));

/** One i18n fragment, as far as these tests need it: its name and its leaves by locale. */
interface Overlay {
  name: string;
  leaves: Record<Locale, Map<string, string>>;
}

/** The part of scripts/i18n/drive/fragment.ts used here. */
interface FragmentModule {
  loadFragments(): Array<{ name: string }>;
  leavesOf(frag: { name: string }, locale: Locale): Map<string, string>;
}

/** Every fragment while `modulePath` exists; none once W3.3 has retired the folder. */
async function loadOverlays(modulePath: string = FRAGMENT_MODULE): Promise<Overlay[]> {
  if (!existsSync(modulePath)) return [];
  const { loadFragments, leavesOf } = (await import(modulePath)) as FragmentModule;
  return loadFragments().map((frag) => ({
    name: frag.name,
    leaves: Object.fromEntries(LOCALES.map((l) => [l, leavesOf(frag, l)])) as Record<Locale, Map<string, string>>,
  }));
}

/** messages/<locale>.json, flattened like scripts/tests/i18n/keys.test.ts: objects are walked, anything else is a leaf. */
function loadMessages(locale: Locale): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (node: object, prefix: string) => {
    for (const [k, v] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (typeof v === "object" && v !== null && !Array.isArray(v)) walk(v, path);
      else out.set(path, String(v));
    }
  };
  walk(JSON.parse(readFileSync(join(ROOT, "messages", `${locale}.json`), "utf8")) as object, "");
  return out;
}

/** The in-scope copy of `locale` as it will ship: messages/, overridden by the fragments. */
function shippedCopy(overlays: ReadonlyArray<Overlay>, messages: Map<string, string>, locale: Locale): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of messages) if (inScope(key)) out.set(key, value);
  for (const overlay of overlays) for (const [key, value] of overlay.leaves[locale]) if (inScope(key)) out.set(key, value);
  return out;
}

const PRIVACY_PROMISE = /\b(only you|only the owner|hidden from|private to you)\b/i;

/**
 * Values that use one of the phrases about an ACTION, not about who can see a file. Each is pinned to its wording,
 * so rewording one into a visibility claim ("Only the owner can see this") fails again.
 */
const ACTION_NOT_VISIBILITY: Readonly<Record<string, RegExp>> = {
  "drive.dialogs.blocked.spaceNotAllowed": /^Only the owner can move this between My files and Store\.$/,
};

/** The promise `value` makes, or null. */
function privacyPromise(key: string, value: string): string | null {
  const hit = PRIVACY_PROMISE.exec(value)?.[0] ?? null;
  if (hit === null) return null;
  return ACTION_NOT_VISIBILITY[key]?.test(value) ? null : hit;
}

/**
 * Copy that tells someone where a file lives or who may see it. Each must name management (or the managers) in
 * every locale, so no translation drops the "management can still see it" clause.
 */
const MUST_NAME_MANAGEMENT = [
  "device.lite.drive.noticeShort",
  "device.lite.drive.toMyWarning",
  "drive.list.privateHint",
  "drive.dialogs.toMyWarning",
  "drive.members.adminNote",
  "docs.share.managersNote",
  "docs.share.visibilityPrivate",
];

/** How each locale says "management" / "managers" (the terms of integration-legal §6.6 and the seeds). */
const MANAGEMENT: Record<Locale, RegExp> = {
  en: /\bmanage(ment|rs)\b/i,
  es: /\b(dirección|gerentes)\b/i,
  fr: /\b(direction|responsables)\b/i,
  hi: /प्रबंधन|प्रबंधक/,
  ar: /إدارة|المديرين/,
  "zh-cn": /管理层|经理/,
  "zh-tw": /管理層|經理/,
  "zh-hk": /管理層|經理/,
};

describe("drive-ui copy privacy", () => {
  // Loaded inside the tests, so a fragment that fails to parse fails here with its message, not at module load.
  const copyOf = async (locale: Locale) => shippedCopy(await loadOverlays(), loadMessages(locale), locale);

  test("the scope holds the drive-ui copy and never the legal disclosure", async () => {
    const overlays = await loadOverlays();
    const en = shippedCopy(overlays, loadMessages("en"), "en");
    expect(en.size).toBeGreaterThan(300);
    // While the fragments exist, every drive-ui leaf is in scope; afterwards the scope is DRIVE_UI_OWNED over messages/.
    const ui = overlays.find((o) => o.name === "drive-ui");
    expect([...(ui?.leaves.en.keys() ?? [])].filter((k) => !en.has(k))).toEqual([]);
    expect([...en.keys()].filter((k) => underPrefix(k, "drive.disclosure"))).toEqual([]);
  });

  test("no en value promises privacy from colleagues or management", async () => {
    const promises = [...(await copyOf("en"))]
      .map(([key, value]) => ({ key, value, promise: privacyPromise(key, value) }))
      .filter((p) => p.promise !== null);
    expect(promises).toEqual([]);
  });

  test("every pinned exception still exists with its pinned wording", async () => {
    const en = await copyOf("en");
    for (const [key, shape] of Object.entries(ACTION_NOT_VISIBILITY)) expect({ key, ok: shape.test(en.get(key) ?? "") }).toEqual({ key, ok: true });
  });

  test.each([...LOCALES])("%s: copy about where a file lives says management can see it", async (locale) => {
    const copy = await copyOf(locale);
    const missing = MUST_NAME_MANAGEMENT.filter((key) => !MANAGEMENT[locale].test(copy.get(key) ?? ""));
    expect(missing).toEqual([]);
  });

  // The sweep deletes every trash root older than the retention with its subtree, folders included; only Docs,
  // Sheets and Slides stay (data-server.md serviceDriveSweep phase 2). So the notice names folders too.
  test.each([...LOCALES])("%s: the trash notice states the retention in lib/drive/rules.ts and names folders", async (locale) => {
    const copy = await copyOf(locale);
    const days = String(DRIVE_TRASH_RETENTION_MS / 86_400_000);
    const notice = copy.get("drive.home.trashNotice") ?? "";
    const folder = (copy.get("drive.kind.folder") ?? "").toLocaleLowerCase(locale);
    expect({ days, notice, states: new RegExp(`(^|\\D)${days}(\\D|$)`).test(notice) }).toEqual({ days, notice, states: true });
    expect({ folder, notice, names: folder !== "" && notice.toLocaleLowerCase(locale).includes(folder) }).toEqual({ folder, notice, names: true });
  });
});

describe("the check itself", () => {
  test("finds each promise phrase, in any case", () => {
    expect(privacyPromise("drive.list.privateHint", "Only you can see this.")).toBe("Only you");
    expect(privacyPromise("drive.list.privateHint", "Visible to only the owner")).toBe("only the owner");
    expect(privacyPromise("drive.list.storeHint", "Hidden from your team")).toBe("Hidden from");
    expect(privacyPromise("drive.list.storeHint", "This file is private to you.")).toBe("private to you");
  });

  test("passes copy that names who can see a file", () => {
    expect(privacyPromise("drive.list.privateHint", "In your files. Store management can see it.")).toBeNull();
    expect(privacyPromise("docs.share.visibilityPrivate", "Only people added and store management")).toBeNull();
  });

  test("an exception holds only for its key and its pinned wording", () => {
    const moveRule = "Only the owner can move this between My files and Store.";
    expect(privacyPromise("drive.dialogs.blocked.spaceNotAllowed", moveRule)).toBeNull();
    expect(privacyPromise("drive.dialogs.blocked.noPermission", moveRule)).toBe("Only the owner");
    expect(privacyPromise("drive.dialogs.blocked.spaceNotAllowed", "Only the owner can see this.")).toBe("Only the owner");
  });

  test("the management terms reject copy that drops the clause", () => {
    expect(MANAGEMENT.en.test("It moves to your files.")).toBe(false);
    expect(MANAGEMENT["zh-cn"].test("它会移到你的文件中。")).toBe(false);
    expect(MANAGEMENT.fr.test("Il passe dans vos fichiers.")).toBe(false);
  });

  test("once the fragments are retired, the shipped copy is messages/ alone", async () => {
    expect(await loadOverlays(join(ROOT, "scripts", "i18n", "drive", "no-such-module.ts"))).toEqual([]);
    const messages = new Map([["drive.home.title", "Drive"], ["drive.disclosure.title", "Notice"], ["docs.share.title", "Share"]]);
    expect([...shippedCopy([], messages, "en")]).toEqual([["drive.home.title", "Drive"]]);
  });
});
