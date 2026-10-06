import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
import rateLimit from 'express-rate-limit'

import authRoutes from './routes/auth'
import projectRoutes from './routes/projects'
import earlyWarningRoutes from './routes/earlyWarnings'
import riskRoutes from './routes/risks'
import ceRoutes from './routes/compensationEvents'
import noticeRoutes from './routes/notices'
import dashboardRoutes from './routes/dashboard'
import reportRoutes from './routes/reports'
import excelRoutes from './routes/excel'
import invitationRoutes, { publicRouter as publicInvitationRoutes } from './routes/invitations'
import commentRoutes from './routes/comments'
import documentRoutes from './routes/documents'
import myActionRoutes from './routes/myActions'
import businessRoutes from './routes/business'
import { sendOverdueNotifications } from './services/emailService'

dotenv.config()

const app = express()

// On Vercel the filesystem is read-only except /tmp; only create a local
// uploads dir when running on a traditional always-on host.
if (!process.env.VERCEL) {
  const uploadDir = path.join(__dirname, '..', 'uploads')
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })
}

// Running behind a reverse proxy (Vercel/Render/Railway) - needed for
// correct client IPs in rate limiting and audit logs
app.set('trust proxy', 1)

app.use(helmet())
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}))
app.use(morgan('dev'))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Global API rate limit (stricter per-endpoint limits live on the auth routes)
app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
}))

// NOTE: uploaded documents are served through the authenticated
// /api/projects/:projectId/documents/:docId/download endpoint, never statically.

app.use('/api/auth', authRoutes)
app.use('/api/me', myActionRoutes)
app.use('/api/projects', projectRoutes)
app.use('/api/projects', earlyWarningRoutes)
app.use('/api/projects', riskRoutes)
app.use('/api/projects', ceRoutes)
app.use('/api/projects', noticeRoutes)
app.use('/api/projects', dashboardRoutes)
app.use('/api/projects', reportRoutes)
app.use('/api/projects', excelRoutes)
app.use('/api/projects', invitationRoutes)
app.use('/api/projects', commentRoutes)
app.use('/api/projects', documentRoutes)
app.use('/api/invitations', publicInvitationRoutes)
app.use('/api/business', businessRoutes)

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Live DB connectivity check - lets us test credentials in seconds without a
// rebuild. Reports only the Prisma error code + high-level meaning, no secrets.
app.get('/api/health/db', async (_req, res) => {
  const prisma = (await import('./config/database')).default
  try {
    await prisma.$queryRaw`SELECT 1`
    // Touch every table added by a migration so a half-applied schema shows up
    // here rather than as a mysterious 500 the first time a user clicks around.
    const [users, comments, drawings] = await Promise.all([
      prisma.user.count(),
      prisma.comment.count(),
      prisma.document.count({ where: { category: 'DRAWING' } }),
    ])
    res.json({ db: 'ok', schema: 'ok', seededUsers: users, comments, drawings })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    const code = err.code ?? 'UNKNOWN'
    const hints: Record<string, string> = {
      P1000: 'Authentication failed - the password in DATABASE_URL does not match the database.',
      P1001: 'Cannot reach the database server - host/port wrong or project paused.',
      P2021: 'Connected, but tables are missing - migrations have not run.',
    }
    res.status(500).json({ db: 'error', code, hint: hints[code] ?? (err.message ?? '').split('\n')[0].slice(0, 200) })
  }
})

// NEC deadline clock endpoint - triggered by Vercel Cron (serverless has no
// always-on process for node-cron). Vercel Cron sends a GET with an
// Authorization: Bearer <CRON_SECRET> header when CRON_SECRET is configured.
const runOverdueCron = async (req: express.Request, res: express.Response): Promise<void> => {
  const secret = process.env.CRON_SECRET
  const provided = req.headers.authorization?.replace('Bearer ', '') || (req.query.secret as string)
  if (secret && provided !== secret) { res.status(401).json({ message: 'Unauthorized' }); return }
  try {
    await sendOverdueNotifications()
    res.json({ status: 'ok', ran: new Date().toISOString() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Cron failed' })
  }
}
app.get('/api/cron/overdue', runOverdueCron)
app.post('/api/cron/overdue', runOverdueCron)

// SMTP diagnostic - sends a test email and returns the provider's verbatim
// error, so email delivery problems can be checked from production in seconds.
// Guarded by CRON_SECRET (same pattern as the cron endpoint) and disabled
// entirely when CRON_SECRET is not configured, so it can never be abused as an
// open relay.
app.get('/api/health/email', async (req, res) => {
  const secret = process.env.CRON_SECRET
  if (!secret) { res.status(403).json({ message: 'Set CRON_SECRET to enable this diagnostic' }); return }
  const provided = req.headers.authorization?.replace('Bearer ', '') || (req.query.secret as string)
  if (provided !== secret) { res.status(401).json({ message: 'Unauthorized' }); return }

  const to = String(req.query.to || '')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { res.status(400).json({ message: 'Provide ?to=you@example.com' }); return }

  const config = {
    host: process.env.SMTP_HOST || 'smtp.resend.com (default)',
    port: Number(process.env.SMTP_PORT) || 587,
    from: process.env.SMTP_FROM || '(missing - falls back to SMTP_USER)',
    smtpUserSet: Boolean(process.env.SMTP_USER),
    smtpPassSet: Boolean(process.env.SMTP_PASS),
  }
  try {
    const { sendTestEmail } = await import('./services/emailService')
    const result = await sendTestEmail(to)
    res.json({ ok: true, config, result })
  } catch (e) {
    const err = e as { message?: string; code?: string; response?: string; command?: string }
    res.status(502).json({ ok: false, config, error: { message: err.message, code: err.code, command: err.command, response: err.response } })
  }
})

export default app
