import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { sha256Hex, sha256HexOfBytes } from "@/lib/storage/sha256";

const nodeHex = (data: string | Uint8Array): string => createHash("sha256").update(data).digest("hex");

describe("sha256Hex", () => {
  test("matches the FIPS 180-2 vectors", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))
      .toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  });

  test("matches node:crypto across padding boundaries (55, 56, 63, 64, 65 bytes and longer)", () => {
    for (const length of [1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 1000, 70_000]) {
      const text = "x".repeat(length);
      expect(sha256Hex(text)).toBe(nodeHex(text));
    }
  });

  test("hashes the UTF-8 bytes of unicode text", () => {
    for (const text of ["café", "中文名.png", "مرحبا", "emoji 🧾📦", "é"]) {
      expect(sha256Hex(text)).toBe(nodeHex(Buffer.from(text, "utf8")));
    }
  });

  test("a lone surrogate hashes as U+FFFD, like TextEncoder", () => {
    expect(sha256Hex("a\ud800b")).toBe(nodeHex(Buffer.from("a�b", "utf8")));
  });

  test("raw bytes, including every byte value", () => {
    const bytes = new Uint8Array(256).map((_, i) => i);
    expect(sha256HexOfBytes(bytes)).toBe(nodeHex(bytes));
  });

  test("an UploadThing-shaped key is 64 lowercase hex", () => {
    expect(sha256Hex("8Ix3dU0a9cWqK1mZ2pLr7tYvB5nE4hJ6sGfD0oXwQe1Ru3Tz")).toMatch(/^[0-9a-f]{64}$/);
  });
});
