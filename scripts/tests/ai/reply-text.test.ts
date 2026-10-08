import { describe, expect, test } from "bun:test";
import {
  ackSentinel,
  replyString,
  stripActionBlocks,
  stripIncompleteTrailingAction,
  type ReplyStringKey,
} from "@/lib/ai/reply-text";
import { LOCALES } from "@/lib/i18n/config";
import { dictionaries } from "@/lib/i18n/dictionaries";

describe("reply text helpers", () => {
  test("ack sentinel", () => {
    expect(ackSentinel("Checking.")).toBe("[[MERCHIVA_ACK]]Checking.[[/MERCHIVA_ACK]]");
    expect(ackSentinel("")).toBe("");
  });

  test("an incomplete trailing action block is trimmed; complete ones are kept", () => {
    const done = 'Two shifts:\n```action\n{"action":"addShift","staffName":"A"}\n```\n';
    expect(stripIncompleteTrailingAction(done)).toEqual({ trimmed: done, stripped: false });

    const cut = done + '```action\n{"action":"addShift","staffName":"B","date":"2026-';
    expect(stripIncompleteTrailingAction(cut)).toEqual({ trimmed: done.trimEnd(), stripped: true });

    const unbalanced = done + '```action\n{"action":"addShift","note":"}"\n```';
    expect(stripIncompleteTrailingAction(unbalanced).stripped).toBe(true);
  });

  test("spoken replies lose their action blocks", () => {
    expect(stripActionBlocks('Done.\n```action\n{"action":"addShift"}\n```\nBye.')).toBe("Done.\n\nBye.");
  });
});

describe("server-side reply strings", () => {
  const KEYS: ReplyStringKey[] = [
    "merchiva.errors.voiceFallback",
    "merchiva.errors.chatFallback",
    "merchiva.replyReady.title",
    "merchiva.replyReady.body",
  ];

  // The locale's own leaf, without lookup()'s English fallback.
  function ownLeaf(locale: (typeof LOCALES)[number], key: string): unknown {
    return key.split(".").reduce<unknown>(
      (node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined),
      dictionaries[locale],
    );
  }

  test("every key is in every locale file, and replyString reads that locale's text", () => {
    for (const locale of LOCALES) {
      for (const key of KEYS) {
        const leaf = ownLeaf(locale, key);
        expect({ locale, key, type: typeof leaf }).toEqual({ locale, key, type: "string" });
        expect(replyString(locale, key)).toBe(leaf as string);
      }
    }
  });

  test("each locale gets its own text: Traditional for zh-tw / zh-hk, Simplified for zh-cn", () => {
    expect(replyString("zh-cn", "merchiva.replyReady.title")).toBe("Mr. Merchiva 回复了");
    expect(replyString("zh-tw", "merchiva.replyReady.title")).toBe("Mr. Merchiva 回覆了");
    expect(replyString("zh-hk", "merchiva.replyReady.title")).toBe("Mr. Merchiva 回覆了");
    expect(replyString("zh-tw", "merchiva.errors.voiceFallback")).toBe("抱歉，我沒聽清，可以再說一次嗎？");
    expect(replyString("zh-tw", "merchiva.errors.chatFallback")).toBe("我沒能生成回覆，請再試一次。");
    expect(replyString("zh-hk", "merchiva.replyReady.body")).toBe("你的回覆已經準備好了。");
    for (const key of KEYS) {
      expect(replyString("zh-tw", key)).not.toBe(replyString("zh-cn", key));
      expect(replyString("fr", key)).not.toBe(replyString("en", key));
    }
  });

  test("region tags, the CLI's bare 'zh' and unknown languages resolve", () => {
    expect(replyString("zh-TW", "merchiva.replyReady.title")).toBe("Mr. Merchiva 回覆了");
    expect(replyString("zh", "merchiva.replyReady.title")).toBe("Mr. Merchiva 回复了");
    expect(replyString("es-MX", "merchiva.replyReady.body")).toBe("Tu respuesta está lista.");
    expect(replyString(undefined, "merchiva.replyReady.body")).toBe("Your reply is ready.");
    expect(replyString("xx", "merchiva.errors.chatFallback")).toBe("I couldn't generate a response. Please try again.");
  });
});
