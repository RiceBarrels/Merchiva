/**
 * Mr. Merchiva scenario eval — the REAL models on a FAKE store.
 *
 *   bun scripts/evals/merchiva-scenarios.ts [--only 1,3] [--out results.json] [--tier 2]
 *
 * `--tier` answers with that tier's model whatever the router picks (the router's choice is still
 * reported), to see a fix hold on every model and not only the one these requests route to.
 *
 * Each scenario is one chat message sent from one page, run the way /api/store-ai/enqueue runs a
 * background job: the real L1 triage (lib/ai/run-triage), the real router, the tier's real model
 * (lib/ai/models tierModel) with the real system prompt (lib/ai/store-ai-prompt + the CURRENT PAGE
 * block of lib/ai/page-prompt) and the real read tools (buildMerchivaTools). The page payload is
 * built as the chat client builds it: the page's own context builder, sanitized by
 * lib/merchiva/page-context, then lib/merchiva/current-page.
 *
 * Only the data is fake: the tools' SQL endpoint answers from merchiva-store-fixture.ts, the AI
 * usage recorder writes to memory instead of SpacetimeDB, and every other request is refused.
 * OPENROUTER_API_KEY comes from .env.local (bun loads it) and is never printed. Not a test file:
 * it costs money and depends on model behaviour, so `bun test` never runs it.
 */

import { mock } from "bun:test";
import type { AiTier } from "@/lib/ai/models";
import type { CurrentPage } from "@/lib/ai/page-prompt";
import type { MerchivaPageContext } from "@/lib/merchiva/page-context";
import type { ActionBlock, Checker as CheckerType, ParsedReply } from "@/scripts/evals/merchiva-checks";

// ── Isolation, before anything imports the server modules ──────────────────

interface UsageRow {
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}
const usage: UsageRow[] = [];

mock.module("server-only", () => ({}));
// recordAiUsage's only way out; the rows land here instead of in ai_usage.
mock.module("@/lib/spacetimedb/service-client", () => ({
  getServiceConn: async () => ({}),
  serviceRecordAiUsage: async (_conn: unknown, row: UsageRow) => {
    usage.push(row);
  },
}));

if (!process.env.OPENROUTER_API_KEY) {
  console.error("OPENROUTER_API_KEY is not set (.env.local); nothing to evaluate.");
  process.exit(2);
}

const fixture = await import("@/scripts/evals/merchiva-store-fixture");
const network = fixture.installFakeStore();

const { streamText, stepCountIs } = await import("ai");
const { tierLabel, tierModel, tierModelId } = await import("@/lib/ai/models");
const { fallbackTier, routeRequest } = await import("@/lib/ai/router");
const { ackFor, conversationMessages, shouldReplyDirectly } = await import("@/lib/ai/triage");
const { runTriage } = await import("@/lib/ai/run-triage");
const { buildSystemPrompt } = await import("@/lib/ai/store-ai-prompt");
const { ackSentinel, replyString, stripIncompleteTrailingAction } = await import("@/lib/ai/reply-text");
const { BLANK_RETRY_MAX_STEPS, withBlankRetry } = await import("@/lib/ai/blank-reply");
const { toolFrameCallbacks } = await import("@/lib/ai/tool-stream");
const { normalizeUsage, recordAiUsage } = await import("@/lib/ai/usage");
const { pageTriageNote, withCurrentPage } = await import("@/lib/ai/page-prompt");
const { buildMerchivaTools } = await import("@/lib/merchiva/tools");
const { allowedMerchivaTools } = await import("@/lib/merchiva/tools/access");
const { memberAccess, permissionSummary } = await import("@/lib/auth/verify-member");
const { sanitizePageContext, WINDOW_PAGE_SCOPE } = await import("@/lib/merchiva/page-context");
const { buildCurrentPage } = await import("@/lib/merchiva/current-page");
const { tabsStore } = await import("@/lib/browser-shell/store");
const { getDictionary, lookup } = await import("@/lib/i18n/dictionaries");
const { getUpcomingHolidays } = await import("@/lib/holidays");
const { scheduleContext, teamContext } = await import("@/components/personnel/page-context");
const { inventoryPageContext, salesPageContext } = await import("@/lib/merchiva/data-page-context");
const { addDaysToKey, weekdayOfKey } = await import("@/lib/merchiva/tools/store-time");
const checks = await import("@/scripts/evals/merchiva-checks");

const { ORG, TOKEN, TODAY, TIME_ZONE, THIS_MONDAY, LAST_MONDAY, NEXT_MONDAY, OWNER, PLACEHOLDER, OPEN_ITEM, FIXTURE_IDS } = fixture;

// ── The background job's own prompt tail, read from the route so it cannot drift ──

const ROUTE = await Bun.file(`${import.meta.dir}/../../app/api/store-ai/enqueue/route.ts`).text();
const noteMatch = /const BACKGROUND_NOTE = `([\s\S]*?)`;\n/.exec(ROUTE);
const capMatch = /const MAX_OUTPUT_TOKENS = (\d+);/.exec(ROUTE);
if (!noteMatch || noteMatch[1].includes("${") || !capMatch) throw new Error("enqueue route changed shape; update the eval");
const BACKGROUND_NOTE = noteMatch[1].replace(/\\`/g, "`");
const MAX_OUTPUT_TOKENS = Number(capMatch[1]);
const STEP_LIMIT = 6;

const tierArg = process.argv.indexOf("--tier");
const forced = tierArg >= 0 ? Number(process.argv[tierArg + 1]) : null;
if (forced !== null && forced !== 1 && forced !== 2 && forced !== 3) throw new Error("--tier takes 1, 2 or 3");
const FORCED_TIER = forced as AiTier | null;

// ── One owner, messaging in Simplified Chinese ───────────────────────────────

const LANG = "zh-cn";
const ACCESS = memberAccess("owner", "{}");
const READ_TOOLS = allowedMerchivaTools(ACCESS);
const STORE_CONTEXT = fixture.storeContext(getUpcomingHolidays("US", 14));
const zh = getDictionary("zh-cn");
const t = (key: string) => lookup(zh, key);

/** The `page` field the chat client sends from `path` while the page publishes `context`. */
function pageFor(path: string, context: MerchivaPageContext): CurrentPage | null {
  return buildCurrentPage({
    scope: WINDOW_PAGE_SCOPE,
    snapshot: tabsStore.getState(),
    location: { pathname: path, search: "" },
    t,
    context: sanitizePageContext(context),
  });
}

// ── Running one message ─────────────────────────────────────────────────────

interface ToolCallRecord {
  tool: string;
  input: unknown;
  output?: unknown;
  error?: string;
}

interface Run {
  page: CurrentPage | null;
  direct: boolean;
  /** runTriage returned null: the reply went to the fallback tier with no acknowledgment. */
  triageFailed: boolean;
  tierText: string;
  model: string;
  raw: string;
  reply: ParsedReply;
  calls: ToolCallRecord[];
  finishReason: string;
  /** The first reply came back blank and the route's retry ran. */
  retried: boolean;
  /** Still blank after the retry: the reply is the route's fallback line. */
  blank: boolean;
}

async function runMessage(id: number, message: string, page: CurrentPage | null): Promise<Run> {
  const messages = conversationMessages([], message);
  const triage = await runTriage({
    mode: "chat",
    lang: LANG,
    messages,
    organizationId: ORG,
    feature: `eval_s${id}_triage`,
    description: message,
    pageNote: pageTriageNote(page),
  });
  const signals = triage ? Object.entries(triage.signals).filter(([, on]) => on).map(([s]) => s) : [];

  if (triage && shouldReplyDirectly(triage, "chat")) {
    const raw = triage.message;
    return {
      page, direct: true, triageFailed: false, tierText: `L1 direct reply (triage answered; signals [${signals.join(", ")}])`,
      model: tierModelId(1), raw, reply: checks.parseReply(raw), calls: [], finishReason: "triage", retried: false, blank: false,
    };
  }

  const ack = ackFor(triage);
  let transcript = ackSentinel(ack);
  const route = triage ? routeRequest(triage.signals, { mode: "chat" }) : null;
  const routed = route?.tier ?? fallbackTier("chat");
  const tier = FORCED_TIER ?? routed;
  const modelId = tierModelId(tier);
  const system = withCurrentPage(
    buildSystemPrompt(STORE_CONTEXT, LANG, {}, permissionSummary(ACCESS), "chat", READ_TOOLS, ""),
    page,
  );
  // The route's ackNote, verbatim.
  const ackNote = ack
    ? `\n\nNOTE: An acknowledgment has ALREADY been sent: "${ack}". Skip greetings.`
    : "\n\nNOTE: Skip greetings; go straight to substantive answer or action blocks.";
  const tools = buildMerchivaTools({ token: TOKEN, organizationId: ORG, allowed: READ_TOOLS, today: TODAY, timeZone: TIME_ZONE });
  const calls: ToolCallRecord[] = [];
  const spent = { inputTokens: 0, outputTokens: 0 };
  let finishReason = "";

  // The route's blank-reply retry (lib/ai/blank-reply.ts), then its fallback line.
  const { retried, blank } = await withBlankRetry({ system: system + BACKGROUND_NOTE + ackNote, messages }, async (attempt) => {
    const stream = streamText({
      model: tierModel(tier),
      system: attempt.system,
      messages: attempt.messages,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: 0.2,
      tools,
      stopWhen: stepCountIs(attempt.retry ? BLANK_RETRY_MAX_STEPS : STEP_LIMIT),
      abortSignal: AbortSignal.timeout(240_000),
      ...toolFrameCallbacks((frame) => {
        transcript += frame;
      }),
      onStepFinish: (step) => {
        for (const part of step.content) {
          if (part.type === "tool-result") calls.push({ tool: part.toolName, input: part.input, output: part.output });
          if (part.type === "tool-error") calls.push({ tool: part.toolName, input: part.input, error: String(part.error) });
        }
      },
    });
    let text = "";
    for await (const chunk of stream.textStream) {
      text += chunk;
      transcript += chunk;
    }
    finishReason = await stream.finishReason;
    if (finishReason === "length") {
      const { trimmed, stripped } = stripIncompleteTrailingAction(transcript);
      if (stripped) {
        transcript = trimmed;
        text = stripIncompleteTrailingAction(text).trimmed;
      }
    }
    const usage = normalizeUsage(await stream.totalUsage);
    spent.inputTokens += usage.inputTokens;
    spent.outputTokens += usage.outputTokens;
    return { text, messages: (await stream.response).messages };
  });
  if (blank) transcript += replyString(LANG, "merchiva.errors.chatFallback");
  await recordAiUsage({ organizationId: ORG, feature: `eval_s${id}_reply`, model: modelId, description: message, ...spent });

  const chosen = route
    ? `${tierLabel(routed)} (score ${route.score}; signals [${route.signals.join(", ") || "none"}])`
    : `${tierLabel(routed)} (triage failed; fallback tier)`;
  const tierText = tier === routed ? chosen : `${tierLabel(tier)} forced; router chose ${chosen}`;
  return {
    page, direct: false, triageFailed: !triage, tierText, model: modelId, raw: transcript, reply: checks.parseReply(transcript), calls, finishReason,
    retried, blank,
  };
}

// ── Transcript ──────────────────────────────────────────────────────────────

function outputSummary(output: unknown): string {
  if (!output || typeof output !== "object") return JSON.stringify(output) ?? "";
  const record = output as Record<string, unknown>;
  if (record.error) return `error: ${String(record.error)} ${String(record.detail ?? "")}`.trim();
  return Object.entries(record)
    .map(([key, value]) => (Array.isArray(value) ? `${key}[${value.length}]` : typeof value === "object" ? key : `${key}=${JSON.stringify(value)}`))
    .join(" ")
    .slice(0, 220);
}

function transcriptOf(message: string, run: Run): string {
  const lines = [
    `USER (${run.page?.path ?? "no page"}): ${message}`,
    `PAGE: ${JSON.stringify(run.page?.context ?? null)}`,
    `ROUTER: ${run.tierText} → ${run.model}; finish=${run.finishReason}`,
    ...(run.reply.ack ? [`ACK: ${run.reply.ack}`] : []),
    ...run.calls.map((c) => `TOOL ${c.tool}(${JSON.stringify(c.input)}) → ${c.error ? `ERROR ${c.error}` : outputSummary(c.output)}`),
    ...(run.retried ? [`RETRY: the first reply was blank${run.blank ? "; so was the retry (fallback line)" : ""}`] : []),
    `REPLY: ${run.reply.text.trim()}`,
  ];
  const text = lines.join("\n");
  return text.length > 1500 ? `${text.slice(0, 1500)}…[+${text.length - 1500} chars]` : text;
}

// ── Checks every scenario gets ──────────────────────────────────────────────

const writes = (run: Run) => run.reply.actions;
const named = (run: Run, action: string) => run.reply.actions.filter((a) => a.action === action);
const called = (run: Run, ...tools: string[]) => run.calls.some((c) => tools.includes(c.tool));

function commonChecks(run: Run, c: CheckerType): void {
  c.info(`router: ${run.tierText} → ${run.model}`);
  c.check("reply has content", run.reply.prose.trim().length > 0 || run.reply.actions.length > 0);
  const idAsks = checks.asksForIdOrCode(run.reply.prose);
  c.check("never asks the user for an id or code", idAsks.length === 0, idAsks.join(" | "));
  c.check("no /ask card without options", run.reply.emptyAsks.length === 0, run.reply.emptyAsks.join(" | "));
  const bad = run.reply.actions.flatMap((a) => checks.registryProblems(a, FIXTURE_IDS));
  c.check(`action blocks satisfy the registry (${run.reply.actions.length} blocks)`, bad.length === 0, bad.join("; "));
  c.check(
    "every ```action block parses",
    run.reply.actions.length >= run.reply.actionFences,
    `${run.reply.actionFences} fences, ${run.reply.actions.length} parsed`,
  );
  const failed = run.calls.filter((call) => call.error || (call.output as { error?: unknown } | undefined)?.error);
  c.check("tool calls succeeded", failed.length === 0, failed.map((call) => `${call.tool}: ${call.error ?? outputSummary(call.output)}`).join("; "));
  c.check("finished within the output cap", run.finishReason !== "length", run.finishReason);
  if (run.triageFailed) c.warn("triage failed (lib/ai/run-triage returned null)", "the reply fell back to L2 with no acknowledgment");
  c.check("not left blank (the route's fallback line)", !run.blank);
  if (run.retried && !run.blank) c.warn("the first reply was blank", "the route's blank-reply retry answered");
  const shownIds = [...new Set(run.reply.prose.match(checks.UUID_RE) ?? [])];
  if (shownIds.length > 0) c.warn("shows a raw id to the user in prose", shownIds.join(", "));
}

function noWrites(run: Run, c: CheckerType): void {
  c.check("no write actions for a question", writes(run).length === 0, writes(run).map((a) => String(a.action)).join(", "));
}

// ── Scenarios ───────────────────────────────────────────────────────────────

interface Scenario {
  id: number;
  name: string;
  message: string;
  path: string;
  context: MerchivaPageContext;
  verify: (run: Run, c: CheckerType) => void;
}

const nextWeekEnd = addDaysToKey(NEXT_MONDAY, 6);
const thisWeekEnd = addDaysToKey(THIS_MONDAY, 6);
const thisWeekShifts = fixture.shiftsBetween(THIS_MONDAY, thisWeekEnd);

const SCENARIOS: Scenario[] = [
  {
    id: 1,
    name: "schedule page (next week): 给我排一下班",
    message: "给我排一下班",
    path: "/manager/personnel/schedule",
    context: scheduleContext({ view: "week", weekStart: NEXT_MONDAY, weekEnd: nextWeekEnd, staffCount: 2, weekShiftCount: 0 }),
    verify: (run, c) => {
      const proposal = run.calls.find((call) => call.tool === "proposeSchedule" && !call.error)?.output as
        | {
            shifts?: ActionBlock[];
            rolesToCreate?: Array<{ name: string }>;
            range?: { start: string; end: string };
            uncovered?: Array<{ date: string; shift: string }>;
          }
        | undefined;
      c.check("called proposeSchedule", !!proposal);
      c.check("proposal covers the page's week", proposal?.range?.start === NEXT_MONDAY, JSON.stringify(proposal?.range ?? null));
      const shifts = named(run, "addShift");
      c.check("emits addShift blocks (a schedule, not a questionnaire)", shifts.length > 0, `${shifts.length} addShift`);
      c.check("no /ask cards", run.reply.questions.length === 0, run.reply.questions.map((q) => q.q).join(" | "));
      const others = run.reply.actions.filter((a) => a.action !== "addShift" && a.action !== "addRole");
      c.check("no invented prerequisite actions", others.length === 0, others.map((a) => String(a.action)).join(", "));
      c.check("does not bring up a punch-in code", !checks.mentionsPunchCode(run.reply.prose));
      const availabilityAsks = checks.asksForAvailability(run.reply.prose);
      c.check("does not ask for availability", availabilityAsks.length === 0, availabilityAsks.join(" | "));
      const prerequisites = checks.inventedPrerequisites(run.reply.prose);
      c.check("puts no setup steps in front of the schedule", prerequisites.length === 0, prerequisites.join(" | "));
      // The engine's assumption says "Say so in the reply"; leaving it out is a defect, not the one tested here.
      if (!/假设|默认|视为|按(?:照)?营业时间|营业时间内|availability|(?:没有|未).{0,12}(?:可上班|空闲|可用)/i.test(run.reply.prose)) {
        c.warn("does not say availability was assumed from the opening hours");
      }
      // What the plan leaves open is the owner's to fix; the prose must not hide it.
      const uncovered = proposal?.uncovered ?? [];
      if (uncovered.length > 0 && /覆盖(?:了)?(?:所有|全部|每天|每一天|整周)|全部覆盖|都(?:已)?覆盖|fully covered|covers? (?:every|all)/i.test(run.reply.prose)) {
        c.warn("claims full coverage while the proposal leaves slots uncovered", `${uncovered.length} uncovered`);
      }
      const staffedDays = new Set((proposal?.shifts ?? []).map((s) => String(s.date)));
      const emptyDays = [...new Set(uncovered.map((u) => u.date))].filter((d) => !staffedDays.has(d));
      const mentioned = new Set(checks.monthDaysMentioned(run.reply.prose));
      const dayWords = /周日|星期日|星期天|礼拜天|Sunday/i;
      const silent = emptyDays.filter(
        (d) => !mentioned.has(d.slice(5)) && !run.reply.prose.includes(d.slice(5)) && !(weekdayOfKey(d) === 0 && dayWords.test(run.reply.prose)),
      );
      if (silent.length > 0) c.warn("does not mention the days left with nobody", silent.join(", "));
      if (!run.reply.prose.includes(PLACEHOLDER.name)) c.warn(`does not say why ${PLACEHOLDER.name} is not scheduled (no app login)`);
      const roles = named(run, "addRole").map((a) => String(a.name ?? ""));
      for (const role of proposal?.rolesToCreate ?? []) {
        c.check(`proposes the missing role "${role.name}" (addRole)`, roles.includes(role.name));
        const roleAt = run.reply.text.indexOf('"addRole"');
        const shiftAt = run.reply.text.indexOf('"addShift"');
        c.check("addRole comes before the addShift blocks", roleAt >= 0 && (shiftAt < 0 || roleAt < shiftAt));
      }
      const key = (s: ActionBlock) => `${s.staffName}|${s.date}|${s.startTime}|${s.endTime}|${s.shiftType}|${JSON.stringify(s.staffRoles)}`;
      const proposed = new Set((proposal?.shifts ?? []).map(key));
      const emitted = new Set(shifts.map(key));
      const invented = [...emitted].filter((k) => !proposed.has(k));
      const dropped = [...proposed].filter((k) => !emitted.has(k));
      c.check("every addShift is copied from proposeSchedule", invented.length === 0, invented.join("; "));
      c.check("every proposed shift has its addShift", dropped.length === 0, `${dropped.length} missing: ${dropped.slice(0, 3).join("; ")}`);
      // Only members with a login are auto-scheduled, so every shift is Muheng Fan's and must carry his id.
      const wrongMember = shifts.filter((s) => (s.staffName === OWNER.name ? s.memberId !== OWNER.id : s.memberId !== undefined));
      c.check(
        "addShift memberIds are present and the fixture's",
        wrongMember.length === 0,
        wrongMember.map((s) => `${String(s.staffName)} ${String(s.date)}: ${String(s.memberId ?? "no memberId")}`).join(", "),
      );
      const unknownRoles = shifts.flatMap((s) => (Array.isArray(s.staffRoles) ? s.staffRoles.map(String) : [])).filter((r) => !roles.includes(r));
      c.check("addShift roles exist or are created in the same reply", unknownRoles.length === 0, [...new Set(unknownRoles)].join(", "));
      const outside = shifts.filter((s) => String(s.date) < NEXT_MONDAY || String(s.date) > nextWeekEnd);
      c.check("shifts fall in the page's week", outside.length === 0, outside.map((s) => String(s.date)).join(", "));
    },
  },
  {
    id: 2,
    name: "team page (Muheng Fan open): 给他设一个打卡码 1234",
    message: "给他设一个打卡码 1234",
    path: "/manager/personnel/team",
    context: teamContext({
      view: "graph", memberCount: 2, inviteCount: 0, groupCount: 0, search: "", panel: "editMember",
      selected: { kind: "member", memberId: OWNER.id, name: OWNER.name, role: "owner", status: "active", hasPunchInCode: false },
    }),
    verify: (run, c) => {
      const sets = named(run, "setPunchInCode");
      c.check("exactly one setPunchInCode block", sets.length === 1, `${sets.length}`);
      c.check("memberId resolved from the page (Muheng Fan)", sets[0]?.memberId === OWNER.id, String(sets[0]?.memberId ?? "none"));
      c.check("code is the user's 1234", String(sets[0]?.code ?? "") === "1234", String(sets[0]?.code ?? "none"));
      const others = writes(run).filter((a) => a.action !== "setPunchInCode");
      c.check("no other actions", others.length === 0, others.map((a) => String(a.action)).join(", "));
      c.check("no /ask cards", run.reply.questions.length === 0, run.reply.questions.map((q) => q.q).join(" | "));
    },
  },
  {
    id: 3,
    name: "schedule page (this week): 这周谁上班？",
    message: "这周谁上班？",
    path: "/manager/personnel/schedule",
    context: scheduleContext({ view: "week", weekStart: THIS_MONDAY, weekEnd: thisWeekEnd, staffCount: 2, weekShiftCount: thisWeekShifts.length }),
    verify: (run, c) => {
      noWrites(run, c);
      c.check("read the shifts", called(run, "viewScheduleHistory", "viewUpcomingShifts"), run.calls.map((call) => call.tool).join(", ") || "no tools");
      for (const name of new Set(thisWeekShifts.map((s) => s.name))) {
        c.check(`names ${name} (works this week)`, run.reply.prose.includes(name));
      }
      const week = new Set(Array.from({ length: 7 }, (_, i) => addDaysToKey(THIS_MONDAY, i).slice(5)));
      const outside = checks.monthDaysMentioned(run.reply.prose).filter((d) => !week.has(d));
      c.check("only days of the page's week", outside.length === 0, outside.join(", "));
      c.check("no /ask cards", run.reply.questions.length === 0, run.reply.questions.map((q) => q.q).join(" | "));
    },
  },
  {
    id: 4,
    name: "inventory page (Oat Milk open): 这个还剩多少？",
    message: "这个还剩多少？",
    path: "/manager/inventory",
    context: inventoryPageContext({
      items: 5, lowStock: 1, outOfStock: 0, shown: 5, category: "All", search: "", sortKey: "name", sortDir: "asc",
      dialog: "editItem", item: { id: OPEN_ITEM.id, name: OPEN_ITEM.name },
    }),
    verify: (run, c) => {
      noWrites(run, c);
      c.check("read the stock (viewInventory)", called(run, "viewInventory"), run.calls.map((call) => call.tool).join(", ") || "no tools");
      const byPageId = run.calls.some((call) => call.tool === "viewInventory" && (call.input as { itemId?: unknown }).itemId === OPEN_ITEM.id);
      if (!byPageId) c.warn("did not pass the page's itemId to viewInventory", "looked the item up another way");
      c.check("names the open item", /oat milk|燕麦奶/i.test(run.reply.prose));
      const stock = new RegExp(`(^|[^\\d.])${OPEN_ITEM.stock}(\\.0+)?\\s*(${OPEN_ITEM.unit}|升|公升)`, "i");
      c.check(`states its stock (${OPEN_ITEM.stock} ${OPEN_ITEM.unit})`, stock.test(run.reply.prose.replace(/\*+/g, "")));
      c.check("no /ask cards", run.reply.questions.length === 0, run.reply.questions.map((q) => q.q).join(" | "));
    },
  },
  {
    id: 5,
    name: "sales page: 上周销售怎么样？",
    message: "上周销售怎么样？",
    path: "/manager/sales",
    context: salesPageContext({
      tab: "history", days: fixture.DAILY_SALES_CENTS.length,
      range: { from: fixture.DAILY_SALES_CENTS[0].date, to: fixture.DAILY_SALES_CENTS[fixture.DAILY_SALES_CENTS.length - 1].date },
    }),
    verify: (run, c) => {
      noWrites(run, c);
      c.check("read the sales (viewSales / viewFinance)", called(run, "viewSales", "viewFinance"), run.calls.map((call) => call.tool).join(", ") || "no tools");
      const totals = new Map<number, string>([
        [fixture.salesCentsBetween(LAST_MONDAY, addDaysToKey(LAST_MONDAY, 6)), `last calendar week ${LAST_MONDAY}..`],
        [fixture.salesCentsBetween(addDaysToKey(TODAY, -7), addDaysToKey(TODAY, -1)), "last 7 days"],
        [fixture.salesCentsBetween(THIS_MONDAY, addDaysToKey(TODAY, -1)), "this week so far"],
      ]);
      const daily = new Set(fixture.DAILY_SALES_CENTS.map((d) => d.cents));
      const stated = checks.amountsInCents(run.reply.prose);
      const total = stated.find((n) => totals.has(n));
      const days = stated.filter((n) => daily.has(n));
      c.check(
        "states a figure from the store's sales",
        total !== undefined || days.length > 0,
        total !== undefined ? `total ${(total / 100).toFixed(2)} = ${totals.get(total)}` : `${days.length} daily figures, no weekly total`,
      );
      c.check("no /ask cards", run.reply.questions.length === 0, run.reply.questions.map((q) => q.q).join(" | "));
      // The store sells in USD; viewSales returns amounts without a currency.
      if (/元|¥|￥|RMB|人民币/.test(run.reply.prose) && !/USD|US\$|\$|美元/.test(run.reply.prose)) {
        c.warn("labels the store's USD sales as yuan", "viewSales returns no currency");
      }
    },
  },
];

// ── Main ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const onlyArg = args[args.indexOf("--only") + 1];
const only = args.includes("--only") && onlyArg ? new Set(onlyArg.split(",").map(Number)) : null;
const outPath = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
const selected = SCENARIOS.filter((s) => !only || only.has(s.id));

console.log(
  `Mr. Merchiva eval — today ${TODAY}, ${selected.length} scenario(s), tiers L1 ${tierModelId(1)} · L2 ${tierModelId(2)} · L3 ${tierModelId(3)}; ` +
    `fake tables: ${fixture.servedTables().join(", ")}`,
);

// --dry: the pages, the prompt and every read tool against the fixture, with no model call.
if (args.includes("--dry")) {
  for (const s of selected) {
    const page = pageFor(s.path, s.context);
    console.log(`\n── ${s.id}. ${s.name}\npage: ${JSON.stringify(page)}\ntriage note: ${pageTriageNote(page)}`);
  }
  const system = buildSystemPrompt(STORE_CONTEXT, LANG, {}, permissionSummary(ACCESS), "chat", READ_TOOLS, "");
  console.log(`\nsystem prompt: ${system.length} chars + background note ${BACKGROUND_NOTE.length}; output cap ${MAX_OUTPUT_TOKENS}`);
  const tools = buildMerchivaTools({ token: TOKEN, organizationId: ORG, allowed: READ_TOOLS, today: TODAY, timeZone: TIME_ZONE });
  for (const [name, def] of Object.entries(tools)) {
    const input = name === "proposeSchedule" ? { weekStart: NEXT_MONDAY } : {};
    const out = await def.execute?.(input, { toolCallId: `dry-${name}`, messages: [] });
    console.log(`${name}: ${outputSummary(out)}`);
  }
  console.log(`\n${network.sql.length} fake SQL queries; refused: ${network.blocked.join(", ") || "none"}`);
  process.exit(network.blocked.length ? 1 : 0);
}

const results = await Promise.all(
  selected.map(async (s) => {
    const c = new checks.Checker();
    let transcript = "";
    let tier = "";
    try {
      const run = await runMessage(s.id, s.message, pageFor(s.path, s.context));
      tier = run.tierText;
      transcript = transcriptOf(s.message, run);
      commonChecks(run, c);
      s.verify(run, c);
    } catch (err) {
      c.check("scenario ran", false, err instanceof Error ? err.message : String(err));
    }
    const spent = usage.filter((u) => u.feature.startsWith(`eval_s${s.id}_`));
    const cost = spent.reduce((sum, u) => sum + u.cost, 0);
    c.info(`usage: ${spent.map((u) => `${u.model} ${u.inputTokens}+${u.outputTokens} tok`).join(", ")}; $${cost.toFixed(5)}`);
    return { name: `${s.id}. ${s.name}`, passed: c.problems.length === 0, checks: c.checks, transcript, problems: c.problems, warnings: c.warnings, tier, cost };
  }),
);

// Anything that tried to leave for a real database fails every scenario.
if (network.blocked.length > 0) {
  for (const r of results) {
    r.passed = false;
    r.problems.push(`refused network requests: ${network.blocked.join(", ")}`);
  }
}

for (const r of results) {
  console.log(`\n══ ${r.passed ? "PASS" : "FAIL"} ${r.name}\n${r.checks.join("\n")}\n── transcript\n${r.transcript}`);
}
const totalCost = results.reduce((sum, r) => sum + r.cost, 0);
console.log(`\n${results.filter((r) => r.passed).length}/${results.length} passed; ${network.sql.length} fake SQL queries; $${totalCost.toFixed(5)} total`);
if (outPath) await Bun.write(outPath, JSON.stringify({ today: TODAY, results, sqlQueries: network.sql.length, blocked: network.blocked }, null, 2));
process.exit(results.every((r) => r.passed) ? 0 : 1);
