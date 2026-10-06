// Merges the plugin store strings into all 8 locale files: the new `device.pluginStore.*` subtree, and the
// existing "Device apps" / App Store copy renamed to Plugins (nav, page title, toasts, buttons). Read by
// components/device/plugin-store (/manager/apps).
// Run: bun scripts/i18n/plugin-store.ts
// Leaf-scoped and idempotent: never deletes keys, only writes the paths in OWNED, and leaves a locale file
// untouched when nothing changed. zh-tw / zh-hk are converted from zh-cn leaf by leaf with opencc-js, plus the
// local terms below (never run scripts/gen-traditional-zh.ts: it rewrites both files wholesale and would erase
// other sessions' edits).
import { readFileSync, writeFileSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import * as OpenCC from "opencc-js";
import { applyTaiwanTerms, type TermRule } from "./tw-terms";

type Tree = { [key: string]: string | Tree };
type HandLocale = "en" | "zh-cn" | "fr" | "es" | "hi" | "ar";

/** The new subtree, plus the exact existing leaves whose values are renamed. */
const OWNED: readonly string[] = [
  "device.pluginStore",
  "nav.apps",
  "deviceApps.title",
  "deviceApps.subtitle",
  "deviceApps.openStore",
  "device.appStore.hint",
  "device.appStore.available",
  "device.appStore.included",
  "device.appStore.add",
  "device.appStore.added",
  "device.appStore.removed",
  "device.appStore.empty",
];

interface Renamed {
  nav: string; title: string; subtitle: string; openStore: string;
  hint: string; available: string; included: string; add: string; added: string; removed: string; empty: string;
}

interface Store {
  searchPlaceholder: string; clearSearch: string; tabDiscover: string; tabInstalled: string; featured: string;
  categoriesLabel: string; all: string;
  categories: { team: string; operations: string; sales: string; files: string; essentials: string };
  resultsCount: string; noResults: string; noResultsHint: string; open: string; installed: string; back: string;
  category: string; runsOn: string; whoCanUse: string; everyone: string; managersOnly: string; needsAccess: string;
  builtInNote: string; preview: string; about: string; addedByStore: string; noneInstalled: string; browse: string;
}

function strings(r: Renamed, store: Store): Tree {
  return {
    nav: { apps: r.nav },
    deviceApps: { title: r.title, subtitle: r.subtitle, openStore: r.openStore },
    device: {
      appStore: { hint: r.hint, available: r.available, included: r.included, add: r.add, added: r.added, removed: r.removed, empty: r.empty },
      pluginStore: { ...store, categories: { ...store.categories } },
    },
  };
}

const DICT: Record<HandLocale, Tree> = {
  en: strings(
    {
      nav: "Plugins", title: "Plugins", subtitle: "{n} of {total} optional plugins installed", openStore: "Turn it on in Plugins",
      hint: "Pick which features this store uses. An installed plugin shows up in the manager back office, on the store tablet and on staff phones; built-in plugins are always on.",
      available: "Available plugins", included: "Built into every device", add: "Install", added: "Plugin installed",
      removed: "Plugin removed", empty: "Nothing else to install.",
    },
    {
      searchPlaceholder: "Search plugins", clearSearch: "Clear search", tabDiscover: "Discover", tabInstalled: "Installed",
      featured: "Featured", categoriesLabel: "Categories", all: "All",
      categories: { team: "Team", operations: "Operations", sales: "Sales & reports", files: "Files & documents", essentials: "Essentials" },
      resultsCount: "{n} results", noResults: "No plugins match “{q}”", noResultsHint: "Try another word, or browse the categories.",
      open: "Open", installed: "Installed", back: "All plugins", category: "Category", runsOn: "Runs on",
      whoCanUse: "Who can use it", everyone: "Everyone", managersOnly: "Owners and managers", needsAccess: "{section} access",
      builtInNote: "Built into every device. It can't be removed.", preview: "Preview", about: "About this plugin",
      addedByStore: "Installed by your store", noneInstalled: "No optional plugins installed yet.", browse: "Browse plugins",
    },
  ),
  "zh-cn": strings(
    {
      nav: "插件", title: "插件", subtitle: "已安装 {n} / {total} 个可选插件", openStore: "去插件里开启",
      hint: "选择这家店使用哪些功能。安装后的插件会同时出现在后台、门店平板和员工手机上；内置插件始终开启。",
      available: "可安装的插件", included: "每台设备都内置", add: "安装", added: "插件已安装",
      removed: "插件已移除", empty: "没有更多可安装的插件。",
    },
    {
      searchPlaceholder: "搜索插件", clearSearch: "清除搜索", tabDiscover: "发现", tabInstalled: "已安装",
      featured: "精选", categoriesLabel: "分类", all: "全部",
      categories: { team: "团队", operations: "门店运营", sales: "销售与报表", files: "文件与文档", essentials: "基础功能" },
      resultsCount: "{n} 个结果", noResults: "没有找到与“{q}”相关的插件", noResultsHint: "换个词试试，或者按分类浏览。",
      open: "打开", installed: "已安装", back: "全部插件", category: "分类", runsOn: "适用于",
      whoCanUse: "谁可以使用", everyone: "所有人", managersOnly: "店主和经理", needsAccess: "需要{section}权限",
      builtInNote: "每台设备都内置，无法移除。", preview: "预览", about: "关于此插件",
      addedByStore: "本店已安装", noneInstalled: "还没有安装可选插件。", browse: "浏览插件",
    },
  ),
  fr: strings(
    {
      nav: "Extensions", title: "Extensions", subtitle: "{n} extensions facultatives installées sur {total}", openStore: "Activez-la dans Extensions",
      hint: "Choisissez les fonctions utilisées par ce magasin. Une extension installée apparaît dans le back-office, sur la tablette du magasin et sur les téléphones de l'équipe ; les extensions intégrées sont toujours actives.",
      available: "Extensions disponibles", included: "Intégrées à chaque appareil", add: "Installer", added: "Extension installée",
      removed: "Extension retirée", empty: "Rien d'autre à installer.",
    },
    {
      searchPlaceholder: "Rechercher des extensions", clearSearch: "Effacer la recherche", tabDiscover: "Découvrir", tabInstalled: "Installées",
      featured: "À la une", categoriesLabel: "Catégories", all: "Toutes",
      categories: { team: "Équipe", operations: "Opérations", sales: "Ventes et rapports", files: "Fichiers et documents", essentials: "Essentiels" },
      resultsCount: "{n} résultats", noResults: "Aucune extension ne correspond à « {q} »", noResultsHint: "Essayez un autre mot ou parcourez les catégories.",
      open: "Ouvrir", installed: "Installée", back: "Toutes les extensions", category: "Catégorie", runsOn: "Fonctionne sur",
      whoCanUse: "Qui peut l'utiliser", everyone: "Tout le monde", managersOnly: "Propriétaires et gérants", needsAccess: "Accès {section}",
      builtInNote: "Intégrée à chaque appareil. Elle ne peut pas être retirée.", preview: "Aperçu", about: "À propos de cette extension",
      addedByStore: "Installées par votre magasin", noneInstalled: "Aucune extension facultative installée pour l'instant.", browse: "Parcourir les extensions",
    },
  ),
  es: strings(
    {
      nav: "Complementos", title: "Complementos", subtitle: "{n} de {total} complementos opcionales instalados", openStore: "Actívalo en Complementos",
      hint: "Elige qué funciones usa esta tienda. Un complemento instalado aparece en el panel de gestión, en la tableta de la tienda y en los teléfonos del personal; los complementos integrados están siempre activos.",
      available: "Complementos disponibles", included: "Integrados en todos los dispositivos", add: "Instalar", added: "Complemento instalado",
      removed: "Complemento eliminado", empty: "No hay nada más que instalar.",
    },
    {
      searchPlaceholder: "Buscar complementos", clearSearch: "Borrar búsqueda", tabDiscover: "Descubrir", tabInstalled: "Instalados",
      featured: "Destacados", categoriesLabel: "Categorías", all: "Todos",
      categories: { team: "Equipo", operations: "Operaciones", sales: "Ventas e informes", files: "Archivos y documentos", essentials: "Esenciales" },
      resultsCount: "{n} resultados", noResults: "Ningún complemento coincide con «{q}»", noResultsHint: "Prueba con otra palabra o explora las categorías.",
      open: "Abrir", installed: "Instalado", back: "Todos los complementos", category: "Categoría", runsOn: "Funciona en",
      whoCanUse: "Quién puede usarlo", everyone: "Todos", managersOnly: "Propietarios y gerentes", needsAccess: "Acceso a {section}",
      builtInNote: "Integrado en todos los dispositivos. No se puede eliminar.", preview: "Vista previa", about: "Acerca de este complemento",
      addedByStore: "Instalados por tu tienda", noneInstalled: "Todavía no hay complementos opcionales instalados.", browse: "Explorar complementos",
    },
  ),
  hi: strings(
    {
      nav: "प्लगइन", title: "प्लगइन", subtitle: "{total} में से {n} वैकल्पिक प्लगइन इंस्टॉल हैं", openStore: "इसे प्लगइन में चालू करें",
      hint: "चुनें कि यह स्टोर कौन-सी सुविधाएँ इस्तेमाल करे। इंस्टॉल किया गया प्लगइन मैनेजर बैक ऑफ़िस, स्टोर टैबलेट और स्टाफ़ फ़ोन पर दिखता है; बिल्ट-इन प्लगइन हमेशा चालू रहते हैं।",
      available: "उपलब्ध प्लगइन", included: "हर डिवाइस में बिल्ट-इन", add: "इंस्टॉल करें", added: "प्लगइन इंस्टॉल हो गया",
      removed: "प्लगइन हटा दिया गया", empty: "इंस्टॉल करने के लिए और कुछ नहीं है।",
    },
    {
      searchPlaceholder: "प्लगइन खोजें", clearSearch: "खोज साफ़ करें", tabDiscover: "एक्सप्लोर करें", tabInstalled: "इंस्टॉल किए गए",
      featured: "चुनिंदा", categoriesLabel: "श्रेणियाँ", all: "सभी",
      categories: { team: "टीम", operations: "संचालन", sales: "बिक्री और रिपोर्ट", files: "फ़ाइलें और दस्तावेज़", essentials: "ज़रूरी" },
      resultsCount: "{n} परिणाम", noResults: "“{q}” से कोई प्लगइन मेल नहीं खाता", noResultsHint: "कोई दूसरा शब्द आज़माएँ या श्रेणियाँ देखें।",
      open: "खोलें", installed: "इंस्टॉल है", back: "सभी प्लगइन", category: "श्रेणी", runsOn: "कहाँ चलता है",
      whoCanUse: "कौन इस्तेमाल कर सकता है", everyone: "सभी", managersOnly: "मालिक और मैनेजर", needsAccess: "{section} की पहुँच",
      builtInNote: "हर डिवाइस में बिल्ट-इन है। इसे हटाया नहीं जा सकता।", preview: "झलक", about: "इस प्लगइन के बारे में",
      addedByStore: "आपके स्टोर ने इंस्टॉल किए", noneInstalled: "अभी तक कोई वैकल्पिक प्लगइन इंस्टॉल नहीं है।", browse: "प्लगइन देखें",
    },
  ),
  ar: strings(
    {
      nav: "الإضافات", title: "الإضافات", subtitle: "{n} من {total} إضافات اختيارية مثبّتة", openStore: "فعّلها من الإضافات",
      hint: "اختر الميزات التي يستخدمها هذا المتجر. تظهر الإضافة المثبّتة في لوحة الإدارة وعلى جهاز المتجر اللوحي وهواتف الموظفين؛ والإضافات المدمجة مفعّلة دائمًا.",
      available: "الإضافات المتاحة", included: "مدمجة في كل جهاز", add: "تثبيت", added: "تم تثبيت الإضافة",
      removed: "تمت إزالة الإضافة", empty: "لا يوجد شيء آخر لتثبيته.",
    },
    {
      searchPlaceholder: "ابحث عن الإضافات", clearSearch: "مسح البحث", tabDiscover: "استكشاف", tabInstalled: "المثبّتة",
      featured: "مميّزة", categoriesLabel: "الفئات", all: "الكل",
      categories: { team: "الفريق", operations: "العمليات", sales: "المبيعات والتقارير", files: "الملفات والمستندات", essentials: "الأساسيات" },
      resultsCount: "{n} نتيجة", noResults: "لا توجد إضافات تطابق «{q}»", noResultsHint: "جرّب كلمة أخرى أو تصفّح الفئات.",
      open: "فتح", installed: "مثبّتة", back: "كل الإضافات", category: "الفئة", runsOn: "تعمل على",
      whoCanUse: "من يمكنه استخدامها", everyone: "الجميع", managersOnly: "المالكون والمديرون", needsAccess: "صلاحية {section}",
      builtInNote: "مدمجة في كل جهاز ولا يمكن إزالتها.", preview: "معاينة", about: "حول هذه الإضافة",
      addedByStore: "ثبّتها متجرك", noneInstalled: "لم يتم تثبيت أي إضافات اختيارية بعد.", browse: "تصفّح الإضافات",
    },
  ),
};

/** Taiwan wording the existing zh-tw device copy uses (門市, 後台, 一律開啟), applied before TW_TERMS. */
const TW_EXTRA: ReadonlyArray<TermRule> = [
  [/門店/g, "門市"],
  [/後臺/g, "後台"],
  [/每臺/g, "每台"],
  [/始終開啟/g, "一律開啟"],
  [/運營/g, "營運"],
  [/“\{q\}”/g, "「{q}」"],
];

/** Hong Kong wording the existing zh-hk device copy uses (分店, 裝置, 開啟). */
const HK_EXTRA: ReadonlyArray<TermRule> = [
  [/門店/g, "分店"],
  [/設備/g, "裝置"],
  [/開啓/g, "開啟"],
  [/始終開啟/g, "一律開啟"],
  [/“\{q\}”/g, "「{q}」"],
];

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

function applyRules(text: string, rules: ReadonlyArray<TermRule>): string {
  return rules.reduce((out, [from, to]) => out.replace(from, to), text);
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
if (mergeInto("zh-tw", zh.map(([k, v]): [string, string] => [k, applyTaiwanTerms(toTW(v), TW_EXTRA)]))) changed.push("zh-tw");
if (mergeInto("zh-hk", zh.map(([k, v]): [string, string] => [k, applyRules(toHK(v), HK_EXTRA)]))) changed.push("zh-hk");
console.log(`merged ${zh.length} keys into 8 locales; changed: ${changed.length > 0 ? changed.join(", ") : "none"}`);
