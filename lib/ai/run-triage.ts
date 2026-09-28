/**
 * The L1 triage call itself (schema and prompt live in lib/ai/triage.ts), shared by
 * /api/store-ai and /api/store-ai/enqueue.
 */

import "server-only";

import { generateObject } from "ai";
import { tierModel, tierModelId } from "@/lib/ai/models";
import type { AiMode } from "@/lib/ai/router";
import {
  buildTriagePrompt,
  repairTriageText,
  triageCallSettings,
  triageSchema,
  type ChatTurn,
  type TriageResult,
} from "@/lib/ai/triage";
import { normalizeUsage, recordAiUsage } from "@/lib/ai/usage";

export interface RunTriageArgs {
  mode: AiMode;
  lang: string;
  messages: ChatTurn[];
  organizationId: string;
  /** ai_usage feature key, e.g. "store_ai_triage". */
  feature: string;
  /** ai_usage description — usually the user's message. */
  description: string;
  /** Optional prompt logger (the streaming route dumps prompts when STORE_AI_LOG_PROMPTS is on). */
  logPrompt?: (label: string, content: string) => void;
  /** The one-line CURRENT PAGE note (lib/ai/page-prompt.ts pageTriageNote); "" or absent without a page. */
  pageNote?: string;
}

/**
 * Runs triage and records its usage. Returns null when the call fails; the caller then escalates
 * on `fallbackTier(mode)` with no acknowledgment.
 */
export async function runTriage(args: RunTriageArgs): Promise<TriageResult | null> {
  const modelId = tierModelId(1);
  const system = buildTriagePrompt(args.lang, args.mode, args.pageNote);
  args.logPrompt?.(`triage system (${modelId})`, system);
  try {
    const result = await generateObject({
      model: tierModel(1),
      schema: triageSchema,
      system,
      messages: args.messages,
      ...triageCallSettings(args.mode),
      // L1 sometimes flattens `signals` into the top level; fold them back.
      experimental_repairText: async ({ text }) => repairTriageText(text),
    });
    await recordAiUsage({
      organizationId: args.organizationId,
      feature: args.feature,
      model: modelId,
      description: args.description,
      ...normalizeUsage(result.usage),
    });
    return result.object;
  } catch (err) {
    console.error(
      `[triage] failed (${args.mode}/${modelId}); escalating without an ack:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}
