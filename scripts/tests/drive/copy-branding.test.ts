import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { brandViolation } from "../../licenses/brand";

/*
 * Drive UI copy names no third-party product (drive-ui.md §17, CONTRACTS C32). The check is brandViolation from
 * scripts/licenses/brand.ts, the one rule the fragment validator and the legal branding test also use.
 *
 * Scope: the drive-ui subtrees and leaves plus its two overwrites, in all 8 locales, as they will ship: the
 * messages/ value, replaced by the fragment value where a fragment defines the key (drive-ui, or a
 * drive-ui-<unit> fragment extending it). Before the i18n merge that is the fragment; after it, both agree.
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
const DRIVE_UI_OVERWRITES = ["docs.share.managersNote", "docs.share.visibilityPrivate"];

const underPrefix = (key: string, prefix: string) => key === prefix || key.startsWith(`${prefix}.`);
const inScope = (key: string) => DRIVE_UI_OVERWRITES.includes(key) || DRIVE_UI_OWNED.some((p) => underPrefix(key, p));

/** One i18n fragment, as far as these tests need it: its meta and its leaves by locale. */
interface Overlay {
  name: string;
  source: string;
  owned: string[];
  overwrites: string[];
  leaves: Record<Locale, Map<string, string>>;
}

type FragmentMeta = Omit<Overlay, "leaves">;

/** The part of scripts/i18n/drive/fragment.ts used here. */
interface FragmentModule {
  loadFragments(): FragmentMeta[];
  leavesOf(frag: FragmentMeta, locale: Locale): Map<string, string>;
}

/** Every fragment while `modulePath` exists; none once W3.3 has retired the folder. */
async function loadOverlays(modulePath: string = FRAGMENT_MODULE): Promise<Overlay[]> {
  if (!existsSync(modulePath)) return [];
  const { loadFragments, leavesOf } = (await import(modulePath)) as FragmentModule;
  return loadFragments().map((frag) => ({
    name: frag.name,
    source: frag.source,
    owned: frag.owned,
    overwrites: frag.overwrites,
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

interface Copy {
  key: string;
  value: string;
  source: string;
}

/** The in-scope copy of `locale` as it will ship: messages/, overridden by the fragments. */
function shippedCopy(overlays: ReadonlyArray<Overlay>, messages: Map<string, string>, locale: Locale): Map<string, Copy> {
  const out = new Map<string, Copy>();
  for (const [key, value] of messages) if (inScope(key)) out.set(key, { key, value, source: `messages/${locale}.json` });
  for (const overlay of overlays) {
    for (const [key, value] of overlay.leaves[locale]) if (inScope(key)) out.set(key, { key, value, source: overlay.source });
  }
  return out;
}

/** One line per value that names a third-party product. */
function brandFindings(locale: string, copy: Iterable<Copy>): string[] {
  const out: string[] = [];
  for (const c of copy) {
    const term = brandViolation(locale, c.value);
    if (term !== null) out.push(`${c.source} ${c.key} @ ${locale}: "${term}" in "${c.value}"`);
  }
  return out;
}

const sorted = (list: ReadonlyArray<string>) => [...list].sort();

describe("drive-ui copy branding", () => {
  // Loaded inside the tests, so a fragment that fails to parse fails here with its message, not at module load.
  const repo = async (locale: Locale) => {
    const overlays = await loadOverlays();
    return { overlays, ui: overlays.find((o) => o.name === "drive-ui"), shipped: shippedCopy(overlays, loadMessages(locale), locale) };
  };

  test("every §17 subtree and overwrite ships, and the drive-ui fragment owns exactly them while it exists", async () => {
    const { ui, shipped } = await repo("en");
    const keys = [...shipped.keys()];
    expect([...DRIVE_UI_OWNED, ...DRIVE_UI_OVERWRITES].filter((p) => !keys.some((k) => underPrefix(k, p)))).toEqual([]);
    if (ui !== undefined) {
      expect(sorted(ui.owned)).toEqual(sorted(DRIVE_UI_OWNED));
      expect(sorted(ui.overwrites)).toEqual(sorted(DRIVE_UI_OVERWRITES));
    }
  });

  test.each([...LOCALES])("%s: every drive-ui key is in scope, so none escapes the check", async (locale) => {
    const { ui, shipped } = await repo(locale);
    expect(shipped.size).toBeGreaterThan(300);
    expect([...(ui?.leaves[locale].keys() ?? [])].filter((k) => !inScope(k))).toEqual([]);
  });

  test.each([...LOCALES])("%s: no value names a third-party product", async (locale) => {
    const { shipped } = await repo(locale);
    expect(brandFindings(locale, shipped.values())).toEqual([]);
  });
});

describe("the check itself", () => {
  const copy = (value: string): Copy => ({ key: "drive.home.title", value, source: "(memory)" });

  test("finds a product name in a value, in any case", () => {
    expect(brandFindings("en", [copy("Open in Excel")])).toHaveLength(1);
    expect(brandFindings("fr", [copy("Ouvrir dans powerpoint")])).toHaveLength(1);
    expect(brandFindings("en", [copy("Built on Univer")])).toHaveLength(1);
    expect(brandFindings("en", [copy("Import from Google")])).toHaveLength(1);
  });

  test("finds a transliteration in the locale's script", () => {
    expect(brandFindings("hi", [copy("एक्सेल फ़ाइल")])).toHaveLength(1);
    expect(brandFindings("ar", [copy("ملف إكسل")])).toHaveLength(1);
    expect(brandFindings("zh-cn", [copy("微软表格")])).toHaveLength(1);
  });

  test("respects word boundaries: ordinary words that contain a product name pass", () => {
    expect(brandFindings("es", [copy("¡Excelente!")])).toEqual([]);
    expect(brandFindings("fr", [copy("Un univers de fichiers")])).toEqual([]);
    expect(brandFindings("en", [copy("Export as .xlsx"), copy("Numbers only")])).toEqual([]);
  });

  test("shippedCopy prefers the fragment value and ignores keys outside the scope", () => {
    const messages = new Map([
      ["drive.home.title", "Old"],
      ["docs.share.visibilityPrivate", "Only people added"],
      ["docs.share.title", "Share"],
      ["drive.disclosure.title", "Excel"],
    ]);
    const leaves = Object.fromEntries(LOCALES.map((l) => [l, new Map([["drive.home.title", "New"]])])) as Record<Locale, Map<string, string>>;
    const overlay: Overlay = { name: "t", source: "(memory)", owned: ["drive.home"], overwrites: [], leaves };
    const shipped = shippedCopy([overlay], messages, "en");
    expect([...shipped.keys()].sort()).toEqual(["docs.share.visibilityPrivate", "drive.home.title"]);
    expect(shipped.get("drive.home.title")?.value).toBe("New");
  });

  test("once the fragments are retired, the shipped copy is messages/ alone", async () => {
    expect(await loadOverlays(join(ROOT, "scripts", "i18n", "drive", "no-such-module.ts"))).toEqual([]);
    const shipped = shippedCopy([], new Map([["drive.home.title", "Drive"], ["docs.share.title", "Share"]]), "en");
    expect([...shipped.values()]).toEqual([{ key: "drive.home.title", value: "Drive", source: "messages/en.json" }]);
  });
});
