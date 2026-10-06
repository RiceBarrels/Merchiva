import { Resend } from "resend";

const FROM = "Merchiva <onboarding@merchiva.com>";

// Escape user-supplied text before interpolating into email HTML.
function esc(s: string): string {
  return s.replace(/[<>&"']/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c] ?? c),
  );
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
  const rows = items
    .map((it) => {
      const qty = formatSupplierQuantity(it, emailLanguage);
      const line = it.unitCost != null ? `${esc(currency)}${(it.unitCost * it.quantity).toFixed(2)}` : "—";
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e7e5e4;font-size:14px;color:#1c1917;">${esc(supplierItemName(it))}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e7e5e4;font-size:14px;color:#57534e;text-align:right;">${esc(qty)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e7e5e4;font-size:14px;color:#57534e;text-align:right;">${line}</td>
        </tr>`;
    })
    .join("");
  const notesBlock = notes
    ? `<p style="color:#57534e;font-size:14px;line-height:1.6;margin:16px 0 0;"><strong style="color:#1c1917;">${esc(copy.notes)}:</strong> ${esc(notes)}</p>`
    : "";
  const totalLabel = total > 0 ? `${currency}${total.toFixed(2)}` : copy.pendingQuote;
  const { error } = await resend.emails.send({
    from: supplierThreadFrom(orgName, replyTo),
    to,
    ...(replyTo ? { replyTo } : {}),
    subject: copy.subject(orgName),
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <div style="margin-bottom: 32px;">
          <div style="display: inline-block; background: #1c1917; color: white; width: 32px; height: 32px; text-align: center; line-height: 32px; border-radius: 4px; font-size: 14px; font-weight: bold;">⚡</div>
          <span style="margin-left: 8px; font-weight: 700; font-size: 16px; color: #1c1917;">${esc(orgName)}</span>
        </div>
        <h1 style="font-size: 20px; font-weight: 700; color: #1c1917; margin: 0 0 8px;">${esc(copy.title)}</h1>
        <p style="color: #57534e; font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
          ${greeting} ${esc(copy.intro)}
        </p>
        <table style="width:100%;border-collapse:collapse;border-top:1px solid #e7e5e4;">
          <thead>
            <tr>
              <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#a8a29e;border-bottom:1px solid #e7e5e4;">${esc(copy.item)}</th>
              <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#a8a29e;border-bottom:1px solid #e7e5e4;">${esc(copy.qty)}</th>
              <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#a8a29e;border-bottom:1px solid #e7e5e4;">${esc(copy.estCost)}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="color:#1c1917;font-size:15px;font-weight:600;margin:16px 0 0;text-align:right;">
          ${esc(copy.estimatedTotal)}: ${esc(totalLabel)}
        </p>
        ${notesBlock}
        <p style="color: #a8a29e; font-size: 13px; line-height: 1.5; margin: 28px 0 0;">
          ${esc(copy.footer(orgName))}
        </p>
        <hr style="border: none; border-top: 1px solid #e7e5e4; margin: 28px 0 16px;" />
        <p style="color: #a8a29e; font-size: 12px; margin: 0;">${esc(copy.brand)}</p>
      </div>
    `,
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
    ? `
        <p style="color: #78716c; font-size: 13px; line-height: 1.5; margin: 16px 0 0;">
          We'll also keep <strong style="color: #1c1917;">${safePhone}</strong> on file for shift reminders once you join.
        </p>`
    : "";
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: `You're invited to join ${subjectOrg} on Merchiva`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <div style="margin-bottom: 32px;">
          <div style="display: inline-block; background: #1c1917; color: white; width: 32px; height: 32px; text-align: center; line-height: 32px; border-radius: 4px; font-size: 14px; font-weight: bold;">⚡</div>
          <span style="margin-left: 8px; font-weight: 700; font-size: 16px; color: #1c1917;">Merchiva</span>
        </div>
        <h1 style="font-size: 22px; font-weight: 700; color: #1c1917; margin: 0 0 8px;">You're invited!</h1>
        <p style="color: #57534e; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
          <strong>${safeInviter}</strong> has invited you to join <strong>${safeOrg}</strong> on Merchiva as a <strong style="text-transform: capitalize;">${safeRole}</strong>.
        </p>
        <a href="${safeUrl}" style="display: inline-block; background: #1c1917; color: white; padding: 12px 24px; border-radius: 4px; text-decoration: none; font-weight: 600; font-size: 14px;">
          Accept Invitation
        </a>${phoneLine}
        <p style="color: #a8a29e; font-size: 13px; line-height: 1.5; margin: 24px 0 0;">
          This invitation expires in 7 days. If you didn't expect this email, you can safely ignore it.
        </p>
        <hr style="border: none; border-top: 1px solid #e7e5e4; margin: 32px 0 16px;" />
        <p style="color: #a8a29e; font-size: 12px; margin: 0;">
          Merchiva — AI-powered business management
        </p>
      </div>
    `,
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
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 20px;">
        <p style="color:#1c1917;font-size:15px;line-height:1.6;margin:0 0 16px;white-space:pre-wrap;">${safeBody}</p>
        <p style="color:#a8a29e;font-size:12px;line-height:1.5;margin:24px 0 0;">
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
  const greeting = ownerName ? `Good morning, ${ownerName}` : "Good morning";
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: `Today's briefing for ${orgName} is ready`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <div style="margin-bottom: 32px;">
          <div style="display: inline-block; background: #1c1917; color: white; width: 32px; height: 32px; text-align: center; line-height: 32px; border-radius: 4px; font-size: 14px; font-weight: bold;">⚡</div>
          <span style="margin-left: 8px; font-weight: 700; font-size: 16px; color: #1c1917;">Merchiva</span>
        </div>
        <h1 style="font-size: 22px; font-weight: 700; color: #1c1917; margin: 0 0 8px;">${greeting}.</h1>
        <p style="color: #57534e; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
          Mr. Merchiva has your morning briefing for <strong>${orgName}</strong> waiting — what needs attention today, plus a draft of next week's schedule if you haven't set one yet.
        </p>
        <a href="${dashboardUrl}" style="display: inline-block; background: #1c1917; color: white; padding: 12px 24px; border-radius: 4px; text-decoration: none; font-weight: 600; font-size: 14px;">
          Open dashboard
        </a>
        <p style="color: #a8a29e; font-size: 13px; line-height: 1.5; margin: 24px 0 0;">
          Don't want these reminders? Reply to this email and we'll turn them off.
        </p>
        <hr style="border: none; border-top: 1px solid #e7e5e4; margin: 32px 0 16px;" />
        <p style="color: #a8a29e; font-size: 12px; margin: 0;">
          Merchiva — AI-powered business management
        </p>
      </div>
    `,
  });
  if (error) {
    console.error("[email/morning-reminder] Resend error:", error);
    throw new Error(`Failed to send morning reminder: ${error.message}`);
  }
}
