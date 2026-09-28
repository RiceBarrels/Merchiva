import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * The desktop chrome's window IPC (caption buttons, drag regions, fullscreen / maximized
 * tracking) must be allowed for the origin the main window really loads. Release builds load
 * https://merchiva.com (src-tauri/src/lib.rs APP_URL), a remote origin for Tauri's ACL, so a
 * local-only capability silently rejects every call there while `tauri dev` (localhost =
 * devUrl = local) keeps working.
 */

const ROOT = join(import.meta.dir, "..", "..", "..");

interface Capability {
  identifier: string;
  windows?: string[];
  local?: boolean;
  remote?: { urls: string[] };
  permissions: (string | { identifier: string })[];
}

function loadCapabilities(file: string): Capability[] {
  const raw: unknown = JSON.parse(readFileSync(join(ROOT, "src-tauri", "capabilities", file), "utf8"));
  if (Array.isArray(raw)) return raw as Capability[];
  if (raw && typeof raw === "object" && "capabilities" in raw) return (raw as { capabilities: Capability[] }).capabilities;
  return [raw as Capability];
}

function permissionIds(capability: Capability): string[] {
  return capability.permissions.map((entry) => (typeof entry === "string" ? entry : entry.identifier));
}

/** Tauri remote patterns here are `scheme://host` with an optional leading `*.` label wildcard. */
function matchesRemote(pattern: string, url: string): boolean {
  const parsed = new URL(url);
  const match = /^([a-z]+):\/\/([^/]+)$/.exec(pattern);
  if (!match) throw new Error(`unsupported pattern in test: ${pattern}`);
  const [, scheme, host] = match;
  if (parsed.protocol !== `${scheme}:`) return false;
  if (host.startsWith("*.")) return parsed.hostname.endsWith(host.slice(1)) && parsed.hostname !== host.slice(2);
  return parsed.hostname === host;
}

function releaseAppUrl(): string {
  const source = readFileSync(join(ROOT, "src-tauri", "src", "lib.rs"), "utf8");
  const match = /#\[cfg\(not\(debug_assertions\)\)\]\s*const APP_URL: &str = "([^"]+)";/.exec(source);
  if (!match) throw new Error("release APP_URL not found in src-tauri/src/lib.rs");
  return match[1];
}

/** Commands the desktop chrome calls from the main window. */
const CHROME_WINDOW_PERMISSIONS = [
  "core:window:allow-minimize",
  "core:window:allow-toggle-maximize",
  "core:window:allow-close",
  "core:window:allow-start-dragging",
  "core:window:allow-internal-toggle-maximize",
  "core:window:allow-is-fullscreen",
  "core:window:allow-is-maximized",
  "core:event:allow-listen",
  "core:event:allow-unlisten",
];

/** Permissions a default set already grants locally (core:window:default, core:event:default). */
const LOCAL_DEFAULT_SETS: Record<string, readonly string[]> = {
  "core:window:default": [
    "core:window:allow-get-all-windows",
    "core:window:allow-is-fullscreen",
    "core:window:allow-is-maximized",
  ],
  "core:event:default": ["core:event:allow-listen", "core:event:allow-unlisten"],
};

describe("src-tauri/capabilities/default.json", () => {
  const capabilities = loadCapabilities("default.json");
  const schema = readFileSync(join(ROOT, "src-tauri", "gen", "schemas", "desktop-schema.json"), "utf8");

  test("every permission identifier exists in the generated desktop schema", () => {
    for (const capability of capabilities) {
      for (const id of permissionIds(capability)) {
        expect({ id, known: schema.includes(`"const": "${id}"`) }).toEqual({ id, known: true });
      }
    }
  });

  test("identifiers are unique", () => {
    const ids = capabilities.map((capability) => capability.identifier);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("the local capability grants the chrome's window commands to the main window", () => {
    const local = capabilities.filter((capability) => capability.local !== false && capability.windows?.includes("main"));
    const granted = new Set(local.flatMap(permissionIds).flatMap((id) => [id, ...(LOCAL_DEFAULT_SETS[id] ?? [])]));
    for (const id of CHROME_WINDOW_PERMISSIONS) expect({ id, granted: granted.has(id) }).toEqual({ id, granted: true });
  });

  test("the release origin gets the chrome's window commands through a remote capability", () => {
    const appUrl = releaseAppUrl();
    const remote = capabilities.filter(
      (capability) => capability.windows?.includes("main") && capability.remote?.urls.some((url) => matchesRemote(url, appUrl)),
    );
    expect(remote.length).toBeGreaterThan(0);
    const granted = new Set(remote.flatMap(permissionIds));
    for (const id of CHROME_WINDOW_PERMISSIONS) expect({ id, granted: granted.has(id) }).toEqual({ id, granted: true });
  });

  test("remote access stays scoped: merchiva.com only, window + event commands only, no local duplicate", () => {
    for (const capability of capabilities.filter((c) => c.remote)) {
      expect(capability.local).toBe(false);
      for (const url of capability.remote?.urls ?? []) {
        expect(matchesRemote(url, "https://merchiva.com.evil.com/")).toBe(false);
        expect(matchesRemote(url, "http://merchiva.com/")).toBe(false);
      }
      for (const id of permissionIds(capability)) {
        expect(id.startsWith("core:window:allow-") || id.startsWith("core:event:allow-")).toBe(true);
      }
    }
  });
});
