import { describe, expect, test } from "bun:test";
import { askSkill } from "@/lib/merchiva/skills/ask";

describe("/ask choice cards", () => {
  test("a question with 2+ options becomes a card", () => {
    const out = askSkill.parse(`Two roles fit. /ask '[{"q":"Which role should Ann work?","a":["Barista","Cashier"]}]'`);
    expect(out.data?.questions).toEqual([{ q: "Which role should Ann work?", a: ["Barista", "Cashier"] }]);
    expect(out.cleanText).toBe("Two roles fit.");
  });

  test("a question with no real options is kept as plain text, not an empty card", () => {
    // The reported card: questions with no options, only "Other…" and a disabled submit.
    const out = askSkill.parse(
      `排班前需要：/ask '[{"q":"Muheng Fan 的成员 ID 是？","a":[]},{"q":"本周可上班时间？","a":["  "]},{"q":"Which store?","a":["Main","Airport"]}]'`,
    );
    expect(out.data?.questions).toEqual([{ q: "Which store?", a: ["Main", "Airport"] }]);
    expect(out.cleanText).toBe("排班前需要：\n\nMuheng Fan 的成员 ID 是？\n\n本周可上班时间？");
  });

  test("only single-option questions: no card at all", () => {
    const out = askSkill.parse(`/ask '[{"q":"Proceed?","a":["Yes"]}]'`);
    expect(out.data).toBeNull();
    expect(out.cleanText).toBe("Proceed?");
  });

  test("the prompt limits cards to real choices and never to ids or free-form input", () => {
    expect(askSkill.promptSegment).toContain("2–6 concrete options");
    expect(askSkill.promptSegment).toContain("Never use /ask for free-form information");
    expect(askSkill.promptSegment).toContain("Never ask for ids, codes");
  });
});
