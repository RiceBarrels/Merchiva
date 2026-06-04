import { Resend } from "resend";

const FROM = "Merchiva <onboarding@merchiva.com>";

// Escape user-supplied text before interpolating into email HTML.
function esc(s: string): string {
  return s.replace(/[<>&"']/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c] ?? c),
  );
}

export interface SupplierPOItem {
  name: string;
  quantity: number;
  unit?: string;
  unitCost?: number;
}

/**
 * Send a purchase-order request to a supplier on behalf of the org. The
 * supplier's reply goes to `replyTo` (the manager's address) — Phase 1 keeps a
 * human in the loop for the conversation. Throws on send failure so the caller
 * can fall back to saving a draft + escalating.
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
}) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const greeting = contactName ? `Hi ${esc(contactName)},` : `Hi ${esc(supplierName)},`;
  const rows = items
    .map((it) => {
      const qty = `${it.quantity}${it.unit ? " " + esc(it.unit) : ""}`;
      const line = it.unitCost != null ? `${currency}${(it.unitCost * it.quantity).toFixed(2)}` : "—";
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e7e5e4;font-size:14px;color:#1c1917;">${esc(it.name)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e7e5e4;font-size:14px;color:#57534e;text-align:right;">${esc(qty)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e7e5e4;font-size:14px;color:#57534e;text-align:right;">${line}</td>
        </tr>`;
    })
    .join("");
  const notesBlock = notes
    ? `<p style="color:#57534e;font-size:14px;line-height:1.6;margin:16px 0 0;"><strong style="color:#1c1917;">Notes:</strong> ${esc(notes)}</p>`
    : "";
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    ...(replyTo ? { replyTo } : {}),
    subject: `Purchase order from ${orgName}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <div style="margin-bottom: 32px;">
          <div style="display: inline-block; background: #1c1917; color: white; width: 32px; height: 32px; text-align: center; line-height: 32px; border-radius: 4px; font-size: 14px; font-weight: bold;">⚡</div>
          <span style="margin-left: 8px; font-weight: 700; font-size: 16px; color: #1c1917;">${esc(orgName)}</span>
        </div>
        <h1 style="font-size: 20px; font-weight: 700; color: #1c1917; margin: 0 0 8px;">Purchase order</h1>
        <p style="color: #57534e; font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
          ${greeting} we'd like to place the following order. Please confirm availability, pricing, and delivery time by replying to this email.
        </p>
        <table style="width:100%;border-collapse:collapse;border-top:1px solid #e7e5e4;">
          <thead>
            <tr>
              <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#a8a29e;border-bottom:1px solid #e7e5e4;">Item</th>
              <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#a8a29e;border-bottom:1px solid #e7e5e4;">Qty</th>
              <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#a8a29e;border-bottom:1px solid #e7e5e4;">Est. cost</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="color:#1c1917;font-size:15px;font-weight:600;margin:16px 0 0;text-align:right;">
          Estimated total: ${currency}${total.toFixed(2)}
        </p>
        ${notesBlock}
        <p style="color: #a8a29e; font-size: 13px; line-height: 1.5; margin: 28px 0 0;">
          Sent via Merchiva on behalf of ${esc(orgName)}. Reply to this email to confirm or discuss.
        </p>
        <hr style="border: none; border-top: 1px solid #e7e5e4; margin: 28px 0 16px;" />
        <p style="color: #a8a29e; font-size: 12px; margin: 0;">Merchiva — AI-powered business management</p>
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
  // Escape phone for safe HTML rendering since it comes from user input.
  const safePhone = phone
    ? phone.replace(/[<>&"']/g, (c) =>
        ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c] ?? c),
      )
    : null;
  const phoneLine = safePhone
    ? `
        <p style="color: #78716c; font-size: 13px; line-height: 1.5; margin: 16px 0 0;">
          We'll also keep <strong style="color: #1c1917;">${safePhone}</strong> on file for shift reminders once you join.
        </p>`
    : "";
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: `You're invited to join ${orgName} on Merchiva`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <div style="margin-bottom: 32px;">
          <div style="display: inline-block; background: #1c1917; color: white; width: 32px; height: 32px; text-align: center; line-height: 32px; border-radius: 4px; font-size: 14px; font-weight: bold;">⚡</div>
          <span style="margin-left: 8px; font-weight: 700; font-size: 16px; color: #1c1917;">Merchiva</span>
        </div>
        <h1 style="font-size: 22px; font-weight: 700; color: #1c1917; margin: 0 0 8px;">You're invited!</h1>
        <p style="color: #57534e; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
          <strong>${inviterEmail}</strong> has invited you to join <strong>${orgName}</strong> on Merchiva as a <strong style="text-transform: capitalize;">${role}</strong>.
        </p>
        <a href="${inviteUrl}" style="display: inline-block; background: #1c1917; color: white; padding: 12px 24px; border-radius: 4px; text-decoration: none; font-weight: 600; font-size: 14px;">
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
    from: FROM,
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
