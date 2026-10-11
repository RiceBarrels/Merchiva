// The /manager channel page and its notification dots: each conversation in the sidebar shows
// its own dot (rendered with the dot selectors mocked, in a child process), and the page reads
// a conversation only for the signed-in person, only while someone is at the screen.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const FIXTURE = "./scripts/tests/notify/channel-dots.isolated.tsx";
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

test(
  "the channel sidebar's dots render on the right conversations",
  () => {
    const proc = Bun.spawnSync([process.execPath, "test", FIXTURE], {
      cwd: ROOT,
      env: process.env,
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = `${proc.stdout.toString()}${proc.stderr.toString()}`;
    if (proc.exitCode !== 0) console.error(output);
    expect(proc.exitCode).toBe(0);
    expect(output).toContain(" 0 fail");
    expect(output).toMatch(/\b7 pass\b/);
  },
  60_000,
);

describe("channel page wiring", () => {
  const page = (read("components/channel/index.tsx") + read("components/channel/workspace.tsx"));

  test("a collapsed section's header carries its rows' dots", () => {
    expect(read("components/channel/sidebar.tsx")).toContain("show={!open && anyDot}");
  });

  test("the open conversation is read through the dot core, only while attended", () => {
    expect(page).toContain("useMarkConversationRead()");
    expect(page).toContain("useDocumentAttended()");
    expect(page).not.toContain("useDocumentVisible");
    expect(page).not.toMatch(/\bmarkChatRead\(/);
  });

  test("a store machine's PIN operator never reads the machine account's rows", () => {
    const start = page.indexOf("const markConversationRead = useMarkConversationRead()");
    expect(start).toBeGreaterThan(-1);
    const effect = page.slice(start, page.indexOf("}, [", start));
    expect(effect).toContain("me.operatorRole != null");
    expect(effect.indexOf("me.operatorRole != null")).toBeLessThan(effect.indexOf("markConversationRead(activeId)"));
  });

  test("@everyone is offered only where the module would honour it (no staff PIN operator)", () => {
    expect(page).toContain("const canMentionEveryone = me.operatorRole == null || isManagerRole(me.operatorRole);");
    expect(page).toContain('everyone={active.type === "group" && canMentionEveryone}');
  });
});
