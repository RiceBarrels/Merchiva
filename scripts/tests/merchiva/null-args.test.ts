import { describe, expect, test } from "bun:test";
import { tool } from "ai";
import { z } from "zod";
import { dropNulls, nullsAsMissing } from "@/lib/merchiva/tools/null-args";

// The shape of proposeSchedule's input: optional scalars and a nested optional object.
const input = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  days: z.number().int().min(1).max(14).optional(),
  constraints: z
    .object({
      unavailable: z.array(z.object({ staffName: z.string(), dates: z.array(z.string()).optional() })).optional(),
      maxHoursPerWeek: z.number().optional(),
    })
    .optional(),
});

describe("read-tool arguments: null reads as not given", () => {
  test("dropNulls removes null-valued keys at every depth and keeps array entries", () => {
    expect(dropNulls({ weekStart: null, days: 7, constraints: { unavailable: [{ staffName: "Leo", dates: null }], maxHoursPerWeek: null } })).toEqual({
      days: 7,
      constraints: { unavailable: [{ staffName: "Leo" }] },
    });
    expect(dropNulls([null, 1])).toEqual([null, 1]);
    expect(dropNulls(null)).toBeNull();
  });

  // Run 2 of the roles eval: proposeSchedule({"weekStart":null,"days":null,"constraints":{}}) failed
  // "weekStart: expected string, received null".
  test("the reported call validates once wrapped, and a real error still fails", async () => {
    expect(input.safeParse({ weekStart: null, days: null, constraints: {} }).success).toBe(false);
    const wrapped = nullsAsMissing(tool({ inputSchema: input, execute: async (args) => args }));
    const schema = wrapped.inputSchema as z.ZodType;
    const ok = schema.safeParse({ weekStart: null, days: null, constraints: {} });
    expect(ok.success).toBe(true);
    expect(ok.data).toEqual({ constraints: {} });
    expect(schema.safeParse({ weekStart: "next monday" }).success).toBe(false);
  });

  test("the JSON schema the model is shown does not change", () => {
    const wrapped = nullsAsMissing(tool({ inputSchema: input, execute: async (args) => args }));
    const shown = (s: z.ZodType) => z.toJSONSchema(s, { target: "draft-7", io: "input" });
    expect(shown(wrapped.inputSchema as z.ZodType)).toEqual(shown(input));
  });
});
