import { Resend } from "resend";

const FROM = "Merchiva <onboarding@merchiva.com>";

// Escape user-supplied text before interpolating into email HTML.
function esc(s: string): string {
  return s.replace(/[<>&"']/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c] ?? c),
  );
}

// Email look follows the app theme in app/globals.css (hex copies of its oklch
// tokens: mail clients do not parse oklch): black 1px borders on a pale ground,
// indigo primary, a 1rem radius, DM Sans, Space Mono for amounts. Inline styles
// and a table frame, because mail clients drop <style>.
const INK = "#000000"; // --foreground
const MUTED = "#333333"; // --muted-foreground
const FAINT = "#737373"; // --input
const BORDER = "#000000"; // --border
const GROUND = "#f7f9f3"; // --background
const PRIMARY = "#4f46e5"; // --primary
const RADIUS = "16px"; // --radius
const RADIUS_INNER = "14px"; // --radius-md
const FONT = "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "'Space Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
// The PWA icon on the production site: mail clients need an absolute https URL
// and most of them do not render SVG.
const LOGO_URL = "https://www.merchiva.com/icon-192.png";
const BRAND_LINE = "Merchiva — AI-powered business management";

/** Card-framed email: brand row, body, footer under the card. Every argument is already-escaped HTML. */
function emailLayout({ brand, body, footer, dir = "ltr" }: { brand: string; body: string; footer: string; dir?: "ltr" | "rtl" }): string {
  return `
    <div dir="${dir}" style="margin:0;padding:32px 16px;background:${GROUND};font-family:${FONT};color:${INK};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid ${BORDER};border-radius:${RADIUS};border-collapse:separate;">
        <tr>
          <td style="padding:16px 24px;border-bottom:1px solid ${BORDER};">
            <img src="${LOGO_URL}" width="24" height="24" alt="" style="display:inline-block;vertical-align:middle;border:0;border-radius:6px;" />
            <span style="display:inline-block;vertical-align:middle;margin:0 8px;font-size:14px;font-weight:600;letter-spacing:-0.01em;color:${INK};">${brand}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:24px;">${body}</td>
        </tr>
      </table>
      <p style="max-width:560px;margin:16px auto 0;font-size:12px;line-height:1.5;color:${FAINT};text-align:center;">${footer}</p>
    </div>
  `;
}

function emailHeading(text: string): string {
  return `<h1 style="margin:0 0 8px;font-size:18px;font-weight:600;line-height:1.3;letter-spacing:-0.01em;color:${INK};">${text}</h1>`;
}

function emailText(html: string): string {
  return `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:${INK};">${html}</p>`;
}

/** Secondary line; `box` sets its margin (and any separator) as inline CSS. */
function emailNote(html: string, box = "margin:20px 0 0;"): string {
  return `<p style="${box}font-size:13px;line-height:1.5;color:${MUTED};">${html}</p>`;
}

function emailButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${PRIMARY};color:#ffffff;padding:10px 20px;border-radius:${RADIUS};text-decoration:none;font-size:14px;font-weight:500;line-height:20px;">${label}</a>`;
}

function cleanEmailDisplayName(name: string): string {
  return name.replace(/[<>"\r\n,]/g, " ").replace(/\s+/g, " ").trim() || "Merchiva";
}

function isSimpleEmailAddress(email: string): boolean {
  return /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+$/.test(email);
}

function supplierThreadFrom(orgName: string, replyTo?: string | null): string {
  const email = replyTo?.trim();
  if (!email || !isSimpleEmailAddress(email)) return FROM;
  return `${cleanEmailDisplayName(orgName)} <${email}>`;
}

export interface SupplierPOItem {
  name: string;
  itemName?: string;
  productName?: string;
  inventoryItemName?: string;
  item?: string;
  quantity: number;
  unit?: string;
  unitCost?: number;
  unitsPerCase?: number;
  caseCount?: number;
  caseUnit?: string;
  eachUnit?: string;
}

type SupplierEmailLanguage = "en" | "zh" | "es" | "fr" | "ar" | "hi";

const SUPPLIER_PO_COPY: Record<SupplierEmailLanguage, {
  subject: (orgName: string) => string;
  title: string;
  greeting: (name: string) => string;
  intro: string;
  item: string;
  qty: string;
  estCost: string;
  notes: string;
  estimatedTotal: string;
  pendingQuote: string;
  footer: (orgName: string) => string;
  brand: string;
}> = {
  en: {
    subject: (orgName) => `Purchase order from ${orgName}`,
    title: "Purchase order",
    greeting: (name) => `Hi ${name},`,
    intro: "We'd like to place the following order. Please confirm availability, pricing, and delivery time by replying to this email.",
    item: "Item",
    qty: "Qty",
    estCost: "Est. cost",
    notes: "Notes",
    estimatedTotal: "Estimated total",
    pendingQuote: "pending supplier quote",
    footer: (orgName) => `Sent via Merchiva on behalf of ${orgName}. Reply to this email to confirm or discuss.`,
    brand: "Merchiva — AI-powered business management",
  },
  zh: {
    subject: (orgName) => `${orgName} 的补货订单`,
    title: "补货订单",
    greeting: (name) => `${name}，您好：`,
    intro: "我们想订购以下货品。请回复确认库存、价格和最早送达时间。",
    item: "货品",
    qty: "数量",
    estCost: "预估费用",
    notes: "备注",
    estimatedTotal: "预估总额",
    pendingQuote: "等待供应商报价",
    footer: (orgName) => `由 Merchiva 代表 ${orgName} 发送。请直接回复此邮件确认或沟通。`,
    brand: "Merchiva — AI 商户管理平台",
  },
  es: {
    subject: (orgName) => `Orden de compra de ${orgName}`,
    title: "Orden de compra",
    greeting: (name) => `Hola ${name},`,
    intro: "Queremos realizar el siguiente pedido. Confirme disponibilidad, precio y tiempo de entrega respondiendo a este correo.",
    item: "Artículo",
    qty: "Cant.",
    estCost: "Costo est.",
    notes: "Notas",
    estimatedTotal: "Total estimado",
    pendingQuote: "cotización pendiente del proveedor",
    footer: (orgName) => `Enviado por Merchiva en nombre de ${orgName}. Responda a este correo para confirmar o comentar.`,
    brand: "Merchiva — gestión empresarial con IA",
  },
  fr: {
    subject: (orgName) => `Bon de commande de ${orgName}`,
    title: "Bon de commande",
    greeting: (name) => `Bonjour ${name},`,
    intro: "Nous souhaitons passer la commande ci-dessous. Merci de confirmer la disponibilité, le prix et le délai de livraison en répondant à cet e-mail.",
    item: "Article",
    qty: "Qté",
    estCost: "Coût estimé",
    notes: "Notes",
    estimatedTotal: "Total estimé",
    pendingQuote: "devis fournisseur en attente",
    footer: (orgName) => `Envoyé via Merchiva pour ${orgName}. Répondez à cet e-mail pour confirmer ou échanger.`,
    brand: "Merchiva — gestion d'entreprise avec IA",
  },
  ar: {
    subject: (orgName) => `أمر شراء من ${orgName}`,
    title: "أمر شراء",
    greeting: (name) => `مرحبًا ${name}،`,
    intro: "نرغب في تقديم الطلب التالي. يرجى تأكيد التوفر والسعر وموعد التسليم بالرد على هذا البريد.",
    item: "الصنف",
    qty: "الكمية",
    estCost: "التكلفة التقديرية",
    notes: "ملاحظات",
    estimatedTotal: "الإجمالي التقديري",
    pendingQuote: "بانتظار عرض سعر المورد",
    footer: (orgName) => `أُرسل عبر Merchiva نيابة عن ${orgName}. يرجى الرد على هذا البريد للتأكيد أو المناقشة.`,
    brand: "Merchiva — إدارة أعمال مدعومة بالذكاء الاصطناعي",
  },
  hi: {
    subject: (orgName) => `${orgName} से खरीद ऑर्डर`,
    title: "खरीद ऑर्डर",
    greeting: (name) => `नमस्ते ${name},`,
    intro: "हम नीचे दिया गया ऑर्डर देना चाहते हैं। कृपया उपलब्धता, कीमत और डिलीवरी समय की पुष्टि इस ईमेल का उत्तर देकर करें।",
    item: "आइटम",
    qty: "मात्रा",
    estCost: "अनुमानित लागत",
    notes: "नोट्स",
    estimatedTotal: "अनुमानित कुल",
    pendingQuote: "आपूर्तिकर्ता quote लंबित",
    footer: (orgName) => `${orgName} की ओर से Merchiva के माध्यम से भेजा गया। पुष्टि या चर्चा के लिए इस ईमेल का उत्तर दें।`,
    brand: "Merchiva — AI-powered business management",
  },
};

function normalizeSupplierEmailLanguage(language?: string | null): SupplierEmailLanguage {
  const key = String(language || "en").toLowerCase().split(/[-_]/)[0];
  return key === "zh" || key === "es" || key === "fr" || key === "ar" || key === "hi" ? key : "en";
}

function finiteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function supplierItemName(it: SupplierPOItem): string {
  return String(it.name || it.itemName || it.productName || it.inventoryItemName || it.item || "Item").trim() || "Item";
}

function formatSupplierQuantity(it: SupplierPOItem, language: SupplierEmailLanguage): string {
  const qty = finiteNumber(it.quantity) ?? 0;
  const unitsPerCase = finiteNumber(it.unitsPerCase);
  const caseCount = finiteNumber(it.caseCount) ?? (unitsPerCase && unitsPerCase > 0 ? Math.ceil(qty / unitsPerCase) : null);
  if (caseCount && unitsPerCase && unitsPerCase > 0) {
    if (language === "zh") return `${caseCount}*箱 - ${qty}个`;
    if (language === "es") return `${caseCount} cajas - ${qty} unidades`;
    if (language === "fr") return `${caseCount} cartons - ${qty} unités`;
    if (language === "ar") return `${caseCount} صناديق - ${qty} وحدة`;
    if (language === "hi") return `${caseCount} केस - ${qty} यूनिट`;
    return `${caseCount} cases - ${qty} units`;
  }
  return `${qty}${it.unit ? " " + it.unit : ""}`;
}

/**
 * Send a purchase-order request to a supplier on behalf of the org. The
 * supplier's reply goes to `replyTo`, which should usually be the store's
 * fixed inbound supplier inbox. Throws on send failure so the caller can fall
 * back to saving a draft + escalating.
 */
export async function sendSupplierPOEmail({
  to,
  supplierName,
  contactName,
  orgName,
  items,
  total,
  currency = "$",
  notes,
  replyTo,
  language,
}: {
  to: string;
  supplierName: string;
  contactName?: string | null;
  orgName: string;
  items: SupplierPOItem[];
  total: number;
  currency?: string;
  notes?: string | null;
  replyTo?: string | null;
  language?: string | null;
}) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const emailLanguage = normalizeSupplierEmailLanguage(language);
  const copy = SUPPLIER_PO_COPY[emailLanguage];
  const greeting = copy.greeting(esc(contactName || supplierName));
  const rtl = emailLanguage === "ar";
  const start = rtl ? "right" : "left";
  const end = rtl ? "left" : "right";
  const cell = `padding:8px 12px;border-bottom:1px solid ${BORDER};font-size:14px;line-height:1.4;`;
  const figure = `font-family:${MONO};font-variant-numeric:tabular-nums;white-space:nowrap;`;
  const head = `padding:8px 12px;border-bottom:1px solid ${BORDER};font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:${MUTED};`;
  const rows = items
    .map((it) => {
      const qty = formatSupplierQuantity(it, emailLanguage);
      const line = it.unitCost != null ? `${esc(currency)}${(it.unitCost * it.quantity).toFixed(2)}` : "—";
      return `
        <tr>
          <td style="${cell}text-align:${start};color:${INK};">${esc(supplierItemName(it))}</td>
          <td style="${cell}${figure}text-align:${end};color:${INK};">${esc(qty)}</td>
          <td style="${cell}${figure}text-align:${end};color:${MUTED};">${line}</td>
        </tr>`;
    })
    .join("");
  const notesBlock = notes
    ? `<div style="margin:16px 0 0;padding:12px 14px;border:1px solid ${BORDER};border-radius:${RADIUS_INNER};font-size:14px;line-height:1.6;color:${INK};">
        <div style="margin:0 0 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:${MUTED};">${esc(copy.notes)}</div>
        ${esc(notes).replace(/\n/g, "<br/>")}
      </div>`
    : "";
  const totalLabel = total > 0 ? `${currency}${total.toFixed(2)}` : copy.pendingQuote;
  const totalStyle = total > 0 ? `${figure}font-size:14px;font-weight:600;color:${INK};` : `font-size:13px;color:${MUTED};`;
  const { error } = await resend.emails.send({
    from: supplierThreadFrom(orgName, replyTo),
    to,
    ...(replyTo ? { replyTo } : {}),
    subject: copy.subject(orgName),
    html: emailLayout({
      dir: rtl ? "rtl" : "ltr",
      brand: esc(orgName),
      footer: esc(copy.brand),
      body: `
        ${emailHeading(esc(copy.title))}
        ${emailText(`${greeting} ${esc(copy.intro)}`)}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:${RADIUS_INNER};border-collapse:separate;border-spacing:0;">
          <thead>
            <tr>
              <th style="${head}text-align:${start};">${esc(copy.item)}</th>
              <th style="${head}text-align:${end};">${esc(copy.qty)}</th>
              <th style="${head}text-align:${end};">${esc(copy.estCost)}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr>
              <td colspan="2" style="padding:10px 12px;font-size:13px;color:${MUTED};text-align:${start};">${esc(copy.estimatedTotal)}</td>
              <td style="padding:10px 12px;text-align:${end};${totalStyle}">${esc(totalLabel)}</td>
            </tr>
          </tfoot>
        </table>
        ${notesBlock}
        ${emailNote(esc(copy.footer(orgName)), "margin:24px 0 0;")}
      `,
    }),
  });

  if (error) {
    console.error("[email/supplier-po] Resend error:", error);
    throw new Error(`Failed to send supplier PO email: ${error.message}`);
  }
}

export async function sendTeamInviteEmail({
  to,
  inviterEmail,
  orgName,
  role,
  inviteUrl,
  phone,
}: {
  to: string;
  inviterEmail: string;
  orgName: string;
  role: string;
  inviteUrl: string;
  phone?: string;
}) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  // Every value is user-chosen (store name, display name, phone): escape them
  // all for the HTML, and keep the subject on one line.
  const safePhone = phone ? esc(phone) : null;
  // Store and display names are free text anyone can set: keep them short, on one line.
  const short = (s: string) => {
    const one = s.replace(/\s+/g, " ").trim();
    return one.length > 60 ? `${one.slice(0, 59)}…` : one;
  };
  const safeInviter = esc(short(inviterEmail));
  const safeOrg = esc(short(orgName));
  // A fixed word, never the stored text: inviteToOrg accepts any role string.
  const safeRole = ({ owner: "Owner", manager: "Manager", staff: "Staff" } as Record<string, string>)[role] ?? "Team member";
  const safeUrl = esc(inviteUrl);
  const subjectOrg = short(orgName);
  const phoneLine = safePhone
    ? emailNote(`We'll also keep <strong style="color:${INK};font-weight:500;">${safePhone}</strong> on file for shift reminders once you join.`, "margin:16px 0 0;")
    : "";
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: `You're invited to join ${subjectOrg} on Merchiva`,
    html: emailLayout({
      brand: "Merchiva",
      footer: BRAND_LINE,
      body: `
        ${emailHeading(`Join ${safeOrg} on Merchiva`)}
        ${emailText(`<strong style="font-weight:600;">${safeInviter}</strong> has invited you to join <strong style="font-weight:600;">${safeOrg}</strong> as <strong style="font-weight:600;">${safeRole}</strong>.`)}
        ${emailButton(safeUrl, "Accept invitation")}${phoneLine}
        ${emailNote("This invitation expires in 7 days. If you didn't expect this email, you can safely ignore it.", `margin:24px 0 0;padding:16px 0 0;border-top:1px solid ${BORDER};`)}
      `,
    }),
  });

  if (error) {
    console.error("[email/invite] Resend error:", error);
    throw new Error(`Failed to send invite email: ${error.message}`);
  }
}

/**
 * Free-form reply to a supplier in an ongoing thread (Phase 2 — Mr. Merchiva's
 * answer to an inbound supplier email). `replyTo` keeps the thread routable
 * back to the inbound webhook. Throws on send failure.
 */
export async function sendSupplierReplyEmail({
  to,
  orgName,
  body,
  subject,
  replyTo,
}: {
  to: string;
  orgName: string;
  body: string;
  subject?: string | null;
  replyTo?: string | null;
}) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const safeBody = esc(body).replace(/\n/g, "<br/>");
  const { error } = await resend.emails.send({
    from: supplierThreadFrom(orgName, replyTo),
    to,
    ...(replyTo ? { replyTo } : {}),
    subject: subject || `Re: your message — ${orgName}`,
    // A reply in a conversation: plain text, no card, only the shared type and grays.
    html: `
      <div style="font-family:${FONT};max-width:560px;margin:0 auto;padding:24px 16px;color:${INK};">
        <p style="margin:0;font-size:14px;line-height:1.6;color:${INK};">${safeBody}</p>
        <p style="margin:24px 0 0;padding:12px 0 0;border-top:1px solid ${BORDER};font-size:12px;line-height:1.5;color:${FAINT};">
          ${esc(orgName)} · sent via Merchiva. Reply to this email to continue.
        </p>
      </div>
    `,
  });
  if (error) {
    console.error("[email/supplier-reply] Resend error:", error);
    throw new Error(`Failed to send supplier reply: ${error.message}`);
  }
}

export async function sendMorningReminderEmail({
  to,
  ownerName,
  orgName,
  dashboardUrl,
}: {
  to: string;
  ownerName?: string;
  orgName: string;
  dashboardUrl: string;
}) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const greeting = ownerName ? `Good morning, ${esc(ownerName)}` : "Good morning";
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: `Today's briefing for ${orgName} is ready`,
    html: emailLayout({
      brand: "Merchiva",
      footer: BRAND_LINE,
      body: `
        ${emailHeading(`${greeting}.`)}
        ${emailText(`Mr. Merchiva has your morning briefing for <strong style="font-weight:600;">${esc(orgName)}</strong> waiting — what needs attention today, plus a draft of next week's schedule if you haven't set one yet.`)}
        ${emailButton(esc(dashboardUrl), "Open dashboard")}
        ${emailNote("Don't want these reminders? Reply to this email and we'll turn them off.", `margin:24px 0 0;padding:16px 0 0;border-top:1px solid ${BORDER};`)}
      `,
    }),
  });
  if (error) {
    console.error("[email/morning-reminder] Resend error:", error);
    throw new Error(`Failed to send morning reminder: ${error.message}`);
  }
}
