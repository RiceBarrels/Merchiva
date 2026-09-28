// Merges the desktop browser chrome i18n keys (`browserDesktop.*`) into all 8 locale files.
// Run: bun scripts/i18n/browser-desktop.ts
// Leaf-scoped and idempotent: never deletes keys, only writes the subtrees in OWNED, and
// leaves a locale file untouched when nothing changed. zh-tw / zh-hk are converted from
// zh-cn leaf by leaf with opencc-js (never run scripts/gen-traditional-zh.ts: it rewrites
// both files wholesale and would erase other sessions' edits).
// Keys shared with the core chrome (tab actions, New Tab, Untitled) live under `browser.*`
// (scripts/i18n/browser-core.ts).
import { readFileSync, writeFileSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import * as OpenCC from "opencc-js";
import { applyTaiwanTerms } from "./tw-terms";

type Tree = { [key: string]: string | Tree };
type HandLocale = "en" | "zh-cn" | "fr" | "es" | "hi" | "ar";

const OWNED: readonly string[] = ["browserDesktop"];

const DICT: Record<HandLocale, Tree> = {
  en: {
    browserDesktop: {
      skipToContent: "Skip to page content",
      pageLoaded: "{title} loaded",
      tabs: {
        label: "Tabs",
        newTabRight: "New tab to the right",
        search: "Search tabs",
        searchPlaceholder: "Search open and recently closed tabs",
        openTabs: "Open tabs",
        recentlyClosed: "Recently closed",
        moved: "Moved to position {n} of {total}",
        closed: "Tab closed",
        reopened: "Tab reopened",
        closeNamed: "Close {title}",
      },
      toolbar: {
        label: "Browser toolbar",
        reloadHint: "Shift-click for a full reload",
        profile: "Account and stores",
        menu: "Customize and control Merchiva",
      },
      omnibox: {
        label: "Address and search bar",
        placeholder: "Search pages, tabs and documents",
        storeChip: "Current store: {name}",
        switchToTab: "Switch to tab",
        goTo: "Go to {path}",
        noResults: "No matches",
        hintOpen: "open",
        hintNewTab: "new tab",
        hintClose: "close",
        groups: {
          top: "Top match",
          tabs: "Open tabs",
          pages: "Pages",
          docs: "Recent documents",
          stores: "Stores",
          actions: "Actions",
          closed: "Recently closed",
        },
      },
      actions: {
        newDocument: "New document",
        switchStore: "Switch store",
        bookmarkPage: "Bookmark this tab",
        toggleBookmarksBar: "Show bookmarks bar",
        hideBookmarksBar: "Hide bookmarks bar",
      },
      bookmarks: {
        bar: "Bookmarks",
        added: "Bookmark added",
        edit: "Edit bookmark",
        name: "Name",
        remove: "Remove",
        done: "Done",
        more: "More bookmarks",
        openNewTab: "Open in new tab",
        rename: "Rename",
        showBar: "Show bookmarks bar",
      },
      menu: {
        appearance: "Appearance",
        bookmarks: "Bookmarks",
      },
      sidebar: {
        label: "Sidebar",
        nav: "Main navigation",
        show: "Show sidebar",
        hide: "Hide sidebar",
        resize: "Resize sidebar",
        showSubPages: "Show {title} sub-pages",
        hideSubPages: "Hide {title} sub-pages",
      },
      window: {
        label: "Window controls",
        minimize: "Minimize",
        maximize: "Maximize",
        restore: "Restore",
        close: "Close window",
      },
      errors: {
        createDocument: "Couldn't create the document. Try again.",
      },
    },
  },
  "zh-cn": {
    browserDesktop: {
      skipToContent: "跳到页面内容",
      pageLoaded: "{title} 已加载",
      tabs: {
        label: "标签页",
        newTabRight: "在右侧新建标签页",
        search: "搜索标签页",
        searchPlaceholder: "搜索已打开和最近关闭的标签页",
        openTabs: "已打开的标签页",
        recentlyClosed: "最近关闭",
        moved: "已移到第 {n} 个位置，共 {total} 个",
        closed: "标签页已关闭",
        reopened: "标签页已重新打开",
        closeNamed: "关闭“{title}”",
      },
      toolbar: {
        label: "浏览器工具栏",
        reloadHint: "按住 Shift 点击可完全重新加载",
        profile: "账户和门店",
        menu: "自定义及控制 Merchiva",
      },
      omnibox: {
        label: "地址和搜索栏",
        placeholder: "搜索页面、标签页和文档",
        storeChip: "当前门店：{name}",
        switchToTab: "切换到此标签页",
        goTo: "前往 {path}",
        noResults: "无匹配结果",
        hintOpen: "打开",
        hintNewTab: "新标签页",
        hintClose: "关闭",
        groups: {
          top: "最佳匹配",
          tabs: "已打开的标签页",
          pages: "页面",
          docs: "最近的文档",
          stores: "门店",
          actions: "操作",
          closed: "最近关闭",
        },
      },
      actions: {
        newDocument: "新建文档",
        switchStore: "切换门店",
        bookmarkPage: "为此标签页添加书签",
        toggleBookmarksBar: "显示书签栏",
        hideBookmarksBar: "隐藏书签栏",
      },
      bookmarks: {
        bar: "书签",
        added: "已添加书签",
        edit: "修改书签",
        name: "名称",
        remove: "移除",
        done: "完成",
        more: "更多书签",
        openNewTab: "在新标签页中打开",
        rename: "重命名",
        showBar: "显示书签栏",
      },
      menu: {
        appearance: "外观",
        bookmarks: "书签",
      },
      sidebar: {
        label: "侧边栏",
        nav: "主导航",
        show: "显示侧边栏",
        hide: "隐藏侧边栏",
        resize: "调整侧边栏宽度",
        showSubPages: "展开“{title}”的子页面",
        hideSubPages: "收起“{title}”的子页面",
      },
      window: {
        label: "窗口控制",
        minimize: "最小化",
        maximize: "最大化",
        restore: "还原",
        close: "关闭窗口",
      },
      errors: {
        createDocument: "无法创建文档，请重试。",
      },
    },
  },
  fr: {
    browserDesktop: {
      skipToContent: "Aller au contenu de la page",
      pageLoaded: "{title} chargé",
      tabs: {
        label: "Onglets",
        newTabRight: "Nouvel onglet à droite",
        search: "Rechercher dans les onglets",
        searchPlaceholder: "Rechercher parmi les onglets ouverts et récemment fermés",
        openTabs: "Onglets ouverts",
        recentlyClosed: "Récemment fermés",
        moved: "Déplacé en position {n} sur {total}",
        closed: "Onglet fermé",
        reopened: "Onglet rouvert",
        closeNamed: "Fermer {title}",
      },
      toolbar: {
        label: "Barre d'outils du navigateur",
        reloadHint: "Maj + clic pour un rechargement complet",
        profile: "Compte et magasins",
        menu: "Personnaliser et contrôler Merchiva",
      },
      omnibox: {
        label: "Barre d'adresse et de recherche",
        placeholder: "Rechercher des pages, onglets et documents",
        storeChip: "Magasin actuel : {name}",
        switchToTab: "Passer à l'onglet",
        goTo: "Aller à {path}",
        noResults: "Aucun résultat",
        hintOpen: "ouvrir",
        hintNewTab: "nouvel onglet",
        hintClose: "fermer",
        groups: {
          top: "Meilleur résultat",
          tabs: "Onglets ouverts",
          pages: "Pages",
          docs: "Documents récents",
          stores: "Magasins",
          actions: "Actions",
          closed: "Récemment fermés",
        },
      },
      actions: {
        newDocument: "Nouveau document",
        switchStore: "Changer de magasin",
        bookmarkPage: "Ajouter cet onglet aux favoris",
        toggleBookmarksBar: "Afficher la barre de favoris",
        hideBookmarksBar: "Masquer la barre de favoris",
      },
      bookmarks: {
        bar: "Favoris",
        added: "Favori ajouté",
        edit: "Modifier le favori",
        name: "Nom",
        remove: "Supprimer",
        done: "OK",
        more: "Plus de favoris",
        openNewTab: "Ouvrir dans un nouvel onglet",
        rename: "Renommer",
        showBar: "Afficher la barre de favoris",
      },
      menu: {
        appearance: "Apparence",
        bookmarks: "Favoris",
      },
      sidebar: {
        label: "Barre latérale",
        nav: "Navigation principale",
        show: "Afficher la barre latérale",
        hide: "Masquer la barre latérale",
        resize: "Redimensionner la barre latérale",
        showSubPages: "Afficher les sous-pages de {title}",
        hideSubPages: "Masquer les sous-pages de {title}",
      },
      window: {
        label: "Commandes de la fenêtre",
        minimize: "Réduire",
        maximize: "Agrandir",
        restore: "Restaurer",
        close: "Fermer la fenêtre",
      },
      errors: {
        createDocument: "Impossible de créer le document. Réessayez.",
      },
    },
  },
  es: {
    browserDesktop: {
      skipToContent: "Saltar al contenido de la página",
      pageLoaded: "{title} cargado",
      tabs: {
        label: "Pestañas",
        newTabRight: "Nueva pestaña a la derecha",
        search: "Buscar pestañas",
        searchPlaceholder: "Buscar en pestañas abiertas y cerradas recientemente",
        openTabs: "Pestañas abiertas",
        recentlyClosed: "Cerradas recientemente",
        moved: "Movida a la posición {n} de {total}",
        closed: "Pestaña cerrada",
        reopened: "Pestaña reabierta",
        closeNamed: "Cerrar {title}",
      },
      toolbar: {
        label: "Barra de herramientas del navegador",
        reloadHint: "Mayús + clic para recargar por completo",
        profile: "Cuenta y tiendas",
        menu: "Personalizar y controlar Merchiva",
      },
      omnibox: {
        label: "Barra de direcciones y búsqueda",
        placeholder: "Buscar páginas, pestañas y documentos",
        storeChip: "Tienda actual: {name}",
        switchToTab: "Cambiar a la pestaña",
        goTo: "Ir a {path}",
        noResults: "Sin resultados",
        hintOpen: "abrir",
        hintNewTab: "nueva pestaña",
        hintClose: "cerrar",
        groups: {
          top: "Mejor resultado",
          tabs: "Pestañas abiertas",
          pages: "Páginas",
          docs: "Documentos recientes",
          stores: "Tiendas",
          actions: "Acciones",
          closed: "Cerradas recientemente",
        },
      },
      actions: {
        newDocument: "Nuevo documento",
        switchStore: "Cambiar de tienda",
        bookmarkPage: "Añadir esta pestaña a marcadores",
        toggleBookmarksBar: "Mostrar barra de marcadores",
        hideBookmarksBar: "Ocultar barra de marcadores",
      },
      bookmarks: {
        bar: "Marcadores",
        added: "Marcador añadido",
        edit: "Editar marcador",
        name: "Nombre",
        remove: "Quitar",
        done: "Listo",
        more: "Más marcadores",
        openNewTab: "Abrir en una pestaña nueva",
        rename: "Cambiar nombre",
        showBar: "Mostrar barra de marcadores",
      },
      menu: {
        appearance: "Apariencia",
        bookmarks: "Marcadores",
      },
      sidebar: {
        label: "Barra lateral",
        nav: "Navegación principal",
        show: "Mostrar la barra lateral",
        hide: "Ocultar la barra lateral",
        resize: "Redimensionar la barra lateral",
        showSubPages: "Mostrar las subpáginas de {title}",
        hideSubPages: "Ocultar las subpáginas de {title}",
      },
      window: {
        label: "Controles de la ventana",
        minimize: "Minimizar",
        maximize: "Maximizar",
        restore: "Restaurar",
        close: "Cerrar ventana",
      },
      errors: {
        createDocument: "No se pudo crear el documento. Inténtalo de nuevo.",
      },
    },
  },
  hi: {
    browserDesktop: {
      skipToContent: "पेज की सामग्री पर जाएँ",
      pageLoaded: "{title} लोड हो गया",
      tabs: {
        label: "टैब",
        newTabRight: "दाईं ओर नया टैब",
        search: "टैब खोजें",
        searchPlaceholder: "खुले और हाल ही में बंद किए गए टैब खोजें",
        openTabs: "खुले टैब",
        recentlyClosed: "हाल ही में बंद किए गए",
        moved: "{total} में से स्थान {n} पर ले जाया गया",
        closed: "टैब बंद हो गया",
        reopened: "टैब फिर से खोला गया",
        closeNamed: "{title} बंद करें",
      },
      toolbar: {
        label: "ब्राउज़र टूलबार",
        reloadHint: "पूरी तरह रीलोड करने के लिए Shift दबाकर क्लिक करें",
        profile: "खाता और स्टोर",
        menu: "Merchiva को कस्टमाइज़ और नियंत्रित करें",
      },
      omnibox: {
        label: "पता और खोज बार",
        placeholder: "पेज, टैब और दस्तावेज़ खोजें",
        storeChip: "मौजूदा स्टोर: {name}",
        switchToTab: "इस टैब पर जाएँ",
        goTo: "{path} पर जाएँ",
        noResults: "कोई मिलान नहीं",
        hintOpen: "खोलें",
        hintNewTab: "नया टैब",
        hintClose: "बंद करें",
        groups: {
          top: "सबसे अच्छा मिलान",
          tabs: "खुले टैब",
          pages: "पेज",
          docs: "हाल के दस्तावेज़",
          stores: "स्टोर",
          actions: "कार्रवाइयाँ",
          closed: "हाल ही में बंद किए गए",
        },
      },
      actions: {
        newDocument: "नया दस्तावेज़",
        switchStore: "स्टोर बदलें",
        bookmarkPage: "इस टैब को बुकमार्क करें",
        toggleBookmarksBar: "बुकमार्क बार दिखाएँ",
        hideBookmarksBar: "बुकमार्क बार छिपाएँ",
      },
      bookmarks: {
        bar: "बुकमार्क",
        added: "बुकमार्क जोड़ा गया",
        edit: "बुकमार्क संपादित करें",
        name: "नाम",
        remove: "हटाएँ",
        done: "हो गया",
        more: "और बुकमार्क",
        openNewTab: "नए टैब में खोलें",
        rename: "नाम बदलें",
        showBar: "बुकमार्क बार दिखाएँ",
      },
      menu: {
        appearance: "रूप-रंग",
        bookmarks: "बुकमार्क",
      },
      sidebar: {
        label: "साइडबार",
        nav: "मुख्य नेविगेशन",
        show: "साइडबार दिखाएँ",
        hide: "साइडबार छिपाएँ",
        resize: "साइडबार का आकार बदलें",
        showSubPages: "{title} के उप-पृष्ठ दिखाएँ",
        hideSubPages: "{title} के उप-पृष्ठ छिपाएँ",
      },
      window: {
        label: "विंडो नियंत्रण",
        minimize: "छोटा करें",
        maximize: "बड़ा करें",
        restore: "पहले जैसा करें",
        close: "विंडो बंद करें",
      },
      errors: {
        createDocument: "दस्तावेज़ नहीं बनाया जा सका। फिर से कोशिश करें।",
      },
    },
  },
  ar: {
    browserDesktop: {
      skipToContent: "الانتقال إلى محتوى الصفحة",
      pageLoaded: "تم تحميل {title}",
      tabs: {
        label: "علامات التبويب",
        // Neutral wording: in RTL the following tabs sit to the left.
        newTabRight: "علامة تبويب جديدة بعد هذه",
        search: "البحث في علامات التبويب",
        searchPlaceholder: "ابحث في علامات التبويب المفتوحة والمغلقة مؤخرًا",
        openTabs: "علامات التبويب المفتوحة",
        recentlyClosed: "المغلقة مؤخرًا",
        moved: "نُقلت إلى الموضع {n} من {total}",
        closed: "تم إغلاق علامة التبويب",
        reopened: "تمت إعادة فتح علامة التبويب",
        closeNamed: "إغلاق {title}",
      },
      toolbar: {
        label: "شريط أدوات المتصفح",
        reloadHint: "انقر مع الضغط على Shift لإعادة التحميل بالكامل",
        profile: "الحساب والمتاجر",
        menu: "تخصيص Merchiva والتحكم فيه",
      },
      omnibox: {
        label: "شريط العنوان والبحث",
        placeholder: "ابحث في الصفحات وعلامات التبويب والمستندات",
        storeChip: "المتجر الحالي: {name}",
        switchToTab: "الانتقال إلى علامة التبويب",
        goTo: "الانتقال إلى {path}",
        noResults: "لا توجد نتائج",
        hintOpen: "فتح",
        hintNewTab: "علامة تبويب جديدة",
        hintClose: "إغلاق",
        groups: {
          top: "أفضل تطابق",
          tabs: "علامات التبويب المفتوحة",
          pages: "الصفحات",
          docs: "المستندات الأخيرة",
          stores: "المتاجر",
          actions: "الإجراءات",
          closed: "المغلقة مؤخرًا",
        },
      },
      actions: {
        newDocument: "مستند جديد",
        switchStore: "تبديل المتجر",
        bookmarkPage: "إضافة علامة التبويب هذه إلى الإشارات المرجعية",
        toggleBookmarksBar: "إظهار شريط الإشارات المرجعية",
        hideBookmarksBar: "إخفاء شريط الإشارات المرجعية",
      },
      bookmarks: {
        bar: "الإشارات المرجعية",
        added: "تمت إضافة الإشارة المرجعية",
        edit: "تعديل الإشارة المرجعية",
        name: "الاسم",
        remove: "إزالة",
        done: "تم",
        more: "مزيد من الإشارات المرجعية",
        openNewTab: "فتح في علامة تبويب جديدة",
        rename: "إعادة التسمية",
        showBar: "إظهار شريط الإشارات المرجعية",
      },
      menu: {
        appearance: "المظهر",
        bookmarks: "الإشارات المرجعية",
      },
      sidebar: {
        label: "الشريط الجانبي",
        nav: "التنقل الرئيسي",
        show: "إظهار الشريط الجانبي",
        hide: "إخفاء الشريط الجانبي",
        resize: "تغيير حجم الشريط الجانبي",
        showSubPages: "إظهار الصفحات الفرعية لـ {title}",
        hideSubPages: "إخفاء الصفحات الفرعية لـ {title}",
      },
      window: {
        label: "عناصر التحكم في النافذة",
        minimize: "تصغير",
        maximize: "تكبير",
        restore: "استعادة",
        close: "إغلاق النافذة",
      },
      errors: {
        createDocument: "تعذّر إنشاء المستند. حاول مرة أخرى.",
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
