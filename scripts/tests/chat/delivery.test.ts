// chatDelivery (spacetimedb/src/chat/logic.ts): every combination of the four
// facts, against the channel rules of the notifications spec (§1.6): a mute
// gives way only to @Name and a followed sender, @everyone (a manager's) never
// breaks a mute, email for @Name / @everyone / follow only, and the template
// chat.mention > chat.follow > chat.message.

import { describe, expect, test } from "bun:test";
import { chatDelivery, shouldNotifyChatMember } from "@/spacetimedb/src/chat/logic";

type Row = [muted: boolean, named: boolean, everyone: boolean, follows: boolean, notify: boolean, email: boolean, template: string];

const MATRIX: readonly Row[] = [
  // muted  named  everyone follows | notify email  template
  [false, false, false, false, true, false, "chat.message"],
  [false, false, false, true, true, true, "chat.follow"],
  [false, false, true, false, true, true, "chat.mention"],
  [false, false, true, true, true, true, "chat.mention"],
  [false, true, false, false, true, true, "chat.mention"],
  [false, true, false, true, true, true, "chat.mention"],
  [false, true, true, false, true, true, "chat.mention"],
  [false, true, true, true, true, true, "chat.mention"],
  [true, false, false, false, false, false, "chat.message"],
  [true, false, false, true, true, true, "chat.follow"],
  // @everyone never breaks a mute, and a muted member who still hears (followed sender) is told of the follow.
  [true, false, true, false, false, false, "chat.message"],
  [true, false, true, true, true, true, "chat.follow"],
  [true, true, false, false, true, true, "chat.mention"],
  [true, true, false, true, true, true, "chat.mention"],
  [true, true, true, false, true, true, "chat.mention"],
  [true, true, true, true, true, true, "chat.mention"],
];

describe("chatDelivery", () => {
  test("the matrix covers all 16 combinations exactly once", () => {
    const keys = new Set(MATRIX.map((r) => r.slice(0, 4).join()));
    expect(keys.size).toBe(16);
  });

  for (const [muted, named, everyone, follows, notify, email, template] of MATRIX) {
    test(`muted=${muted} named=${named} everyone=${everyone} follows=${follows}`, () => {
      expect(chatDelivery({ muted, named, everyone, follows })).toEqual({ notify, email, template });
    });
  }

  test("without a follow it agrees with shouldNotifyChatMember (the client's mute rule)", () => {
    for (const muted of [false, true]) {
      for (const named of [false, true]) {
        for (const everyone of [false, true]) {
          expect(chatDelivery({ muted, named, everyone, follows: false }).notify).toBe(shouldNotifyChatMember(muted, named));
        }
      }
    }
  });
});
