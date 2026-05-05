import { generateCode } from "@/components/flowfn/codegen";
import { safeIdent } from "@/components/flowfn/node-lib";
import type { FlowFunction } from "@/components/flowfn/types";

function loadFns(): FlowFunction[] {
  try {
    const raw = localStorage.getItem("flowfn:fns");
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

export function runTrigger(fnName: string) {
  const fns = loadFns();
  const fn = fns.find((f) => f.name === fnName);
  if (!fn) {
    console.warn(`[FlowFn] Function "${fnName}" not found`);
    return;
  }

  const allCode = fns.map((f) => generateCode(f, fns).code).join("\n");
  const callName = safeIdent(fn.name);

  const wrap = `
${allCode}
return (async () => { return await ${callName}(); })();
`;

  try {
    const factory = new Function("__log", wrap);
    const logCollector = (label: string, value: unknown) => {
      console.log(`[FlowFn:${fnName}]`, label || "", value);
    };
    Promise.resolve(factory(logCollector)).catch((err) => {
      console.error(`[FlowFn] Error in "${fnName}":`, err);
    });
  } catch (err) {
    console.error(`[FlowFn] Failed to compile "${fnName}":`, err);
  }
}

export function buildTriggerHandlers(
  triggers: Record<string, string> | undefined,
): Record<string, () => void> {
  if (!triggers || !Object.keys(triggers).length) return {};
  const handlers: Record<string, () => void> = {};
  for (const [event, fnName] of Object.entries(triggers)) {
    if (fnName) {
      handlers[event] = () => runTrigger(fnName);
    }
  }
  return handlers;
}
