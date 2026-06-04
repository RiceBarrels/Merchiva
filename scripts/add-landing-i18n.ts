/**
 * Merge the `landing` i18n namespace (shared marketing chrome: nav, CTAs,
 * footer labels) into every messages/<locale>.json. Idempotent — re-running
 * overwrites the `landing` key with these values.
 *
 *   bun run scripts/add-landing-i18n.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MESSAGES = join(import.meta.dir, "..", "messages");

type Landing = {
  nav: { features: string; pricing: string; download: string; about: string; blog: string; changelog: string };
  cta: { signIn: string; startFree: string };
  footer: {
    product: string; company: string; resources: string; legal: string;
    customers: string; careers: string; docs: string; status: string;
    privacy: string; terms: string; dpa: string; security: string;
  };
};

const LANDING: Record<string, Landing> = {
  en: {
    nav: { features: "Features", pricing: "Pricing", download: "Download", about: "About", blog: "Blog", changelog: "Changelog" },
    cta: { signIn: "Sign in", startFree: "Start free" },
    footer: { product: "Product", company: "Company", resources: "Resources", legal: "Legal", customers: "Customers", careers: "Careers", docs: "Docs", status: "Status", privacy: "Privacy", terms: "Terms", dpa: "DPA", security: "Security" },
  },
  "zh-cn": {
    nav: { features: "功能", pricing: "定价", download: "下载", about: "关于", blog: "博客", changelog: "更新日志" },
    cta: { signIn: "登录", startFree: "免费开始" },
    footer: { product: "产品", company: "公司", resources: "资源", legal: "法律", customers: "客户", careers: "招聘", docs: "文档", status: "状态", privacy: "隐私", terms: "条款", dpa: "数据协议", security: "安全" },
  },
  "zh-tw": {
    nav: { features: "功能", pricing: "定價", download: "下載", about: "關於", blog: "部落格", changelog: "更新日誌" },
    cta: { signIn: "登入", startFree: "免費開始" },
    footer: { product: "產品", company: "公司", resources: "資源", legal: "法律", customers: "客戶", careers: "徵才", docs: "文件", status: "狀態", privacy: "隱私", terms: "條款", dpa: "資料協議", security: "安全" },
  },
  "zh-hk": {
    nav: { features: "功能", pricing: "定價", download: "下載", about: "關於", blog: "網誌", changelog: "更新日誌" },
    cta: { signIn: "登入", startFree: "免費開始" },
    footer: { product: "產品", company: "公司", resources: "資源", legal: "法律", customers: "客戶", careers: "招聘", docs: "文件", status: "狀態", privacy: "私隱", terms: "條款", dpa: "資料協議", security: "保安" },
  },
  fr: {
    nav: { features: "Fonctionnalités", pricing: "Tarifs", download: "Télécharger", about: "À propos", blog: "Blog", changelog: "Nouveautés" },
    cta: { signIn: "Se connecter", startFree: "Commencer" },
    footer: { product: "Produit", company: "Entreprise", resources: "Ressources", legal: "Légal", customers: "Clients", careers: "Carrières", docs: "Docs", status: "Statut", privacy: "Confidentialité", terms: "Conditions", dpa: "DPA", security: "Sécurité" },
  },
  es: {
    nav: { features: "Funciones", pricing: "Precios", download: "Descargar", about: "Acerca de", blog: "Blog", changelog: "Novedades" },
    cta: { signIn: "Iniciar sesión", startFree: "Empezar gratis" },
    footer: { product: "Producto", company: "Empresa", resources: "Recursos", legal: "Legal", customers: "Clientes", careers: "Empleo", docs: "Docs", status: "Estado", privacy: "Privacidad", terms: "Términos", dpa: "DPA", security: "Seguridad" },
  },
  hi: {
    nav: { features: "विशेषताएँ", pricing: "मूल्य", download: "डाउनलोड", about: "परिचय", blog: "ब्लॉग", changelog: "बदलाव" },
    cta: { signIn: "साइन इन", startFree: "मुफ़्त शुरू करें" },
    footer: { product: "उत्पाद", company: "कंपनी", resources: "संसाधन", legal: "कानूनी", customers: "ग्राहक", careers: "करियर", docs: "दस्तावेज़", status: "स्थिति", privacy: "गोपनीयता", terms: "शर्तें", dpa: "DPA", security: "सुरक्षा" },
  },
  ar: {
    nav: { features: "الميزات", pricing: "الأسعار", download: "تنزيل", about: "حول", blog: "المدونة", changelog: "السجل" },
    cta: { signIn: "تسجيل الدخول", startFree: "ابدأ مجانًا" },
    footer: { product: "المنتج", company: "الشركة", resources: "الموارد", legal: "قانوني", customers: "العملاء", careers: "الوظائف", docs: "المستندات", status: "الحالة", privacy: "الخصوصية", terms: "الشروط", dpa: "اتفاقية البيانات", security: "الأمان" },
  },
};

for (const [loc, landing] of Object.entries(LANDING)) {
  const file = join(MESSAGES, `${loc}.json`);
  const json = JSON.parse(readFileSync(file, "utf8"));
  json.landing = landing;
  writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
  console.log(`✓ ${loc}.json`);
}
