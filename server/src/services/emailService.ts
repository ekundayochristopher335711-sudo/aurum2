import nodemailer from 'nodemailer'
import prisma from '../config/database'

// SMTP provider. Production uses Resend (smtp.resend.com); local dev may use
// anything else. Port 465 speaks implicit TLS; 587 uses STARTTLS, which needs
// secure:false — so the flag is derived from the port, never hardcoded.
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.resend.com',
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

const emailConfigured = () => Boolean(process.env.SMTP_USER && process.env.SMTP_PASS)

// With Resend the SMTP username is the literal string "resend" and the password
// is an API key, so the sender address cannot be derived from SMTP_USER.
// SMTP_FROM carries the verified sender (e.g. notifications@aurumite.com);
// falling back to SMTP_USER keeps Gmail-style setups working unchanged.
const FROM = () => process.env.SMTP_FROM
  ? `"Aurum Project Controls" <${process.env.SMTP_FROM}>`
  : `"Aurum Project Controls" <${process.env.SMTP_USER}>`

// Diagnostic helper: sends a plain test message so SMTP problems surface with
// the provider's exact error instead of dying silently inside a
// fire-and-forget notification. Used by scripts/test-email.ts and the
// CRON_SECRET-guarded /api/health/email diagnostic endpoint.
export async function sendTestEmail(to: string) {
  if (!emailConfigured()) {
    throw new Error('SMTP not configured - set SMTP_USER and SMTP_PASS')
  }
  const info = await transporter.sendMail({
    from: FROM(),
    to,
    subject: 'Aurum - test email',
    text: `SMTP test sent ${new Date().toISOString()} from ${FROM()}`,
    html: shell(
      `<h3 style="color:#080F1C;font-size:18px;margin:0 0 8px">It works</h3>` +
      `<p style="color:#6B7280;margin:0;font-size:14px">Test email sent at ${new Date().toISOString()}. Invitations, password resets and deadline alerts will arrive from this address too.</p>`,
    ),
  })
  return { messageId: info.messageId, response: info.response, accepted: info.accepted, rejected: info.rejected }
}


function shell(inner: string): string {
  // Logo is served from the live site; hardcoding the production domain as a
  // fallback keeps the banner branded even in local dev (where CLIENT_URL is
  // localhost). Email clients block remote images until "show images" is
  // clicked, so the banner still reads fine without it.
  const logoUrl = `${(process.env.CLIENT_URL || 'https://aurumite.com').replace(/\/$/, '')}/logo-light.png`
  return `
    <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#080F1C;padding:20px 24px;border-radius:8px 8px 0 0">
        <img src="${logoUrl}" alt="Aurum" width="44" height="44" style="display:block;border:0;border-radius:8px;margin:0 0 10px" />
        <h2 style="color:#FFFFFF;margin:0;font-size:18px">Aurum Project Controls</h2>
        <p style="color:#FBBF24;margin:4px 0 0;font-size:12px">NEC Contract Workflow Engine</p>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 8px 8px">
        ${inner}
      </div>
    </div>`
}

// Daily NEC deadline clock: alerts for CEs already overdue AND CEs due within 3 days
export async function sendOverdueNotifications() {
  if (!emailConfigured()) return

  const now = new Date()
  const soon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
  const dueCEs = await prisma.compensationEvent.findMany({
    where: {
      status: { not: 'CLOSED' },
      // Completed projects are archived - no more reminder emails
      project: { isActive: true },
      OR: [
        { dateResponseDue: { lt: soon } },
        // cl. 62.3 quotation clock - runs while the CE awaits a quotation
        { status: 'NOTIFIED', dateQuotationDue: { lt: soon } },
      ],
    },
    include: {
      project: { select: { name: true } },
    },
  })

  if (dueCEs.length === 0) return

  const projects = await prisma.project.findMany({
    where: { id: { in: [...new Set(dueCEs.map((ce) => ce.projectId))] } },
    include: { members: { include: { user: { select: { email: true, name: true, notifyContractEvents: true } } } } },
  })

  for (const project of projects) {
    const projectCEs = dueCEs.filter((ce) => ce.projectId === project.id)
    const overdue = projectCEs.filter((ce) => ce.dateResponseDue && ce.dateResponseDue < now && ce.dateResponseDue < soon)
    const dueSoon = projectCEs.filter((ce) => ce.dateResponseDue && ce.dateResponseDue >= now && ce.dateResponseDue < soon)
    const quotationDue = projectCEs.filter((ce) => ce.status === 'NOTIFIED' && ce.dateQuotationDue && ce.dateQuotationDue < soon)
    const recipients = project.members
      .filter((m) => m.role !== 'VIEWER' && m.user.notifyContractEvents)
      .map((m) => m.user.email)

    if (recipients.length === 0) continue

    const rows = (list: typeof projectCEs, color: string, dateOf: (ce: typeof projectCEs[number]) => Date | null) => list.map((ce) => `
      <tr>
        <td style="padding:8px;border:1px solid #E2E8F0;font-size:12px;font-weight:bold">${ce.ceNumber}</td>
        <td style="padding:8px;border:1px solid #E2E8F0;font-size:12px">${ce.title}</td>
        <td style="padding:8px;border:1px solid #E2E8F0;font-size:12px;color:${color}">${dateOf(ce)?.toLocaleDateString('en-GB')}</td>
        <td style="padding:8px;border:1px solid #E2E8F0;font-size:12px">${ce.status}</td>
      </tr>`).join('')

    const table = (title: string, list: typeof projectCEs, color: string, dateOf: (ce: typeof projectCEs[number]) => Date | null = (ce) => ce.dateResponseDue) => list.length === 0 ? '' : `
      <h3 style="color:#0F172A;margin-top:16px">${title}</h3>
      <table style="width:100%;border-collapse:collapse">
        <tr style="background:#F8FAFC">
          <th style="padding:8px;text-align:left;border:1px solid #E2E8F0;font-size:12px">CE No.</th>
          <th style="padding:8px;text-align:left;border:1px solid #E2E8F0;font-size:12px">Title</th>
          <th style="padding:8px;text-align:left;border:1px solid #E2E8F0;font-size:12px">Due Date</th>
          <th style="padding:8px;text-align:left;border:1px solid #E2E8F0;font-size:12px">Status</th>
        </tr>
        ${rows(list, color, dateOf)}
      </table>`

    await transporter.sendMail({
      from: FROM(),
      to: recipients.join(', '),
      subject: `[ACTION REQUIRED] ${overdue.length} overdue / ${dueSoon.length + quotationDue.length} due soon - ${project.name}`,
      html: shell(`
        ${table(`⚠️ Overdue Compensation Events - ${project.name}`, overdue, '#DC2626')}
        ${table('⏳ Response due within 3 days', dueSoon, '#D97706')}
        ${table('📋 Quotation due (NEC cl. 62.3)', quotationDue, '#B45309', (ce) => ce.dateQuotationDue)}
        <p style="margin-top:20px"><a href="${process.env.CLIENT_URL}" style="background:#B45309;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px">Open Aurum Project Controls</a></p>
      `),
    })
  }
}

export async function sendCEStatusChangeNotification(
  ceNumber: string,
  ceTitle: string,
  projectName: string,
  oldStatus: string,
  newStatus: string,
  changedBy: string,
  recipientEmails: string[],
) {
  if (!emailConfigured() || recipientEmails.length === 0) return

  await transporter.sendMail({
    from: FROM(),
    to: recipientEmails.join(', '),
    subject: `CE Status Update: ${ceNumber} → ${newStatus} - ${projectName}`,
    html: shell(`
      <h3>${ceNumber} status updated</h3>
      <p><strong>Project:</strong> ${projectName}</p>
      <p><strong>CE:</strong> ${ceTitle}</p>
      <p><strong>Status change:</strong> <span style="color:#64748B">${oldStatus}</span> → <span style="color:#16A34A;font-weight:bold">${newStatus}</span></p>
      <p><strong>Changed by:</strong> ${changedBy}</p>
    `),
  })
}

export async function sendInvitationEmail(
  email: string,
  inviterName: string,
  projectName: string,
  role: string,
  inviteUrl: string,
) {
  if (!emailConfigured()) return

  await transporter.sendMail({
    from: FROM(),
    to: email,
    subject: `You've been invited to ${projectName} - Aurum Project Controls`,
    html: shell(`
      <h3 style="color:#080F1C;font-size:20px;margin:0 0 8px">You're invited</h3>
      <p style="color:#6B7280;margin:0 0 24px;font-size:14px">
        <strong>${inviterName}</strong> has invited you to join
        <strong>${projectName}</strong> as a <strong>${role.replace('_', ' ')}</strong>.
      </p>
      <table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#B45309" style="border-radius:8px"><a href="${inviteUrl}" target="_blank" style="display:inline-block;padding:12px 28px;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;color:#FFFFFF;text-decoration:none">Accept Invitation</a></td></tr></table>
      <p style="color:#9CA3AF;font-size:12px;margin:24px 0 0">
        This invitation expires in 7 days. If you weren't expecting this, you can ignore this email.
      </p>
      <p style="color:#D1D5DB;font-size:11px;margin:8px 0 0">
        Or copy this link: ${inviteUrl}
      </p>
    `),
  })
}

// Contract events are legally significant - an unnoticed one costs money - so
// these go to every project member who hasn't opted out.
export async function notifyContractEvent(opts: {
  projectId: string
  excludeUserId?: string
  heading: string
  reference: string
  subject: string
  fields: Array<[string, string]>
  note?: string
}) {
  if (!emailConfigured()) return

  const project = await prisma.project.findUnique({
    where: { id: opts.projectId },
    include: { members: { include: { user: { select: { id: true, email: true, notifyContractEvents: true } } } } },
  })
  if (!project) return

  const recipients = project.members
    .filter((m) => m.user.id !== opts.excludeUserId && m.user.notifyContractEvents)
    .map((m) => m.user.email)
  if (recipients.length === 0) return

  const rows = opts.fields.map(([label, value]) => `
    <tr>
      <td style="padding:6px 12px 6px 0;font-size:13px;color:#6B7280;white-space:nowrap">${label}</td>
      <td style="padding:6px 0;font-size:13px;color:#0F1F4B;font-weight:bold">${value || '-'}</td>
    </tr>`).join('')

  await transporter.sendMail({
    from: FROM(),
    to: recipients.join(', '),
    subject: `${opts.heading}: ${opts.reference} - ${project.name}`,
    html: shell(`
      <h3 style="color:#080F1C;font-size:18px;margin:0 0 4px">${opts.heading}</h3>
      <p style="color:#6B7280;margin:0 0 16px;font-size:13px">${project.name}</p>
      <p style="font-size:15px;color:#0F1F4B;font-weight:bold;margin:0 0 12px">${opts.subject}</p>
      <table style="border-collapse:collapse">${rows}</table>
      ${opts.note ? `<p style="color:#B45309;font-size:13px;margin-top:16px">${opts.note}</p>` : ''}
      <p style="margin-top:20px">
        <table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#B45309" style="border-radius:8px">
          <a href="${process.env.CLIENT_URL}" target="_blank" style="display:inline-block;padding:11px 26px;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;color:#FFFFFF;text-decoration:none">Open Aurum</a>
        </td></tr></table>
      </p>
    `),
  })
}

// Activity notification: someone commented on the project or a record in it
export async function sendCommentNotification(opts: {
  recipients: string[]
  projectName: string
  on: string
  authorName: string
  body: string
}) {
  if (!emailConfigured() || opts.recipients.length === 0) return

  const excerpt = opts.body.length > 600 ? `${opts.body.slice(0, 600)}…` : opts.body
  const escaped = excerpt
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')

  await transporter.sendMail({
    from: FROM(),
    to: opts.recipients.join(', '),
    subject: `New comment on ${opts.on} - ${opts.projectName}`,
    html: shell(`
      <h3 style="color:#080F1C;font-size:18px;margin:0 0 4px">New comment</h3>
      <p style="color:#6B7280;margin:0 0 16px;font-size:13px">
        <strong>${opts.authorName}</strong> commented on <strong>${opts.on}</strong> in ${opts.projectName}.
      </p>
      <div style="border-left:3px solid #B45309;background:#F8FAFC;padding:12px 16px;color:#334155;font-size:14px;line-height:1.5">
        ${escaped}
      </div>
      <p style="margin-top:20px">
        <table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#B45309" style="border-radius:8px">
          <a href="${process.env.CLIENT_URL}" target="_blank" style="display:inline-block;padding:11px 26px;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;color:#FFFFFF;text-decoration:none">Open Aurum</a>
        </td></tr></table>
      </p>
    `),
  })
}

export async function sendPasswordResetEmail(email: string, name: string, token: string) {
  if (!emailConfigured()) return

  const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password/${token}`
  await transporter.sendMail({
    from: FROM(),
    to: email,
    subject: 'Reset your password - Aurum Project Controls',
    html: shell(`
      <h3 style="color:#080F1C;font-size:20px;margin:0 0 8px">Password reset</h3>
      <p style="color:#6B7280;margin:0 0 24px;font-size:14px">
        Hi ${name}, we received a request to reset your password. This link expires in 1 hour.
      </p>
      <table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#B45309" style="border-radius:8px"><a href="${resetUrl}" target="_blank" style="display:inline-block;padding:12px 28px;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;color:#FFFFFF;text-decoration:none">Reset Password</a></td></tr></table>
      <p style="color:#9CA3AF;font-size:12px;margin:24px 0 0">
        If you didn't request this, you can safely ignore this email - your password will not change.
      </p>
      <p style="color:#D1D5DB;font-size:11px;margin:8px 0 0">
        Or copy this link: ${resetUrl}
      </p>
    `),
  })
}

export async function sendQuoteReceivedEmail(to: string, clientName: string, projectName: string) {
  if (!emailConfigured()) return
  await transporter.sendMail({
    from: FROM(), to,
    subject: 'Aurum Project Controls - We have received your project information',
    html: shell(`
      <h3 style="color:#080F1C;font-size:20px;margin:0 0 8px">Thank you, ${clientName}</h3>
      <p style="color:#475569;font-size:14px;line-height:1.6">We have received the information and documents for <strong>${projectName}</strong> and are reviewing them.</p>
      <p style="color:#475569;font-size:14px;line-height:1.6">We will review the scope, programme and information supplied and come back to you with the agreed deliverables, programme and fixed fee.</p>
    `),
  })
}

export async function sendQuoteInternalEmail(opts: { id: string; name: string; company: string; email: string; projectName: string; service: string; tenderDeadline?: Date | null; documents: string[] }) {
  if (!emailConfigured()) return
  const to = process.env.SALES_EMAIL || process.env.SMTP_FROM || process.env.SMTP_USER
  if (!to) return
  await transporter.sendMail({
    from: FROM(), to,
    subject: `New Aurum quote request - ${opts.projectName}`,
    html: shell(`
      <h3 style="color:#080F1C;font-size:20px;margin:0 0 12px">New project enquiry</h3>
      <table style="border-collapse:collapse;font-size:14px">
        <tr><td style="padding:5px 18px 5px 0;color:#64748B">Client</td><td>${opts.name}</td></tr>
        <tr><td style="padding:5px 18px 5px 0;color:#64748B">Company</td><td>${opts.company}</td></tr>
        <tr><td style="padding:5px 18px 5px 0;color:#64748B">Email</td><td>${opts.email}</td></tr>
        <tr><td style="padding:5px 18px 5px 0;color:#64748B">Project</td><td>${opts.projectName}</td></tr>
        <tr><td style="padding:5px 18px 5px 0;color:#64748B">Service</td><td>${opts.service}</td></tr>
        <tr><td style="padding:5px 18px 5px 0;color:#64748B">Tender deadline</td><td>${opts.tenderDeadline ? opts.tenderDeadline.toLocaleDateString('en-GB') : 'Not supplied'}</td></tr>
        <tr><td style="padding:5px 18px 5px 0;color:#64748B">Documents</td><td>${opts.documents.length ? opts.documents.join(', ') : 'None'}</td></tr>
      </table>
      <p style="margin-top:18px;color:#64748B;font-size:12px">Quote request ID: ${opts.id}</p>
    `),
  })
}
