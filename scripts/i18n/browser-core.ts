// Merges the browser-shell core i18n keys (`nav.docs`, `browser.*`) into all 8 locale files.
// Run: bun scripts/i18n/browser-core.ts
// Leaf-scoped and idempotent: never deletes keys, only writes the subtrees in OWNED, and
// leaves a locale file untouched when nothing changed. zh-tw / zh-hk are converted from
// zh-cn leaf by leaf with opencc-js (never run scripts/gen-traditional-zh.ts: it rewrites
// both files wholesale and would erase other sessions' edits).
import { readFileSync, writeFileSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import * as OpenCC from "opencc-js";
import { applyTaiwanTerms } from "./tw-terms";

type Tree = { [key: string]: string | Tree };
type HandLocale = "en" | "zh-cn" | "fr" | "es" | "hi" | "ar";

const OWNED: readonly string[] = ["browser", "nav.docs"];

const DICT: Record<HandLocale, Tree> = {
  en: {
    nav: { docs: "Docs" },
    browser: {
      newTab: "New Tab",
      untitled: "Untitled",
      tabLimit: "Tab limit reached. Close a tab to open another.",
      actions: {
        newTab: "New tab",
        closeTab: "Close tab",
        closeOtherTabs: "Close other tabs",
        closeTabsToRight: "Close tabs to the right",
        duplicateTab: "Duplicate",
        pinTab: "Pin",
        unpinTab: "Unpin",
        reopenClosedTab: "Reopen closed tab",
        back: "Back",
        forward: "Forward",
        reload: "Reload",
        home: "Home",
      },
      newTabPage: {
        searchPlaceholder: "Search pages, documents and tabs",
        searchLabel: "Search",
        apps: "Apps",
        openTabs: "Open tabs",
        switchToTab: "Switch to tab",
        pages: "Pages",
        documents: "Documents",
        goTo: "Go to {url}",
        recentDocuments: "Recent documents",
        allDocuments: "All documents",
        noRecentDocuments: "No documents yet",
        documentsUnavailable: "Documents aren't available yet.",
        createDocumentFailed: "Couldn't create the document. Try again.",
        recentlyClosed: "Recently closed",
        reopen: "Reopen",
        noResults: "No matches",
        newDocument: "New document",
      },
      routes: {
        subscribe: "Subscription",
        billing: "Billing",
        dashboard: "Dashboard",
      },
    },
  },
  "zh-cn": {
    nav: { docs: "文档" },
    browser: {
      newTab: "新标签页",
      untitled: "无标题",
      tabLimit: "标签页已达上限，请先关闭一个标签页。",
      actions: {
        newTab: "新建标签页",
        closeTab: "关闭标签页",
        closeOtherTabs: "关闭其他标签页",
        closeTabsToRight: "关闭右侧标签页",
        duplicateTab: "复制标签页",
        pinTab: "固定",
        unpinTab: "取消固定",
        reopenClosedTab: "重新打开关闭的标签页",
        back: "后退",
        forward: "前进",
        reload: "重新加载",
        home: "主页",
      },
      newTabPage: {
        searchPlaceholder: "搜索页面、文档和标签页",
        searchLabel: "搜索",
        apps: "应用",
        openTabs: "已打开的标签页",
        switchToTab: "切换到标签页",
        pages: "页面",
        documents: "文档",
        goTo: "前往 {url}",
        recentDocuments: "最近的文档",
        allDocuments: "全部文档",
        noRecentDocuments: "暂无文档",
        documentsUnavailable: "文档功能暂不可用。",
        createDocumentFailed: "无法创建文档，请重试。",
        recentlyClosed: "最近关闭",
        reopen: "重新打开",
        noResults: "无匹配结果",
        newDocument: "新建文档",
      },
      routes: {
        subscribe: "订阅",
        billing: "账单",
        dashboard: "仪表盘",
      },
    },
  },
  fr: {
    nav: { docs: "Documents" },
    browser: {
      newTab: "Nouvel onglet",
      untitled: "Sans titre",
      tabLimit: "Nombre maximal d’onglets atteint. Fermez un onglet pour en ouvrir un autre.",
      actions: {
        newTab: "Nouvel onglet",
        closeTab: "Fermer l’onglet",
        closeOtherTabs: "Fermer les autres onglets",
        closeTabsToRight: "Fermer les onglets à droite",
        duplicateTab: "Dupliquer",
        pinTab: "Épingler",
        unpinTab: "Détacher",
        reopenClosedTab: "Rouvrir l’onglet fermé",
        back: "Précédent",
        forward: "Suivant",
        reload: "Actualiser",
        home: "Accueil",
      },
      newTabPage: {
        searchPlaceholder: "Rechercher des pages, des documents et des onglets",
        searchLabel: "Rechercher",
        apps: "Applications",
        openTabs: "Onglets ouverts",
        switchToTab: "Passer à l’onglet",
        pages: "Pages",
        documents: "Documents",
        goTo: "Aller à {url}",
        recentDocuments: "Documents récents",
        allDocuments: "Tous les documents",
        noRecentDocuments: "Aucun document pour le moment",
        documentsUnavailable: "Les documents ne sont pas encore disponibles.",
        createDocumentFailed: "Impossible de créer le document. Réessayez.",
        recentlyClosed: "Fermés récemment",
        reopen: "Rouvrir",
        noResults: "Aucun résultat",
        newDocument: "Nouveau document",
      },
      routes: {
        subscribe: "Abonnement",
        billing: "Facturation",
        dashboard: "Tableau de bord",
      },
    },
  },
  es: {
    nav: { docs: "Documentos" },
    browser: {
      newTab: "Nueva pestaña",
      untitled: "Sin título",
      tabLimit: "Has alcanzado el límite de pestañas. Cierra una para abrir otra.",
      actions: {
        newTab: "Nueva pestaña",
        closeTab: "Cerrar pestaña",
        closeOtherTabs: "Cerrar las demás pestañas",
        closeTabsToRight: "Cerrar pestañas a la derecha",
        duplicateTab: "Duplicar",
        pinTab: "Fijar",
        unpinTab: "Dejar de fijar",
        reopenClosedTab: "Volver a abrir la pestaña cerrada",
        back: "Atrás",
        forward: "Adelante",
        reload: "Volver a cargar",
        home: "Inicio",
      },
      newTabPage: {
        searchPlaceholder: "Buscar páginas, documentos y pestañas",
        searchLabel: "Buscar",
        apps: "Aplicaciones",
        openTabs: "Pestañas abiertas",
        switchToTab: "Cambiar a la pestaña",
        pages: "Páginas",
        documents: "Documentos",
        goTo: "Ir a {url}",
        recentDocuments: "Documentos recientes",
        allDocuments: "Todos los documentos",
        noRecentDocuments: "Todavía no hay documentos",
        documentsUnavailable: "Los documentos aún no están disponibles.",
        createDocumentFailed: "No se pudo crear el documento. Inténtalo de nuevo.",
        recentlyClosed: "Cerradas recientemente",
        reopen: "Volver a abrir",
        noResults: "Sin coincidencias",
        newDocument: "Nuevo documento",
      },
      routes: {
        subscribe: "Suscripción",
        billing: "Facturación",
        dashboard: "Panel de control",
      },
    },
  },
  hi: {
    nav: { docs: "दस्तावेज़" },
    browser: {
      newTab: "नया टैब",
      untitled: "शीर्षकहीन",
      tabLimit: "टैब की सीमा पूरी हो गई। नया टैब खोलने के लिए कोई टैब बंद करें।",
      actions: {
        newTab: "नया टैब",
        closeTab: "टैब बंद करें",
        closeOtherTabs: "अन्य टैब बंद करें",
        closeTabsToRight: "दाईं ओर के टैब बंद करें",
        duplicateTab: "डुप्लिकेट करें",
        pinTab: "पिन करें",
        unpinTab: "अनपिन करें",
        reopenClosedTab: "बंद किया गया टैब फिर से खोलें",
        back: "पीछे",
        forward: "आगे",
        reload: "फिर से लोड करें",
        home: "होम",
      },
      newTabPage: {
        searchPlaceholder: "पेज, दस्तावेज़ और टैब खोजें",
        searchLabel: "खोजें",
        apps: "ऐप्स",
        openTabs: "खुले टैब",
        switchToTab: "टैब पर जाएँ",
        pages: "पेज",
        documents: "दस्तावेज़",
        goTo: "{url} पर जाएँ",
        recentDocuments: "हाल के दस्तावेज़",
        allDocuments: "सभी दस्तावेज़",
        noRecentDocuments: "अभी तक कोई दस्तावेज़ नहीं",
        documentsUnavailable: "दस्तावेज़ अभी उपलब्ध नहीं हैं।",
        createDocumentFailed: "दस्तावेज़ नहीं बनाया जा सका। फिर से कोशिश करें।",
        recentlyClosed: "हाल ही में बंद किए गए",
        reopen: "फिर से खोलें",
        noResults: "कोई मिलान नहीं",
        newDocument: "नया दस्तावेज़",
      },
      routes: {
        subscribe: "सदस्यता",
        billing: "बिलिंग",
        dashboard: "डैशबोर्ड",
      },
    },
  },
  ar: {
    nav: { docs: "المستندات" },
    browser: {
      newTab: "علامة تبويب جديدة",
      untitled: "بلا عنوان",
      tabLimit: "تم بلوغ الحد الأقصى لعلامات التبويب. أغلق علامة تبويب لفتح أخرى.",
      actions: {
        newTab: "علامة تبويب جديدة",
        closeTab: "إغلاق علامة التبويب",
        closeOtherTabs: "إغلاق علامات التبويب الأخرى",
        // Neutral wording: in RTL the following tabs sit to the left.
        closeTabsToRight: "إغلاق علامات التبويب التالية",
        duplicateTab: "تكرار",
        pinTab: "تثبيت",
        unpinTab: "إلغاء التثبيت",
        reopenClosedTab: "إعادة فتح علامة التبويب المغلقة",
        back: "رجوع",
        forward: "تقدّم",
        reload: "إعادة التحميل",
        home: "الرئيسية",
      },
      newTabPage: {
        searchPlaceholder: "ابحث في الصفحات والمستندات وعلامات التبويب",
        searchLabel: "بحث",
        apps: "التطبيقات",
        openTabs: "علامات التبويب المفتوحة",
        switchToTab: "الانتقال إلى علامة التبويب",
        pages: "الصفحات",
        documents: "المستندات",
        goTo: "الانتقال إلى {url}",
        recentDocuments: "المستندات الأخيرة",
        allDocuments: "كل المستندات",
        noRecentDocuments: "لا توجد مستندات بعد",
        documentsUnavailable: "المستندات غير متاحة بعد.",
        createDocumentFailed: "تعذّر إنشاء المستند. حاول مرة أخرى.",
        recentlyClosed: "المغلقة مؤخرًا",
        reopen: "إعادة الفتح",
        noResults: "لا توجد نتائج مطابقة",
        newDocument: "مستند جديد",
      },
      routes: {
        subscribe: "الاشتراك",
        billing: "الفوترة",
        dashboard: "لوحة المعلومات",
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
    if (text === original) return false;                     // already merged: don't touch the file
    if (statSync(file).mtimeMs !== mtime) continue;           // another writer: redo from a fresh read
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
