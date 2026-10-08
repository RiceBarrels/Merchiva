// Merges the Mr. Merchiva tool-step i18n keys (`merchiva.tools.*`, `merchiva.steps.*`) into all 8
// locale files. Used by components/merchiva-dock/tool-steps.tsx.
// Run: bun scripts/i18n/merchiva-tools.ts
// Leaf-scoped and idempotent: never deletes keys, only writes the subtrees in OWNED, and leaves a
// locale file untouched when nothing changed. zh-tw / zh-hk are converted from zh-cn leaf by leaf
// with opencc-js (never run scripts/gen-traditional-zh.ts: it rewrites both files wholesale and
// would erase other sessions' edits).
import { readFileSync, writeFileSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import * as OpenCC from "opencc-js";
import { applyTaiwanTerms } from "./tw-terms";

type Tree = { [key: string]: string | Tree };
type HandLocale = "en" | "zh-cn" | "fr" | "es" | "hi" | "ar";

const OWNED: readonly string[] = ["merchiva.tools", "merchiva.steps"];

/** running (progressive, ends with "…"), done (past tense), error. */
function tool(running: string, done: string, error: string): Tree {
  return { running, done, error };
}

const DICT: Record<HandLocale, Tree> = {
  en: {
    merchiva: {
      tools: {
        viewTeam: tool("Checking the team…", "Checked the team", "Couldn't check the team"),
        viewRoles: tool("Checking roles…", "Checked roles", "Couldn't check roles"),
        viewScheduleHistory: tool("Reviewing past shifts…", "Reviewed past shifts", "Couldn't review past shifts"),
        viewUpcomingShifts: tool("Checking upcoming shifts…", "Checked upcoming shifts", "Couldn't check upcoming shifts"),
        viewShiftPresets: tool("Checking shift templates…", "Checked shift templates", "Couldn't check shift templates"),
        viewAvailability: tool("Checking availability…", "Checked availability", "Couldn't check availability"),
        viewInventory: tool("Checking inventory…", "Checked inventory", "Couldn't check inventory"),
        viewSuppliers: tool("Checking suppliers…", "Checked suppliers", "Couldn't check suppliers"),
        viewProducts: tool("Checking products…", "Checked products", "Couldn't check products"),
        viewSales: tool("Checking sales…", "Checked sales", "Couldn't check sales"),
        viewFinance: tool("Calculating finances…", "Calculated finances", "Couldn't calculate finances"),
        viewForecast: tool("Building a sales forecast…", "Built a sales forecast", "Couldn't build a sales forecast"),
        viewRestockSuggestions: tool("Working out what to restock…", "Worked out what to restock", "Couldn't work out what to restock"),
        proposeSchedule: tool("Drafting a schedule…", "Drafted a schedule", "Couldn't draft a schedule"),
      },
      steps: {
        label: "Steps",
        count: "{n} steps",
        results: "{n} results",
        oneResult: "1 result",
        days: "last {n} days",
        nextDays: "next {n} days",
        supplier: "supplier: {name}",
        period: {
          thisWeek: "this week",
          lastWeek: "last week",
          thisMonth: "this month",
          lastMonth: "last month",
          thisQuarter: "this quarter",
          thisYear: "this year",
        },
        lowOnly: "low stock only",
        weekStart: "week of {date}",
        mcp: "{server} · {tool}",
        unknownRunning: "Using {tool}…",
        unknownDone: "Used {tool}",
        unknownError: "Couldn't use {tool}",
        status: {
          running: "In progress",
          done: "Done",
          error: "Failed",
          interrupted: "Stopped",
        },
      },
    },
  },
  "zh-cn": {
    merchiva: {
      tools: {
        viewTeam: tool("正在查看团队…", "查看了团队", "未能查看团队"),
        viewRoles: tool("正在查看岗位…", "查看了岗位", "未能查看岗位"),
        viewScheduleHistory: tool("正在查看过往排班…", "查看了过往排班", "未能查看过往排班"),
        viewUpcomingShifts: tool("正在查看接下来的班次…", "查看了接下来的班次", "未能查看接下来的班次"),
        viewShiftPresets: tool("正在查看班次模板…", "查看了班次模板", "未能查看班次模板"),
        viewAvailability: tool("正在查看员工可上班时间…", "查看了员工可上班时间", "未能查看员工可上班时间"),
        viewInventory: tool("正在查看库存…", "查看了库存", "未能查看库存"),
        viewSuppliers: tool("正在查看供应商…", "查看了供应商", "未能查看供应商"),
        viewProducts: tool("正在查看商品…", "查看了商品", "未能查看商品"),
        viewSales: tool("正在查看销售数据…", "查看了销售数据", "未能查看销售数据"),
        viewFinance: tool("正在计算财务数据…", "计算了财务数据", "未能计算财务数据"),
        viewForecast: tool("正在生成销售预测…", "生成了销售预测", "未能生成销售预测"),
        viewRestockSuggestions: tool("正在计算补货建议…", "计算了补货建议", "未能计算补货建议"),
        proposeSchedule: tool("正在拟定排班…", "拟定了排班", "未能拟定排班"),
      },
      steps: {
        label: "步骤",
        count: "{n} 个步骤",
        results: "{n} 条结果",
        oneResult: "1 条结果",
        days: "最近 {n} 天",
        nextDays: "未来 {n} 天",
        supplier: "供应商：{name}",
        period: {
          thisWeek: "本周",
          lastWeek: "上周",
          thisMonth: "本月",
          lastMonth: "上月",
          thisQuarter: "本季度",
          thisYear: "今年",
        },
        lowOnly: "仅低库存",
        weekStart: "{date} 这一周",
        mcp: "{server} · {tool}",
        unknownRunning: "正在使用 {tool}…",
        unknownDone: "使用了 {tool}",
        unknownError: "未能使用 {tool}",
        status: {
          running: "进行中",
          done: "已完成",
          error: "失败",
          interrupted: "已中断",
        },
      },
    },
  },
  fr: {
    merchiva: {
      tools: {
        viewTeam: tool("Consultation de l'équipe…", "Équipe consultée", "Impossible de consulter l'équipe"),
        viewRoles: tool("Consultation des rôles…", "Rôles consultés", "Impossible de consulter les rôles"),
        viewScheduleHistory: tool("Consultation des shifts passés…", "Shifts passés consultés", "Impossible de consulter les shifts passés"),
        viewUpcomingShifts: tool("Consultation des prochains shifts…", "Prochains shifts consultés", "Impossible de consulter les prochains shifts"),
        viewShiftPresets: tool("Consultation des modèles de shift…", "Modèles de shift consultés", "Impossible de consulter les modèles de shift"),
        viewAvailability: tool("Consultation des disponibilités…", "Disponibilités consultées", "Impossible de consulter les disponibilités"),
        viewInventory: tool("Vérification de l'inventaire…", "Inventaire vérifié", "Impossible de vérifier l'inventaire"),
        viewSuppliers: tool("Consultation des fournisseurs…", "Fournisseurs consultés", "Impossible de consulter les fournisseurs"),
        viewProducts: tool("Consultation des produits…", "Produits consultés", "Impossible de consulter les produits"),
        viewSales: tool("Consultation des ventes…", "Ventes consultées", "Impossible de consulter les ventes"),
        viewFinance: tool("Calcul des finances…", "Finances calculées", "Impossible de calculer les finances"),
        viewForecast: tool("Prévision des ventes en cours…", "Prévision des ventes établie", "Impossible d'établir la prévision des ventes"),
        viewRestockSuggestions: tool("Calcul du réapprovisionnement…", "Réapprovisionnement calculé", "Impossible de calculer le réapprovisionnement"),
        proposeSchedule: tool("Préparation d'un planning…", "Planning préparé", "Impossible de préparer un planning"),
      },
      steps: {
        label: "Étapes",
        count: "{n} étapes",
        results: "{n} résultats",
        oneResult: "1 résultat",
        days: "{n} derniers jours",
        nextDays: "{n} prochains jours",
        supplier: "fournisseur : {name}",
        period: {
          thisWeek: "cette semaine",
          lastWeek: "la semaine dernière",
          thisMonth: "ce mois-ci",
          lastMonth: "le mois dernier",
          thisQuarter: "ce trimestre",
          thisYear: "cette année",
        },
        lowOnly: "stock bas uniquement",
        weekStart: "semaine du {date}",
        mcp: "{server} · {tool}",
        unknownRunning: "Utilisation de {tool}…",
        unknownDone: "{tool} utilisé",
        unknownError: "Impossible d'utiliser {tool}",
        status: {
          running: "En cours",
          done: "Terminé",
          error: "Échec",
          interrupted: "Interrompu",
        },
      },
    },
  },
  es: {
    merchiva: {
      tools: {
        viewTeam: tool("Revisando el equipo…", "Equipo revisado", "No se pudo revisar el equipo"),
        viewRoles: tool("Revisando los roles…", "Roles revisados", "No se pudieron revisar los roles"),
        viewScheduleHistory: tool("Revisando turnos anteriores…", "Turnos anteriores revisados", "No se pudieron revisar los turnos anteriores"),
        viewUpcomingShifts: tool("Revisando los próximos turnos…", "Próximos turnos revisados", "No se pudieron revisar los próximos turnos"),
        viewShiftPresets: tool("Revisando plantillas de turno…", "Plantillas de turno revisadas", "No se pudieron revisar las plantillas de turno"),
        viewAvailability: tool("Revisando la disponibilidad…", "Disponibilidad revisada", "No se pudo revisar la disponibilidad"),
        viewInventory: tool("Revisando el inventario…", "Inventario revisado", "No se pudo revisar el inventario"),
        viewSuppliers: tool("Revisando proveedores…", "Proveedores revisados", "No se pudieron revisar los proveedores"),
        viewProducts: tool("Revisando productos…", "Productos revisados", "No se pudieron revisar los productos"),
        viewSales: tool("Revisando las ventas…", "Ventas revisadas", "No se pudieron revisar las ventas"),
        viewFinance: tool("Calculando las finanzas…", "Finanzas calculadas", "No se pudieron calcular las finanzas"),
        viewForecast: tool("Calculando la predicción de ventas…", "Predicción de ventas calculada", "No se pudo calcular la predicción de ventas"),
        viewRestockSuggestions: tool("Calculando qué reponer…", "Reposición calculada", "No se pudo calcular la reposición"),
        proposeSchedule: tool("Preparando un horario…", "Horario preparado", "No se pudo preparar el horario"),
      },
      steps: {
        label: "Pasos",
        count: "{n} pasos",
        results: "{n} resultados",
        oneResult: "1 resultado",
        days: "últimos {n} días",
        nextDays: "próximos {n} días",
        supplier: "proveedor: {name}",
        period: {
          thisWeek: "esta semana",
          lastWeek: "la semana pasada",
          thisMonth: "este mes",
          lastMonth: "el mes pasado",
          thisQuarter: "este trimestre",
          thisYear: "este año",
        },
        lowOnly: "solo stock bajo",
        weekStart: "semana del {date}",
        mcp: "{server} · {tool}",
        unknownRunning: "Usando {tool}…",
        unknownDone: "Se usó {tool}",
        unknownError: "No se pudo usar {tool}",
        status: {
          running: "En curso",
          done: "Listo",
          error: "Error",
          interrupted: "Interrumpido",
        },
      },
    },
  },
  hi: {
    merchiva: {
      tools: {
        viewTeam: tool("टीम देख रहा हूँ…", "टीम देखी", "टीम नहीं देख सका"),
        viewRoles: tool("भूमिकाएँ देख रहा हूँ…", "भूमिकाएँ देखीं", "भूमिकाएँ नहीं देख सका"),
        viewScheduleHistory: tool("पिछली शिफ्टें देख रहा हूँ…", "पिछली शिफ्टें देखीं", "पिछली शिफ्टें नहीं देख सका"),
        viewUpcomingShifts: tool("आने वाली शिफ्टें देख रहा हूँ…", "आने वाली शिफ्टें देखीं", "आने वाली शिफ्टें नहीं देख सका"),
        viewShiftPresets: tool("शिफ्ट टेम्पलेट देख रहा हूँ…", "शिफ्ट टेम्पलेट देखे", "शिफ्ट टेम्पलेट नहीं देख सका"),
        viewAvailability: tool("उपलब्धता देख रहा हूँ…", "उपलब्धता देखी", "उपलब्धता नहीं देख सका"),
        viewInventory: tool("इन्वेंटरी जाँच रहा हूँ…", "इन्वेंटरी जाँची", "इन्वेंटरी नहीं जाँच सका"),
        viewSuppliers: tool("आपूर्तिकर्ता देख रहा हूँ…", "आपूर्तिकर्ता देखे", "आपूर्तिकर्ता नहीं देख सका"),
        viewProducts: tool("उत्पाद देख रहा हूँ…", "उत्पाद देखे", "उत्पाद नहीं देख सका"),
        viewSales: tool("बिक्री देख रहा हूँ…", "बिक्री देखी", "बिक्री नहीं देख सका"),
        viewFinance: tool("वित्त की गणना कर रहा हूँ…", "वित्त की गणना की", "वित्त की गणना नहीं कर सका"),
        viewForecast: tool("बिक्री पूर्वानुमान बना रहा हूँ…", "बिक्री पूर्वानुमान बनाया", "बिक्री पूर्वानुमान नहीं बना सका"),
        viewRestockSuggestions: tool("रीस्टॉक का हिसाब लगा रहा हूँ…", "रीस्टॉक का हिसाब लगाया", "रीस्टॉक का हिसाब नहीं लगा सका"),
        proposeSchedule: tool("शेड्यूल का मसौदा बना रहा हूँ…", "शेड्यूल का मसौदा बनाया", "शेड्यूल का मसौदा नहीं बना सका"),
      },
      steps: {
        label: "चरण",
        count: "{n} चरण",
        results: "{n} परिणाम",
        oneResult: "1 परिणाम",
        days: "पिछले {n} दिन",
        nextDays: "अगले {n} दिन",
        supplier: "आपूर्तिकर्ता: {name}",
        period: {
          thisWeek: "इस सप्ताह",
          lastWeek: "पिछले सप्ताह",
          thisMonth: "इस महीने",
          lastMonth: "पिछले महीने",
          thisQuarter: "इस तिमाही",
          thisYear: "इस साल",
        },
        lowOnly: "केवल कम स्टॉक",
        weekStart: "{date} वाला सप्ताह",
        mcp: "{server} · {tool}",
        unknownRunning: "{tool} इस्तेमाल कर रहा हूँ…",
        unknownDone: "{tool} इस्तेमाल किया",
        unknownError: "{tool} इस्तेमाल नहीं कर सका",
        status: {
          running: "जारी",
          done: "पूरा",
          error: "विफल",
          interrupted: "रुका",
        },
      },
    },
  },
  ar: {
    merchiva: {
      tools: {
        viewTeam: tool("جارٍ الاطلاع على الفريق…", "تم الاطلاع على الفريق", "تعذّر الاطلاع على الفريق"),
        viewRoles: tool("جارٍ الاطلاع على الأدوار…", "تم الاطلاع على الأدوار", "تعذّر الاطلاع على الأدوار"),
        viewScheduleHistory: tool("جارٍ مراجعة المناوبات السابقة…", "تمت مراجعة المناوبات السابقة", "تعذّرت مراجعة المناوبات السابقة"),
        viewUpcomingShifts: tool("جارٍ الاطلاع على المناوبات القادمة…", "تم الاطلاع على المناوبات القادمة", "تعذّر الاطلاع على المناوبات القادمة"),
        viewShiftPresets: tool("جارٍ الاطلاع على قوالب المناوبات…", "تم الاطلاع على قوالب المناوبات", "تعذّر الاطلاع على قوالب المناوبات"),
        viewAvailability: tool("جارٍ الاطلاع على أوقات التوفر…", "تم الاطلاع على أوقات التوفر", "تعذّر الاطلاع على أوقات التوفر"),
        viewInventory: tool("جارٍ فحص المخزون…", "تم فحص المخزون", "تعذّر فحص المخزون"),
        viewSuppliers: tool("جارٍ الاطلاع على الموردين…", "تم الاطلاع على الموردين", "تعذّر الاطلاع على الموردين"),
        viewProducts: tool("جارٍ الاطلاع على المنتجات…", "تم الاطلاع على المنتجات", "تعذّر الاطلاع على المنتجات"),
        viewSales: tool("جارٍ الاطلاع على المبيعات…", "تم الاطلاع على المبيعات", "تعذّر الاطلاع على المبيعات"),
        viewFinance: tool("جارٍ حساب البيانات المالية…", "تم حساب البيانات المالية", "تعذّر حساب البيانات المالية"),
        viewForecast: tool("جارٍ إعداد توقعات المبيعات…", "تم إعداد توقعات المبيعات", "تعذّر إعداد توقعات المبيعات"),
        viewRestockSuggestions: tool("جارٍ حساب ما يلزم إعادة تخزينه…", "تم حساب ما يلزم إعادة تخزينه", "تعذّر حساب ما يلزم إعادة تخزينه"),
        proposeSchedule: tool("جارٍ إعداد مسودة جدول…", "تم إعداد مسودة جدول", "تعذّر إعداد مسودة جدول"),
      },
      steps: {
        label: "الخطوات",
        count: "{n} خطوات",
        results: "{n} نتائج",
        oneResult: "نتيجة واحدة",
        days: "آخر {n} أيام",
        nextDays: "{n} أيام قادمة",
        supplier: "المورد: {name}",
        period: {
          thisWeek: "هذا الأسبوع",
          lastWeek: "الأسبوع الماضي",
          thisMonth: "هذا الشهر",
          lastMonth: "الشهر الماضي",
          thisQuarter: "هذا الربع",
          thisYear: "هذه السنة",
        },
        lowOnly: "المخزون المنخفض فقط",
        weekStart: "أسبوع {date}",
        mcp: "{server} · {tool}",
        unknownRunning: "جارٍ استخدام {tool}…",
        unknownDone: "تم استخدام {tool}",
        unknownError: "تعذّر استخدام {tool}",
        status: {
          running: "قيد التنفيذ",
          done: "تم",
          error: "فشل",
          interrupted: "توقّف",
        },
      },
    },
  },
};

const MESSAGES = join(import.meta.dir, "..", "..", "messages");

function flatten(tree: Tree, prefix = ""): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.push([path, v]);
    else out.push(...flatten(v, path));
  }
  return out;
}

function setLeaf(root: Record<string, unknown>, path: string, value: string): void {
  if (!OWNED.some((o) => path === o || path.startsWith(`${o}.`))) throw new Error(`${path} is outside ${OWNED.join(", ")}`);
  const parts = path.split(".");
  let cur = root;
  for (const part of parts.slice(0, -1)) {
    const next = cur[part];
    if (next === undefined) cur[part] = {};
    else if (typeof next !== "object" || next === null || Array.isArray(next)) throw new Error(`${path}: "${part}" is not an object`);
    cur = cur[part] as Record<string, unknown>;
  }
  const leaf = parts[parts.length - 1];
  if (cur[leaf] !== undefined && typeof cur[leaf] !== "string") throw new Error(`${path} would overwrite an object`);
  cur[leaf] = value;
}

/** Returns true when the file changed. */
function mergeInto(locale: string, entries: Array<[string, string]>): boolean {
  const file = join(MESSAGES, `${locale}.json`);
  for (let attempt = 0; attempt < 5; attempt++) {
    const mtime = statSync(file).mtimeMs;
    const original = readFileSync(file, "utf8");
    const json = JSON.parse(original) as Record<string, unknown>;
    for (const [k, v] of entries) setLeaf(json, k, v);
    const text = `${JSON.stringify(json, null, 2)}\n`;
    if (text === original) return false; // already merged: don't touch the file
    if (statSync(file).mtimeMs !== mtime) continue; // another writer: redo from a fresh read
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, text);
    renameSync(tmp, file);
    return true;
  }
  throw new Error(`${locale}.json kept changing; rerun`);
}

const locales = Object.keys(DICT) as HandLocale[];
const enKeys = flatten(DICT.en).map(([k]) => k).sort().join("\n");
for (const loc of locales) {
  if (flatten(DICT[loc]).map(([k]) => k).sort().join("\n") !== enKeys) throw new Error(`${loc} key set differs from en`);
}
const changed: string[] = [];
for (const loc of locales) if (mergeInto(loc, flatten(DICT[loc]))) changed.push(loc);
const zh = flatten(DICT["zh-cn"]);
const toTW = OpenCC.Converter({ from: "cn", to: "twp" });
const toHK = OpenCC.Converter({ from: "cn", to: "hk" });
// twp turns 正在查看 into 正在檢視 but leaves 查看了 alone; keep the running and done labels in step.
const TW_EXTRA = [[/檢視/g, "查看"]] as const;
if (mergeInto("zh-tw", zh.map(([k, v]): [string, string] => [k, applyTaiwanTerms(toTW(v), TW_EXTRA)]))) changed.push("zh-tw");
if (mergeInto("zh-hk", zh.map(([k, v]): [string, string] => [k, toHK(v)]))) changed.push("zh-hk");
console.log(`merged ${zh.length} keys into 8 locales; changed: ${changed.length > 0 ? changed.join(", ") : "none"}`);
