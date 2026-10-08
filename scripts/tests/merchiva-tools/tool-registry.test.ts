import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { MERCHIVA_TOOL_NAMES } from "@/lib/merchiva/tools/names";
import { toolTarget } from "@/lib/merchiva/tool-targets";
import { viewFinanceInput } from "@/lib/merchiva/tools/view-finance";
import { viewForecastInput } from "@/lib/merchiva/tools/view-forecast";
import { viewRestockSuggestionsInput } from "@/lib/merchiva/tools/view-restock-suggestions";
import { proposeScheduleInput } from "@/lib/merchiva/tools/propose-schedule";

describe("tool registry", () => {
  test("every registered tool moves the AI cursor to a page", () => {
    for (const name of MERCHIVA_TOOL_NAMES) expect(toolTarget(name), name).not.toBeNull();
  });

  test("the engine tools are registered under the names the other workstreams use", () => {
    for (const name of ["viewFinance", "viewForecast", "viewRestockSuggestions", "proposeSchedule"]) {
      expect(MERCHIVA_TOOL_NAMES as readonly string[]).toContain(name);
    }
  });
});

/** Every field, at every depth, carries a description a small model can read. */
function undocumented(schema: z.ZodType, path = ""): string[] {
  let inner: z.ZodType = schema;
  while (inner instanceof z.ZodOptional || inner instanceof z.ZodNullable) inner = inner.unwrap() as z.ZodType;
  if (inner instanceof z.ZodArray) return undocumented(inner.element as z.ZodType, `${path}[]`);
  if (!(inner instanceof z.ZodObject)) return [];
  const out: string[] = [];
  for (const [key, field] of Object.entries(inner.shape as Record<string, z.ZodType>)) {
    const at = path ? `${path}.${key}` : key;
    if (!field.description) out.push(at);
    out.push(...undocumented(field, at));
  }
  return out;
}

describe("engine tool input schemas", () => {
  test.each([
    ["viewFinance", viewFinanceInput],
    ["viewForecast", viewForecastInput],
    ["viewRestockSuggestions", viewRestockSuggestionsInput],
    ["proposeSchedule", proposeScheduleInput],
  ] as const)("%s describes every field", (_name, schema) => {
    expect(undocumented(schema)).toEqual([]);
  });

  test("proposeSchedule accepts what a small model typically sends", () => {
    const parsed = proposeScheduleInput.parse({
      constraints: {
        unavailable: [{ staffName: "Mia", weekdays: ["Tue"] }, { staffName: "Leo" }],
        maxHours: [{ staffName: "Sam", hours: 20 }],
        coverage: [{ shift: "morning", staff: 2 }, { shift: "evening", staff: 3, weekdays: ["Fri", "Sat"] }],
      },
    });
    expect(parsed.constraints?.coverage).toHaveLength(2);
    expect(() => proposeScheduleInput.parse({ weekStart: "next monday" })).toThrow();
    expect(() => proposeScheduleInput.parse({ constraints: { unavailable: [{ staffName: "Mia", weekdays: ["Tuesday"] }] } })).toThrow();
  });
});
