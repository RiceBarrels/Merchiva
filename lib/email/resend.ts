import { Resend } from "resend";

const FROM = "Merchiva <onboarding@depxtech.com>";

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
