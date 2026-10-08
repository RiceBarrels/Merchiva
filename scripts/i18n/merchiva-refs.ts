// Merges the Mr. Merchiva card strings that name rows instead of ids (`merchiva.refs.*`), the
// translated action toasts (`merchiva.toast.*`), the task card's evidence choices, and the
// action/field labels the approval card was missing, into all 8 locale files.
// Read by components/merchiva-dock/{action-card,action-previews,command-group,task-cards,
// task-delete-group}.tsx and lib/merchiva/action-toasts.ts.
// Run: bun scripts/i18n/merchiva-refs.ts
// Leaf-scoped and idempotent: never deletes keys, only writes the leaves in DICT (OWNED is
// exactly those leaves — `merchiva.taskAdd`, `merchiva.fields` and friends belong to other
// scripts), and leaves a locale file untouched when nothing changed. zh-tw / zh-hk are
// converted from zh-cn leaf by leaf with opencc-js (never run scripts/gen-traditional-zh.ts:
// it rewrites both files wholesale and would erase other sessions' edits).
import { readFileSync, writeFileSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import * as OpenCC from "opencc-js";
import { applyTaiwanTerms } from "./tw-terms";

type Tree = { [key: string]: string | Tree };
type HandLocale = "en" | "zh-cn" | "fr" | "es" | "hi" | "ar";

interface Strings {
  unknown: string; unknownRole: string; unknownTask: string; day: string;
  notAdded: string; cancelled: string;
  addWithoutEvidence: string; createChannel: string;
  done: string; doneWithTarget: string; orderEmailed: string; orderDraft: string; failed: string;
  unknownAction: string; targetMissing: string; evidenceNeedsChannel: string;
  setPunchInCode: string; addTrainingDay: string; updateTrainingDay: string; deleteTrainingDay: string;
  addTrainingObjective: string; updateTrainingObjective: string; deleteTrainingObjective: string;
  memberId: string; dayId: string; dayNumber: string; objectiveId: string; text: string; orgName: string;
}

function strings(s: Strings): Tree {
  return {
    merchiva: {
      refs: { unknown: s.unknown, unknownRole: s.unknownRole, unknownTask: s.unknownTask, day: s.day },
      status: { notAdded: s.notAdded, cancelled: s.cancelled },
      taskAdd: { addWithoutEvidence: s.addWithoutEvidence, createChannel: s.createChannel },
      toast: {
        done: s.done, doneWithTarget: s.doneWithTarget, orderEmailed: s.orderEmailed, orderDraft: s.orderDraft,
        failed: s.failed, unknownAction: s.unknownAction, targetMissing: s.targetMissing,
        evidenceNeedsChannel: s.evidenceNeedsChannel,
      },
      actions: {
        setPunchInCode: s.setPunchInCode,
        addTrainingDay: s.addTrainingDay, updateTrainingDay: s.updateTrainingDay, deleteTrainingDay: s.deleteTrainingDay,
        addTrainingObjective: s.addTrainingObjective, updateTrainingObjective: s.updateTrainingObjective,
        deleteTrainingObjective: s.deleteTrainingObjective,
      },
      fields: { memberId: s.memberId, dayId: s.dayId, dayNumber: s.dayNumber, objectiveId: s.objectiveId, text: s.text, orgName: s.orgName },
    },
  };
}

const DICT: Record<HandLocale, Tree> = {
  en: strings({
    unknown: "Not found", unknownRole: "Unknown role", unknownTask: "Unknown task", day: "Day {n}",
    notAdded: "Not added", cancelled: "Cancelled",
    addWithoutEvidence: "Add without evidence", createChannel: "Create a group channel",
    done: "Done: {action}", doneWithTarget: "Done: {action} · {target}",
    orderEmailed: "Order emailed to supplier", orderDraft: "Order saved as draft — manager notified",
    failed: "Action failed: {reason}",
    unknownAction: "Mr. Merchiva asked for an action this app doesn't have.",
    targetMissing: "Couldn't find what this action is about — it may have been changed or deleted.",
    evidenceNeedsChannel: "Photo proof needs a group channel. Pick one in the task's editor on the Personnel page.",
    setPunchInCode: "Set punch-in code", addTrainingDay: "Add training day", updateTrainingDay: "Edit training day",
    deleteTrainingDay: "Delete training day", addTrainingObjective: "Add objective", updateTrainingObjective: "Edit objective",
    deleteTrainingObjective: "Delete objective",
    memberId: "Member", dayId: "Training day", dayNumber: "Day", objectiveId: "Objective", text: "Text", orgName: "Store name",
  }),
  "zh-cn": strings({
    unknown: "未找到", unknownRole: "未知岗位", unknownTask: "未知任务", day: "第 {n} 天",
    notAdded: "未添加", cancelled: "已取消",
    addWithoutEvidence: "不要凭证，直接添加", createChannel: "去创建群组频道",
    done: "已完成：{action}", doneWithTarget: "已完成：{action} · {target}",
    orderEmailed: "订单已通过邮件发给供应商", orderDraft: "订单已存为草稿，已通知经理",
    failed: "操作失败：{reason}",
    unknownAction: "Mr. Merchiva 请求了一个本应用没有的操作。",
    targetMissing: "找不到此操作针对的记录，它可能已被修改或删除。",
    evidenceNeedsChannel: "拍照凭证需要一个群组频道，请在人员页面的任务编辑器中选择。",
    setPunchInCode: "设置打卡码", addTrainingDay: "添加培训日", updateTrainingDay: "编辑培训日",
    deleteTrainingDay: "删除培训日", addTrainingObjective: "添加培训目标", updateTrainingObjective: "编辑培训目标",
    deleteTrainingObjective: "删除培训目标",
    memberId: "成员", dayId: "培训日", dayNumber: "第几天", objectiveId: "培训目标", text: "内容", orgName: "店铺名称",
  }),
  fr: strings({
    unknown: "Introuvable", unknownRole: "Poste inconnu", unknownTask: "Tâche inconnue", day: "Jour {n}",
    notAdded: "Non ajouté", cancelled: "Annulé",
    addWithoutEvidence: "Ajouter sans justificatif", createChannel: "Créer un canal de groupe",
    done: "Terminé : {action}", doneWithTarget: "Terminé : {action} · {target}",
    orderEmailed: "Commande envoyée par e-mail au fournisseur", orderDraft: "Commande enregistrée en brouillon — responsable prévenu",
    failed: "Échec de l'action : {reason}",
    unknownAction: "Mr. Merchiva a demandé une action que cette application ne propose pas.",
    targetMissing: "Impossible de trouver l'élément visé par cette action — il a peut-être été modifié ou supprimé.",
    evidenceNeedsChannel: "Un justificatif photo nécessite un canal de groupe. Choisissez-en un dans l'éditeur de la tâche, page Personnel.",
    setPunchInCode: "Définir le code de pointage", addTrainingDay: "Ajouter un jour de formation", updateTrainingDay: "Modifier le jour de formation",
    deleteTrainingDay: "Supprimer le jour de formation", addTrainingObjective: "Ajouter un objectif", updateTrainingObjective: "Modifier l'objectif",
    deleteTrainingObjective: "Supprimer l'objectif",
    memberId: "Membre", dayId: "Jour de formation", dayNumber: "Jour", objectiveId: "Objectif", text: "Texte", orgName: "Nom du magasin",
  }),
  es: strings({
    unknown: "No encontrado", unknownRole: "Puesto desconocido", unknownTask: "Tarea desconocida", day: "Día {n}",
    notAdded: "No agregado", cancelled: "Cancelado",
    addWithoutEvidence: "Agregar sin evidencia", createChannel: "Crear un canal de grupo",
    done: "Hecho: {action}", doneWithTarget: "Hecho: {action} · {target}",
    orderEmailed: "Pedido enviado por correo al proveedor", orderDraft: "Pedido guardado como borrador; se avisó al gerente",
    failed: "La acción falló: {reason}",
    unknownAction: "Mr. Merchiva pidió una acción que esta aplicación no tiene.",
    targetMissing: "No se encontró el registro de esta acción; puede que se haya cambiado o eliminado.",
    evidenceNeedsChannel: "La prueba con foto necesita un canal de grupo. Elige uno en el editor de la tarea, en la página de Personal.",
    setPunchInCode: "Definir código de fichaje", addTrainingDay: "Añadir día de formación", updateTrainingDay: "Editar día de formación",
    deleteTrainingDay: "Eliminar día de formación", addTrainingObjective: "Añadir objetivo", updateTrainingObjective: "Editar objetivo",
    deleteTrainingObjective: "Eliminar objetivo",
    memberId: "Miembro", dayId: "Día de formación", dayNumber: "Día", objectiveId: "Objetivo", text: "Texto", orgName: "Nombre de la tienda",
  }),
  hi: strings({
    unknown: "नहीं मिला", unknownRole: "अज्ञात भूमिका", unknownTask: "अज्ञात कार्य", day: "दिन {n}",
    notAdded: "नहीं जोड़ा गया", cancelled: "रद्द किया गया",
    addWithoutEvidence: "साक्ष्य के बिना जोड़ें", createChannel: "ग्रुप चैनल बनाएँ",
    done: "पूरा हुआ: {action}", doneWithTarget: "पूरा हुआ: {action} · {target}",
    orderEmailed: "ऑर्डर सप्लायर को ईमेल किया गया", orderDraft: "ऑर्डर ड्राफ्ट के रूप में सहेजा गया — मैनेजर को सूचित किया गया",
    failed: "कार्रवाई विफल: {reason}",
    unknownAction: "Mr. Merchiva ने ऐसी कार्रवाई माँगी जो इस ऐप में नहीं है।",
    targetMissing: "यह कार्रवाई जिस रिकॉर्ड के लिए है, वह नहीं मिला — हो सकता है वह बदला या हटाया गया हो।",
    evidenceNeedsChannel: "फ़ोटो साक्ष्य के लिए एक ग्रुप चैनल चाहिए। स्टाफ़ पेज पर कार्य के संपादक में एक चुनें।",
    setPunchInCode: "पंच-इन कोड सेट करें", addTrainingDay: "प्रशिक्षण दिन जोड़ें", updateTrainingDay: "प्रशिक्षण दिन संपादित करें",
    deleteTrainingDay: "प्रशिक्षण दिन हटाएँ", addTrainingObjective: "उद्देश्य जोड़ें", updateTrainingObjective: "उद्देश्य संपादित करें",
    deleteTrainingObjective: "उद्देश्य हटाएँ",
    memberId: "सदस्य", dayId: "प्रशिक्षण दिन", dayNumber: "दिन", objectiveId: "उद्देश्य", text: "पाठ", orgName: "स्टोर का नाम",
  }),
  ar: strings({
    unknown: "غير موجود", unknownRole: "دور غير معروف", unknownTask: "مهمة غير معروفة", day: "اليوم {n}",
    notAdded: "لم تتم الإضافة", cancelled: "أُلغي",
    addWithoutEvidence: "إضافة بدون أدلة", createChannel: "إنشاء قناة جماعية",
    done: "تم: {action}", doneWithTarget: "تم: {action} · {target}",
    orderEmailed: "أُرسل الطلب إلى المورّد بالبريد الإلكتروني", orderDraft: "حُفظ الطلب كمسودة — تم إخطار المدير",
    failed: "فشل الإجراء: {reason}",
    unknownAction: "طلب السيد ميرشيفا إجراءً غير موجود في هذا التطبيق.",
    targetMissing: "تعذّر العثور على ما يخصه هذا الإجراء — ربما تم تغييره أو حذفه.",
    evidenceNeedsChannel: "يتطلب الإثبات بالصور قناة جماعية. اختر واحدة من محرر المهمة في صفحة الموظفين.",
    setPunchInCode: "تعيين رمز تسجيل الحضور", addTrainingDay: "إضافة يوم تدريب", updateTrainingDay: "تعديل يوم التدريب",
    deleteTrainingDay: "حذف يوم التدريب", addTrainingObjective: "إضافة هدف", updateTrainingObjective: "تعديل الهدف",
    deleteTrainingObjective: "حذف الهدف",
    memberId: "العضو", dayId: "يوم التدريب", dayNumber: "اليوم", objectiveId: "الهدف", text: "النص", orgName: "اسم المتجر",
  }),
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

// Exactly the leaves this script writes: the subtrees they sit in are shared.
const OWNED: ReadonlySet<string> = new Set(flatten(DICT.en).map(([k]) => k));

function setLeaf(root: Record<string, unknown>, path: string, value: string): void {
  if (!OWNED.has(path)) throw new Error(`${path} is not a leaf this script owns`);
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
