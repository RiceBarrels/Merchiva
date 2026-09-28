import { describe, expect, test } from "bun:test";
import { cardsNote, expandHistoryFromMessages } from "@/lib/merchiva/chat-history";
import type { ChatMessage } from "@/lib/merchiva/skills/types";

const STAFF_ID = "95c5ca9c-9985-4478-9708-f7b9bf2ef5fc";
const roles = [{ id: STAFF_ID, name: "Staff" }];

function reply(fields: Partial<ChatMessage>): ChatMessage {
  return { id: "r", from: "merchiva", text: "", time: "", ...fields };
}

describe("expandHistoryFromMessages", () => {
  // The report's chat: the tasks were cards only, so the history held nothing of them, and
  // "是一家咖啡店 你安排一下" read as a fresh request (a shift schedule).
  test("a reply of task cards alone still reaches the model, naming the role by name", () => {
    const history = expandHistoryFromMessages(
      [
        { id: "u", from: "user", text: "写一下staff的任务", time: "" },
        reply({
          tasksAdd: [
            { role: "", roleId: STAFF_ID, title: "开店准备", des: "", startTime: "07:30", endTime: "08:00", requiresEvidence: false },
            { role: "", roleId: STAFF_ID, title: "收银服务", des: "", startTime: null, endTime: null, requiresEvidence: false },
          ],
        }),
      ],
      roles,
    );
    expect(history).toEqual([
      { role: "user", content: "写一下staff的任务" },
      { role: "assistant", content: "[Cards in this reply — addRoleTask ×2 → Staff: 开店准备 07:30–08:00, 收银服务]" },
    ]);
    expect(JSON.stringify(history)).not.toContain(STAFF_ID);
  });

  test("the note follows the reply's text; declined cards are left out", () => {
    const [turn] = expandHistoryFromMessages([
      reply({
        text: "下周排班如下：",
        actions: [
          { id: "a", action: { action: "addShift" }, status: "approved" },
          { id: "b", action: { action: "addShift" }, status: "pending" },
          { id: "c", action: { action: "deleteShift" }, status: "rejected" },
        ],
        tasksDelete: [
          { role: "", title: "", taskId: "x", taskTitle: "开店准备", roleName: "Staff" },
          { role: "Staff", title: "Mop" },
        ],
        cancelledDeletes: [1],
      }),
    ]);
    expect(turn.content).toBe("下周排班如下：\n[Cards in this reply — deleteRoleTask ×1: 开店准备 (Staff); addShift ×2]");
  });

  test("an unresolved role id is never written; system messages and empty bubbles are skipped", () => {
    const note = cardsNote(
      reply({ tasksAdd: [{ role: "", roleId: "11111111-2222-4333-8444-555555555555", title: "T", des: "", startTime: null, endTime: null, requiresEvidence: false }] }),
      roles,
    );
    expect(note).toBe("[Cards in this reply — addRoleTask ×1 → unknown role: T]");
    expect(expandHistoryFromMessages([{ id: "s", from: "system", text: "hi", time: "" }, reply({})])).toEqual([]);
  });

  test("voice-call turns expand as before", () => {
    const history = expandHistoryFromMessages([
      { id: "v", from: "voice-call", text: "", time: "", voiceCall: { durationSec: 3, turns: [{ user: "hi", ai: "hello" }] } },
    ]);
    expect(history).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
  });
});
