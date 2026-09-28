/**
 * Read-tool arguments with every `null` taken out, as if the key were left out.
 *
 * gpt-oss (L1) fills an optional parameter it has no value for with null —
 * proposeSchedule({"weekStart":null,"days":null,"constraints":{}}) — and zod's
 * optional() accepts a missing key, never null: the call failed validation
 * ("expected string, received null") and the model had to retry or gave up.
 * No read tool gives null a meaning, so a null is read as "not given".
 */

import type { Tool } from "ai";
import { z } from "zod";

/** `value` with the null-valued keys of every plain object in it removed. Array entries stay. */
export function dropNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropNulls);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== null)
        .map(([k, v]) => [k, dropNulls(v)]),
    );
  }
  return value;
}

function isZodSchema(schema: unknown): schema is z.ZodType {
  return !!schema && typeof schema === "object" && "_zod" in schema;
}

/**
 * `def` validating `dropNulls(args)`. The JSON schema the model is shown is the
 * same: zod renders a preprocess by the schema it feeds (io "input").
 */
export function nullsAsMissing<T extends Tool>(def: T): T {
  const schema: unknown = def.inputSchema;
  if (!isZodSchema(schema)) return def;
  return { ...def, inputSchema: z.preprocess(dropNulls, schema) };
}
