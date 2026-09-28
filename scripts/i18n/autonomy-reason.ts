// Merges the autonomy-gate reason keys (`merchiva.autonomyReason.*`, rendered by
// lib/merchiva/autonomy-reason.ts under an approval card) and the card's two gate badges
// (`merchiva.ui.needsApproval`, `merchiva.ui.noPermission`) into all 8 locale files.
// Run: bun scripts/i18n/autonomy-reason.ts
// Leaf-scoped and idempotent: never deletes keys, only writes the leaves under OWNED, and leaves a
// locale file untouched when nothing changed. zh-tw / zh-hk are converted from zh-cn leaf by leaf
// with opencc-js (never run scripts/gen-traditional-zh.ts: it rewrites both files wholesale and
// would erase other sessions' edits).
import { readFileSync, writeFileSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import * as OpenCC from "opencc-js";
import { applyTaiwanTerms } from "./tw-terms";

type Tree = { [key: string]: string | Tree };
type HandLocale = "en" | "zh-cn" | "fr" | "es" | "hi" | "ar";

const OWNED: readonly string[] = ["merchiva.autonomyReason", "merchiva.ui.needsApproval", "merchiva.ui.noPermission"];

const DICT: Record<HandLocale, Tree> = {
  en: {
    merchiva: {
      ui: { needsApproval: "Needs your OK", noPermission: "No permission" },
      autonomyReason: {
        missingPermission: "You don't have permission to do this.",
        autonomyDisabled: "Automatic actions are off, so every change needs your OK.",
        riskNeedsApproval: "Risk: {risk}. In “{mode}” mode this needs your OK.",
        dailyLimit: "The daily limit of {limit} automatic actions has been reached.",
        orderInvalidLines: "Lines with a negative quantity or cost: {count}.",
        orderUnpriced: "The order value is unknown. Items without a unit cost: {count}.",
        orderOverCap: "The order total, {total}, is over the auto-order limit of {limit}.",
        refundOverCap: "A refund of {amount} is over the auto-refund limit of {limit}.",
        refundFullOverCap: "A full refund is over the auto-refund limit of {limit}.",
        priceChangeOverCap: "A {pct}% price change is over the auto limit of {limit}%.",
        auto: "Runs on its own in “{mode}” mode.",
        unknownAction: "Unknown action, so it needs your OK.",
        modes: {
          approval: "Approval required",
          partial: "Partially automatic",
          full: "Fully automatic",
        },
      },
    },
  },
  "zh-cn": {
    merchiva: {
      ui: { needsApproval: "需要你确认", noPermission: "无权限" },
      autonomyReason: {
        missingPermission: "你没有执行此操作的权限。",
        autonomyDisabled: "自动操作已关闭，每项更改都需要你确认。",
        riskNeedsApproval: "{risk}风险操作在“{mode}”模式下需要你确认。",
        dailyLimit: "今天的自动操作已达到 {limit} 次上限。",
        orderInvalidLines: "有 {count} 行的数量或单价为负数。",
        orderUnpriced: "订单金额未知：有 {count} 个商品没有单价。",
        orderOverCap: "订单总额 {total} 超过了自动下单上限 {limit}。",
        refundOverCap: "退款 {amount} 超过了自动退款上限 {limit}。",
        refundFullOverCap: "全额退款超过了自动退款上限 {limit}。",
        priceChangeOverCap: "价格变动 {pct}% 超过了自动上限 {limit}%。",
        auto: "在“{mode}”模式下自动执行。",
        unknownAction: "未知操作，需要你确认。",
        modes: {
          approval: "需要审批",
          partial: "部分自动",
          full: "完全自动",
        },
      },
    },
  },
  fr: {
    merchiva: {
      ui: { needsApproval: "Votre accord est requis", noPermission: "Aucune autorisation" },
      autonomyReason: {
        missingPermission: "Vous n'avez pas l'autorisation de faire ceci.",
        autonomyDisabled: "Les actions automatiques sont désactivées : chaque modification nécessite votre accord.",
        riskNeedsApproval: "Risque : {risk}. En mode « {mode} », votre accord est nécessaire.",
        dailyLimit: "La limite quotidienne de {limit} actions automatiques est atteinte.",
        orderInvalidLines: "Lignes avec une quantité ou un coût négatif : {count}.",
        orderUnpriced: "Le montant de la commande est inconnu. Articles sans coût unitaire : {count}.",
        orderOverCap: "Le total de la commande, {total}, dépasse la limite de commande automatique de {limit}.",
        refundOverCap: "Un remboursement de {amount} dépasse la limite de remboursement automatique de {limit}.",
        refundFullOverCap: "Un remboursement intégral dépasse la limite de remboursement automatique de {limit}.",
        priceChangeOverCap: "Une variation de prix de {pct} % dépasse la limite automatique de {limit} %.",
        auto: "S'exécute automatiquement en mode « {mode} ».",
        unknownAction: "Action inconnue : votre accord est nécessaire.",
        modes: {
          approval: "Approbation requise",
          partial: "Partiellement automatique",
          full: "Entièrement automatique",
        },
      },
    },
  },
  es: {
    merchiva: {
      ui: { needsApproval: "Necesita tu aprobación", noPermission: "Sin permiso" },
      autonomyReason: {
        missingPermission: "No tienes permiso para hacer esto.",
        autonomyDisabled: "Las acciones automáticas están desactivadas, así que cada cambio necesita tu aprobación.",
        riskNeedsApproval: "Riesgo: {risk}. En el modo «{mode}» necesita tu aprobación.",
        dailyLimit: "Se alcanzó el límite diario de {limit} acciones automáticas.",
        orderInvalidLines: "Líneas con cantidad o costo negativo: {count}.",
        orderUnpriced: "El importe del pedido es desconocido. Artículos sin costo unitario: {count}.",
        orderOverCap: "El total del pedido, {total}, supera el límite de pedido automático de {limit}.",
        refundOverCap: "Un reembolso de {amount} supera el límite de reembolso automático de {limit}.",
        refundFullOverCap: "Un reembolso total supera el límite de reembolso automático de {limit}.",
        priceChangeOverCap: "Un cambio de precio del {pct}% supera el límite automático del {limit}%.",
        auto: "Se ejecuta automáticamente en el modo «{mode}».",
        unknownAction: "Acción desconocida, así que necesita tu aprobación.",
        modes: {
          approval: "Aprobación requerida",
          partial: "Parcialmente automático",
          full: "Totalmente automático",
        },
      },
    },
  },
  hi: {
    merchiva: {
      ui: { needsApproval: "आपकी मंज़ूरी चाहिए", noPermission: "अनुमति नहीं" },
      autonomyReason: {
        missingPermission: "आपको यह करने की अनुमति नहीं है।",
        autonomyDisabled: "स्वचालित कार्य बंद हैं, इसलिए हर बदलाव के लिए आपकी मंज़ूरी चाहिए।",
        riskNeedsApproval: "जोखिम: {risk}। “{mode}” मोड में इसके लिए आपकी मंज़ूरी चाहिए।",
        dailyLimit: "{limit} स्वचालित कार्यों की दैनिक सीमा पूरी हो गई है।",
        orderInvalidLines: "ऋणात्मक मात्रा या लागत वाली पंक्तियाँ: {count}।",
        orderUnpriced: "ऑर्डर की राशि अज्ञात है। बिना इकाई लागत वाले आइटम: {count}।",
        orderOverCap: "ऑर्डर का कुल {total} स्वचालित ऑर्डर सीमा {limit} से अधिक है।",
        refundOverCap: "{amount} का रिफ़ंड स्वचालित रिफ़ंड सीमा {limit} से अधिक है।",
        refundFullOverCap: "पूरा रिफ़ंड स्वचालित रिफ़ंड सीमा {limit} से अधिक है।",
        priceChangeOverCap: "{pct}% का मूल्य बदलाव स्वचालित सीमा {limit}% से अधिक है।",
        auto: "“{mode}” मोड में अपने आप चलता है।",
        unknownAction: "अज्ञात कार्य, इसलिए आपकी मंज़ूरी चाहिए।",
        modes: {
          approval: "मंज़ूरी आवश्यक",
          partial: "आंशिक रूप से स्वचालित",
          full: "पूरी तरह स्वचालित",
        },
      },
    },
  },
  ar: {
    merchiva: {
      ui: { needsApproval: "بحاجة إلى موافقتك", noPermission: "لا توجد صلاحية" },
      autonomyReason: {
        missingPermission: "ليست لديك صلاحية للقيام بذلك.",
        autonomyDisabled: "الإجراءات التلقائية متوقفة، لذا يحتاج كل تغيير إلى موافقتك.",
        riskNeedsApproval: "المخاطر: {risk}. في وضع «{mode}» يحتاج هذا إلى موافقتك.",
        dailyLimit: "تم بلوغ الحد اليومي البالغ {limit} من الإجراءات التلقائية.",
        orderInvalidLines: "بنود بكمية أو تكلفة سالبة: {count}.",
        orderUnpriced: "قيمة الطلب غير معروفة. عناصر بلا تكلفة وحدة: {count}.",
        orderOverCap: "إجمالي الطلب، {total}، يتجاوز حد الطلب التلقائي البالغ {limit}.",
        refundOverCap: "استرداد {amount} يتجاوز حد الاسترداد التلقائي البالغ {limit}.",
        refundFullOverCap: "الاسترداد الكامل يتجاوز حد الاسترداد التلقائي البالغ {limit}.",
        priceChangeOverCap: "تغيير السعر بنسبة {pct}% يتجاوز الحد التلقائي البالغ {limit}%.",
        auto: "يُنفَّذ تلقائيًا في وضع «{mode}».",
        unknownAction: "إجراء غير معروف، لذا يحتاج إلى موافقتك.",
        modes: {
          approval: "الموافقة مطلوبة",
          partial: "تلقائي جزئيًا",
          full: "تلقائي بالكامل",
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
if (mergeInto("zh-tw", zh.map(([k, v]): [string, string] => [k, applyTaiwanTerms(toTW(v))]))) changed.push("zh-tw");
if (mergeInto("zh-hk", zh.map(([k, v]): [string, string] => [k, toHK(v)]))) changed.push("zh-hk");
console.log(`merged ${zh.length} keys into 8 locales; changed: ${changed.length > 0 ? changed.join(", ") : "none"}`);
