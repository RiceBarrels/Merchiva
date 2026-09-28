import { describe, expect, test } from "bun:test";
import type { ModelMessage } from "ai";
import {
  BLANK_REPLY_RETRY_NOTE,
  blankRetryMessages,
  isBlankReply,
  withBlankRetry,
  type ReplyAttempt,
} from "@/lib/ai/blank-reply";

const SENT: ModelMessage[] = [{ role: "user", content: "这个还剩多少？" }];
const CALL: ModelMessage = {
  role: "assistant",
  content: [{ type: "tool-call", toolCallId: "c1", toolName: "viewInventory", input: { lowOnly: true } }],
};
const RESULT: ModelMessage = {
  role: "tool",
  content: [{ type: "tool-result", toolCallId: "c1", toolName: "viewInventory", output: { type: "json", value: { count: 1 } } }],
};

describe("isBlankReply", () => {
  test("nothing or only whitespace is blank; any text is not", () => {
    expect(isBlankReply("")).toBe(true);
    expect(isBlankReply(" \n\t ")).toBe(true);
    expect(isBlankReply("8 L")).toBe(false);
    expect(isBlankReply('```action\n{"action":"addRole"}\n```')).toBe(false);
  });
});

describe("blankRetryMessages", () => {
  test("keeps the conversation, then the tool calls and results the first attempt made", () => {
    expect(blankRetryMessages(SENT, [CALL, RESULT])).toEqual([...SENT, CALL, RESULT]);
  });

  test("drops trailing assistant turns that said nothing, so the retry picks up after the tool result", () => {
    const silent: ModelMessage[] = [
      { role: "assistant", content: [] },
      { role: "assistant", content: [{ type: "text", text: "  " }] },
      { role: "assistant", content: "" },
    ];
    expect(blankRetryMessages(SENT, [CALL, RESULT, ...silent])).toEqual([...SENT, CALL, RESULT]);
  });

  test("an assistant turn with text or a tool call stays", () => {
    const spoke: ModelMessage = { role: "assistant", content: [{ type: "text", text: "Checking." }] };
    expect(blankRetryMessages(SENT, [CALL, RESULT, spoke])).toEqual([...SENT, CALL, RESULT, spoke]);
    expect(blankRetryMessages(SENT, [CALL])).toEqual([...SENT, CALL]);
  });

  test("an attempt that fetched nothing retries on the conversation alone", () => {
    expect(blankRetryMessages(SENT, [])).toEqual(SENT);
  });
});

describe("withBlankRetry", () => {
  function runner(texts: string[]) {
    const attempts: ReplyAttempt[] = [];
    const run = async (attempt: ReplyAttempt) => {
      attempts.push(attempt);
      return { text: texts[attempts.length - 1] ?? "", messages: [CALL, RESULT] };
    };
    return { attempts, run };
  }

  test("a reply with text runs once", async () => {
    const { attempts, run } = runner(["Oat Milk: 8 L."]);
    expect(await withBlankRetry({ system: "SYSTEM", messages: SENT }, run)).toEqual({ retried: false, blank: false });
    expect(attempts).toEqual([{ system: "SYSTEM", messages: SENT, retry: false }]);
  });

  test("a blank reply runs once more, with the note and what the first attempt fetched", async () => {
    const { attempts, run } = runner(["", "Oat Milk: 8 L."]);
    expect(await withBlankRetry({ system: "SYSTEM", messages: SENT }, run)).toEqual({ retried: true, blank: false });
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual({ system: `SYSTEM${BLANK_REPLY_RETRY_NOTE}`, messages: [...SENT, CALL, RESULT], retry: true });
  });

  test("never more than one retry; a second blank reply is reported for the caller's fallback", async () => {
    const { attempts, run } = runner(["", " "]);
    expect(await withBlankRetry({ system: "SYSTEM", messages: SENT }, run)).toEqual({ retried: true, blank: true });
    expect(attempts).toHaveLength(2);
  });

  test("the note tells the model the user has seen nothing and to answer from the results", () => {
    expect(BLANK_REPLY_RETRY_NOTE.startsWith("\n\nRETRY:")).toBe(true);
    expect(BLANK_REPLY_RETRY_NOTE).toContain("has not seen an answer");
    expect(BLANK_REPLY_RETRY_NOTE).toContain("call the tool again with the right arguments");
  });
});
