// Merges the mobile browser chrome i18n keys (`browserMobile.*`) into all 8 locale files.
// Run: bun scripts/i18n/browser-mobile.ts
// Leaf-scoped and idempotent (plan §B8.2): never deletes keys, only writes the subtree in OWNED,
// and leaves a locale file untouched when nothing changed. zh-tw / zh-hk are converted from
// zh-cn leaf by leaf with opencc-js (never run scripts/gen-traditional-zh.ts: it rewrites both
// files wholesale and would erase other sessions' edits).
import { readFileSync, writeFileSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import * as OpenCC from "opencc-js";
import { applyTaiwanTerms } from "./tw-terms";

type Tree = { [key: string]: string | Tree };
type HandLocale = "en" | "zh-cn" | "fr" | "es" | "hi" | "ar";

const OWNED: readonly string[] = ["browserMobile"];

const DICT: Record<HandLocale, Tree> = {
  en: {
    browserMobile: {
      address: "Address",
      addressButton: "{title}. Search or enter a page",
      addToFavorites: "Add to favorites",
      app: "App",
      apps: "Apps",
      backHistory: "Back history",
      bookmarks: "Bookmarks",
      chromeLabel: "Browser controls",
      clearHistory: "Clear history",
      closeAllAction: "Close all {n} tabs",
      closeAllConfirm: "Close all {n} tabs?",
      closeAllDescription: "You can reopen closed tabs from the tabs menu.",
      closeTabNamed: "Close {title}",
      copyFailed: "Couldn't copy link",
      copyLink: "Copy link",
      done: "Done",
      favoriteAdded: "Added to favorites",
      favoriteRemoved: "Removed from favorites",
      favorites: "Favorites",
      forwardHistory: "Forward history",
      history: "History",
      invalidAddress: "Not a Merchiva page",
      linkCopied: "Link copied",
      mode: "Mode",
      noApps: "No apps available",
      noFavorites: "No favorites yet",
      noFavoritesDescription: "Use Add to favorites in the page menu to keep pages here.",
      noHistory: "No history yet",
      noResults: "No results",
      openInBrowser: "Open in browser",
      openInBrowserFailed: "Couldn't open the browser",
      openInNewTabNamed: "Open {title} in a new tab",
      openTabs: "Open tabs",
      pageMenu: "Page menu",
      pageMenuUnread: "Page menu, {n} unread notifications",
      recentDocuments: "Recent documents",
      reloadApp: "Reload app",
      removeFavoriteNamed: "Remove {title} from favorites",
      removeFromFavorites: "Remove from favorites",
      searchLabel: "Search",
      searchPlaceholder: "Search or enter page",
      share: "Share",
      showSectionPages: "Show {title} pages",
      showToolbar: "Show toolbar",
      store: "Store",
      suggestions: "Suggestions",
      switchToTab: "Switch to tab",
      tabOverview: "Tab overview",
      tabsButton: "Tabs, {n} open",
      tabsCount: "{n} Tabs",
      thisPage: "This page",
      today: "Today",
      yesterday: "Yesterday",
    },
  },
  "zh-cn": {
    browserMobile: {
      address: "地址",
      addressButton: "{title}。搜索或输入页面",
      addToFavorites: "添加到收藏",
      app: "应用",
      apps: "应用",
      backHistory: "后退历史",
      bookmarks: "书签",
      chromeLabel: "浏览器控件",
      clearHistory: "清除历史记录",
      closeAllAction: "关闭全部 {n} 个标签页",
      closeAllConfirm: "关闭全部 {n} 个标签页？",
      closeAllDescription: "关闭的标签页可以从标签页菜单中重新打开。",
      closeTabNamed: "关闭“{title}”",
      copyFailed: "无法复制链接",
      copyLink: "复制链接",
      done: "完成",
      favoriteAdded: "已添加到收藏",
      favoriteRemoved: "已从收藏中移除",
      favorites: "收藏",
      forwardHistory: "前进历史",
      history: "历史记录",
      invalidAddress: "不是 Merchiva 页面",
      linkCopied: "链接已复制",
      mode: "模式",
      noApps: "没有可用的应用",
      noFavorites: "暂无收藏",
      noFavoritesDescription: "在页面菜单中选择“添加到收藏”，即可把页面保存在这里。",
      noHistory: "暂无历史记录",
      noResults: "无结果",
      openInBrowser: "在浏览器中打开",
      openInBrowserFailed: "无法打开浏览器",
      openInNewTabNamed: "在新标签页中打开“{title}”",
      openTabs: "已打开的标签页",
      pageMenu: "页面菜单",
      pageMenuUnread: "页面菜单，{n} 条未读通知",
      recentDocuments: "最近的文档",
      reloadApp: "重新加载应用",
      removeFavoriteNamed: "从收藏中移除“{title}”",
      removeFromFavorites: "从收藏中移除",
      searchLabel: "搜索",
      searchPlaceholder: "搜索或输入页面",
      share: "分享",
      showSectionPages: "显示“{title}”的页面",
      showToolbar: "显示工具栏",
      store: "门店",
      suggestions: "建议",
      switchToTab: "切换到标签页",
      tabOverview: "标签页概览",
      tabsButton: "标签页，已打开 {n} 个",
      tabsCount: "{n} 个标签页",
      thisPage: "当前页面",
      today: "今天",
      yesterday: "昨天",
    },
  },
  fr: {
    browserMobile: {
      address: "Adresse",
      addressButton: "{title}. Rechercher ou saisir une page",
      addToFavorites: "Ajouter aux favoris",
      app: "Application",
      apps: "Applications",
      backHistory: "Historique précédent",
      bookmarks: "Signets",
      chromeLabel: "Commandes du navigateur",
      clearHistory: "Effacer l’historique",
      closeAllAction: "Fermer les {n} onglets",
      closeAllConfirm: "Fermer les {n} onglets ?",
      closeAllDescription: "Vous pourrez rouvrir les onglets fermés depuis le menu des onglets.",
      closeTabNamed: "Fermer {title}",
      copyFailed: "Impossible de copier le lien",
      copyLink: "Copier le lien",
      done: "OK",
      favoriteAdded: "Ajouté aux favoris",
      favoriteRemoved: "Retiré des favoris",
      favorites: "Favoris",
      forwardHistory: "Historique suivant",
      history: "Historique",
      invalidAddress: "Ce n’est pas une page Merchiva",
      linkCopied: "Lien copié",
      mode: "Mode",
      noApps: "Aucune application disponible",
      noFavorites: "Aucun favori pour l’instant",
      noFavoritesDescription: "Utilisez « Ajouter aux favoris » dans le menu de la page pour retrouver vos pages ici.",
      noHistory: "Aucun historique pour l’instant",
      noResults: "Aucun résultat",
      openInBrowser: "Ouvrir dans le navigateur",
      openInBrowserFailed: "Impossible d’ouvrir le navigateur",
      openInNewTabNamed: "Ouvrir {title} dans un nouvel onglet",
      openTabs: "Onglets ouverts",
      pageMenu: "Menu de la page",
      pageMenuUnread: "Menu de la page, {n} notifications non lues",
      recentDocuments: "Documents récents",
      reloadApp: "Recharger l’application",
      removeFavoriteNamed: "Retirer {title} des favoris",
      removeFromFavorites: "Retirer des favoris",
      searchLabel: "Recherche",
      searchPlaceholder: "Rechercher ou saisir une page",
      share: "Partager",
      showSectionPages: "Afficher les pages de {title}",
      showToolbar: "Afficher la barre d’outils",
      store: "Magasin",
      suggestions: "Suggestions",
      switchToTab: "Aller à l’onglet",
      tabOverview: "Vue des onglets",
      tabsButton: "Onglets, {n} ouverts",
      tabsCount: "{n} onglets",
      thisPage: "Cette page",
      today: "Aujourd’hui",
      yesterday: "Hier",
    },
  },
  es: {
    browserMobile: {
      address: "Dirección",
      addressButton: "{title}. Buscar o introducir una página",
      addToFavorites: "Añadir a favoritos",
      app: "Aplicación",
      apps: "Aplicaciones",
      backHistory: "Historial anterior",
      bookmarks: "Marcadores",
      chromeLabel: "Controles del navegador",
      clearHistory: "Borrar historial",
      closeAllAction: "Cerrar las {n} pestañas",
      closeAllConfirm: "¿Cerrar las {n} pestañas?",
      closeAllDescription: "Puedes volver a abrir las pestañas cerradas desde el menú de pestañas.",
      closeTabNamed: "Cerrar {title}",
      copyFailed: "No se pudo copiar el enlace",
      copyLink: "Copiar enlace",
      done: "Listo",
      favoriteAdded: "Añadido a favoritos",
      favoriteRemoved: "Quitado de favoritos",
      favorites: "Favoritos",
      forwardHistory: "Historial siguiente",
      history: "Historial",
      invalidAddress: "No es una página de Merchiva",
      linkCopied: "Enlace copiado",
      mode: "Modo",
      noApps: "No hay aplicaciones disponibles",
      noFavorites: "Aún no hay favoritos",
      noFavoritesDescription: "Usa «Añadir a favoritos» en el menú de la página para guardar páginas aquí.",
      noHistory: "Aún no hay historial",
      noResults: "Sin resultados",
      openInBrowser: "Abrir en el navegador",
      openInBrowserFailed: "No se pudo abrir el navegador",
      openInNewTabNamed: "Abrir {title} en una pestaña nueva",
      openTabs: "Pestañas abiertas",
      pageMenu: "Menú de la página",
      pageMenuUnread: "Menú de la página, {n} notificaciones sin leer",
      recentDocuments: "Documentos recientes",
      reloadApp: "Recargar la aplicación",
      removeFavoriteNamed: "Quitar {title} de favoritos",
      removeFromFavorites: "Quitar de favoritos",
      searchLabel: "Buscar",
      searchPlaceholder: "Buscar o introducir una página",
      share: "Compartir",
      showSectionPages: "Mostrar las páginas de {title}",
      showToolbar: "Mostrar la barra de herramientas",
      store: "Tienda",
      suggestions: "Sugerencias",
      switchToTab: "Ir a la pestaña",
      tabOverview: "Vista de pestañas",
      tabsButton: "Pestañas, {n} abiertas",
      tabsCount: "{n} pestañas",
      thisPage: "Esta página",
      today: "Hoy",
      yesterday: "Ayer",
    },
  },
  hi: {
    browserMobile: {
      address: "पता",
      addressButton: "{title}. कोई पेज खोजें या दर्ज करें",
      addToFavorites: "पसंदीदा में जोड़ें",
      app: "ऐप",
      apps: "ऐप्स",
      backHistory: "पिछला इतिहास",
      bookmarks: "बुकमार्क",
      chromeLabel: "ब्राउज़र नियंत्रण",
      clearHistory: "इतिहास साफ़ करें",
      closeAllAction: "सभी {n} टैब बंद करें",
      closeAllConfirm: "सभी {n} टैब बंद करें?",
      closeAllDescription: "बंद किए गए टैब, टैब मेनू से फिर खोले जा सकते हैं।",
      closeTabNamed: "{title} बंद करें",
      copyFailed: "लिंक कॉपी नहीं हो सका",
      copyLink: "लिंक कॉपी करें",
      done: "हो गया",
      favoriteAdded: "पसंदीदा में जोड़ा गया",
      favoriteRemoved: "पसंदीदा से हटाया गया",
      favorites: "पसंदीदा",
      forwardHistory: "अगला इतिहास",
      history: "इतिहास",
      invalidAddress: "यह Merchiva पेज नहीं है",
      linkCopied: "लिंक कॉपी हो गया",
      mode: "मोड",
      noApps: "कोई ऐप उपलब्ध नहीं है",
      noFavorites: "अभी कोई पसंदीदा नहीं",
      noFavoritesDescription: "पेजों को यहाँ रखने के लिए पेज मेनू में “पसंदीदा में जोड़ें” चुनें।",
      noHistory: "अभी कोई इतिहास नहीं",
      noResults: "कोई परिणाम नहीं",
      openInBrowser: "ब्राउज़र में खोलें",
      openInBrowserFailed: "ब्राउज़र नहीं खुल सका",
      openInNewTabNamed: "{title} को नए टैब में खोलें",
      openTabs: "खुले टैब",
      pageMenu: "पेज मेनू",
      pageMenuUnread: "पेज मेनू, {n} अपठित सूचनाएँ",
      recentDocuments: "हाल के दस्तावेज़",
      reloadApp: "ऐप फिर से लोड करें",
      removeFavoriteNamed: "{title} को पसंदीदा से हटाएँ",
      removeFromFavorites: "पसंदीदा से हटाएँ",
      searchLabel: "खोजें",
      searchPlaceholder: "पेज खोजें या दर्ज करें",
      share: "शेयर करें",
      showSectionPages: "{title} के पेज दिखाएँ",
      showToolbar: "टूलबार दिखाएँ",
      store: "स्टोर",
      suggestions: "सुझाव",
      switchToTab: "टैब पर जाएँ",
      tabOverview: "टैब अवलोकन",
      tabsButton: "टैब, {n} खुले",
      tabsCount: "{n} टैब",
      thisPage: "यह पेज",
      today: "आज",
      yesterday: "कल",
    },
  },
  ar: {
    browserMobile: {
      address: "العنوان",
      addressButton: "{title}. ابحث عن صفحة أو أدخل عنوانها",
      addToFavorites: "إضافة إلى المفضلة",
      app: "التطبيق",
      apps: "التطبيقات",
      backHistory: "سجل الرجوع",
      bookmarks: "الإشارات المرجعية",
      chromeLabel: "عناصر التحكم في المتصفح",
      clearHistory: "مسح السجل",
      closeAllAction: "إغلاق جميع علامات التبويب ({n})",
      closeAllConfirm: "هل تريد إغلاق جميع علامات التبويب ({n})؟",
      closeAllDescription: "يمكنك إعادة فتح علامات التبويب المغلقة من قائمة علامات التبويب.",
      closeTabNamed: "إغلاق {title}",
      copyFailed: "تعذّر نسخ الرابط",
      copyLink: "نسخ الرابط",
      done: "تم",
      favoriteAdded: "تمت الإضافة إلى المفضلة",
      favoriteRemoved: "تمت الإزالة من المفضلة",
      favorites: "المفضلة",
      forwardHistory: "سجل التقدّم",
      history: "السجل",
      invalidAddress: "هذه ليست صفحة في Merchiva",
      linkCopied: "تم نسخ الرابط",
      mode: "الوضع",
      noApps: "لا توجد تطبيقات متاحة",
      noFavorites: "لا توجد عناصر مفضلة بعد",
      noFavoritesDescription: "استخدم «إضافة إلى المفضلة» في قائمة الصفحة للاحتفاظ بالصفحات هنا.",
      noHistory: "لا يوجد سجل بعد",
      noResults: "لا توجد نتائج",
      openInBrowser: "فتح في المتصفح",
      openInBrowserFailed: "تعذّر فتح المتصفح",
      openInNewTabNamed: "فتح {title} في علامة تبويب جديدة",
      openTabs: "علامات التبويب المفتوحة",
      pageMenu: "قائمة الصفحة",
      pageMenuUnread: "قائمة الصفحة، {n} من الإشعارات غير المقروءة",
      recentDocuments: "المستندات الأخيرة",
      reloadApp: "إعادة تحميل التطبيق",
      removeFavoriteNamed: "إزالة {title} من المفضلة",
      removeFromFavorites: "إزالة من المفضلة",
      searchLabel: "بحث",
      searchPlaceholder: "ابحث عن صفحة أو أدخل عنوانها",
      share: "مشاركة",
      showSectionPages: "عرض صفحات {title}",
      showToolbar: "إظهار شريط الأدوات",
      store: "المتجر",
      suggestions: "اقتراحات",
      switchToTab: "الانتقال إلى علامة التبويب",
      tabOverview: "نظرة عامة على علامات التبويب",
      tabsButton: "علامات التبويب، {n} مفتوحة",
      tabsCount: "علامات التبويب ({n})",
      thisPage: "هذه الصفحة",
      today: "اليوم",
      yesterday: "أمس",
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

/** Returns true when the file was rewritten. */
function mergeInto(locale: string, entries: Array<[string, string]>): boolean {
  const file = join(MESSAGES, `${locale}.json`);
  for (let attempt = 0; attempt < 5; attempt++) {
    const mtime = statSync(file).mtimeMs;
    const original = readFileSync(file, "utf8");
    const json = JSON.parse(original) as Record<string, unknown>;
    for (const [k, v] of entries) setLeaf(json, k, v);
    const text = `${JSON.stringify(json, null, 2)}\n`;
    if (text === original) return false;
    if (statSync(file).mtimeMs !== mtime) continue; // another writer: redo from a fresh read
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, text);
    renameSync(tmp, file);
    return true;
  }
  throw new Error(`${locale}.json kept changing; rerun`);
}

/** `{name}` placeholders must survive translation. */
function placeholders(value: string): string {
  return (value.match(/\{\w+\}/g) ?? []).sort().join(",");
}

const locales = Object.keys(DICT) as HandLocale[];
const enEntries = new Map(flatten(DICT.en));
const enKeys = Array.from(enEntries.keys()).sort().join("\n");
for (const loc of locales) {
  const entries = flatten(DICT[loc]);
  if (entries.map(([k]) => k).sort().join("\n") !== enKeys) throw new Error(`${loc} key set differs from en`);
  for (const [k, v] of entries) {
    if (!v.trim()) throw new Error(`${loc}: ${k} is empty`);
    if (placeholders(v) !== placeholders(enEntries.get(k) ?? "")) throw new Error(`${loc}: ${k} placeholders differ from en`);
  }
}

const changed: string[] = [];
for (const loc of locales) if (mergeInto(loc, flatten(DICT[loc]))) changed.push(loc);
const zh = flatten(DICT["zh-cn"]);
const toTW = OpenCC.Converter({ from: "cn", to: "twp" });
const toHK = OpenCC.Converter({ from: "cn", to: "hk" });
if (mergeInto("zh-tw", zh.map(([k, v]): [string, string] => [k, applyTaiwanTerms(toTW(v))]))) changed.push("zh-tw");
if (mergeInto("zh-hk", zh.map(([k, v]): [string, string] => [k, toHK(v)]))) changed.push("zh-hk");
console.log(`merged ${zh.length} keys into 8 locales; rewrote: ${changed.length > 0 ? changed.join(", ") : "none"}`);
