import express from 'express'
import multer from 'multer'
import ExcelJS from 'exceljs'
import { randomUUID } from 'crypto'
import prisma from '../config/database'
import { authenticate, AuthRequest } from '../middleware/auth'
import { sendQuoteReceivedEmail, sendQuoteInternalEmail } from '../services/emailService'

const router = express.Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 6 } })
const serviceMap: Record<string, any> = {
  'Take-off': 'TAKE_OFF', Estimate: 'ESTIMATE', 'Tender support': 'TENDER_SUPPORT',
  'Commercial support': 'COMMERCIAL_SUPPORT', 'Bill of Quantities': 'BOQ', Variation: 'VARIATION', Valuation: 'VALUATION', Other: 'OTHER',
}

function asDate(value: unknown): Date | undefined {
  if (!value) return undefined
  const d = new Date(String(value))
  return Number.isNaN(d.getTime()) ? undefined : d
}

async function nextInvoiceNumber() {
  const year = new Date().getFullYear()
  const row = await prisma.invoiceSequence.upsert({ where: { id: 1 }, create: { id: 1, current: 1 }, update: { current: { increment: 1 } } })
  return `AUR-INV-${year}-${String(row.current).padStart(3, '0')}`
}

// Public Layer 1 intake: this is the new front door for the business.
router.post('/quote-requests', upload.fields([
  { name: 'drawings', maxCount: 3 },
  { name: 'specification', maxCount: 1 },
  { name: 'boq', maxCount: 1 },
]), async (req, res): Promise<void> => {
  try {
    const { name, company, email, telephone, projectName, projectLocation, service, tenderDeadline, briefDescription } = req.body
    if (!name || !company || !email || !projectName || !service) {
      res.status(400).json({ message: 'Name, company, email, project name and service are required.' }); return
    }
    const normalizedService = serviceMap[service] || service
    if (!Object.values(serviceMap).includes(normalizedService)) { res.status(400).json({ message: 'Invalid service.' }); return }

    const files = req.files as Record<string, Express.Multer.File[]> | undefined
    const quote = await prisma.quoteRequest.create({
      data: {
        name: String(name).trim(), company: String(company).trim(), email: String(email).trim().toLowerCase(),
        telephone: telephone ? String(telephone).trim() : null, projectName: String(projectName).trim(),
        projectLocation: projectLocation ? String(projectLocation).trim() : null,
        service: normalizedService, tenderDeadline: asDate(tenderDeadline), briefDescription: briefDescription ? String(briefDescription).trim() : null,
        documents: {
          create: Object.entries(files || {}).flatMap(([kind, list]) => (list || []).map((f) => ({
            kind, name: f.originalname, mimeType: f.mimetype, size: f.size, data: f.buffer,
          }))),
        },
      }, include: { documents: { select: { name: true, kind: true } } },
    })

    await Promise.allSettled([
      sendQuoteReceivedEmail(quote.email, quote.name, quote.projectName),
      sendQuoteInternalEmail({ id: quote.id, name: quote.name, company: quote.company, email: quote.email, projectName: quote.projectName, service: normalizedService, tenderDeadline: quote.tenderDeadline, documents: quote.documents.map(d => d.name) }),
    ])
    res.status(201).json({ id: quote.id, message: 'Your project information has been received and is now under review.' })
  } catch (e) {
    console.error(e); res.status(500).json({ message: 'We could not receive the submission. Please try again or email the project information.' })
  }
})

router.get('/quotes', authenticate, async (req: AuthRequest, res): Promise<void> => {
  if (req.user?.role !== 'ADMIN' && req.user?.role !== 'COMMERCIAL_MANAGER') { res.status(403).json({ message: 'Access denied' }); return }
  const quotes = await prisma.quoteRequest.findMany({ orderBy: [{ status: 'asc' }, { tenderDeadline: 'asc' }, { createdAt: 'desc' }], include: { documents: { select: { id: true, name: true, kind: true, size: true } }, invoices: true } })
  res.json(quotes)
})

router.get('/quotes/:id', authenticate, async (req: AuthRequest, res): Promise<void> => {
  if (req.user?.role !== 'ADMIN' && req.user?.role !== 'COMMERCIAL_MANAGER') { res.status(403).json({ message: 'Access denied' }); return }
  const quote = await prisma.quoteRequest.findUnique({ where: { id: req.params.id }, include: { documents: true, invoices: true } })
  if (!quote) { res.status(404).json({ message: 'Job not found' }); return }
  res.json(quote)
})

router.patch('/quotes/:id', authenticate, async (req: AuthRequest, res): Promise<void> => {
  if (req.user?.role !== 'ADMIN' && req.user?.role !== 'COMMERCIAL_MANAGER') { res.status(403).json({ message: 'Access denied' }); return }
  const allowed = ['status', 'requiredDelivery', 'fee', 'notes', 'clientRequirements', 'requiredTrades', 'missingInformation']
  const data: Record<string, unknown> = {}
  for (const key of allowed) if (req.body[key] !== undefined) data[key] = req.body[key]
  if (data.requiredDelivery) data.requiredDelivery = asDate(data.requiredDelivery)
  if (data.fee !== undefined) data.fee = Number(data.fee)
  const quote = await prisma.quoteRequest.update({ where: { id: req.params.id }, data })
  res.json(quote)
})

router.post('/quotes/:id/invoice', authenticate, async (req: AuthRequest, res): Promise<void> => {
  if (req.user?.role !== 'ADMIN' && req.user?.role !== 'COMMERCIAL_MANAGER') { res.status(403).json({ message: 'Access denied' }); return }
  const quote = await prisma.quoteRequest.findUnique({ where: { id: req.params.id } })
  if (!quote) { res.status(404).json({ message: 'Job not found' }); return }
  const amount = Number(req.body.amount ?? quote.fee ?? 0)
  if (!(amount > 0)) { res.status(400).json({ message: 'Enter a fee greater than zero before creating the invoice.' }); return }
  const vatRate = req.body.vatRate === '' || req.body.vatRate === undefined ? null : Number(req.body.vatRate)
  const vatAmount = vatRate === null ? 0 : amount * vatRate / 100
  const invoice = await prisma.invoice.create({ data: {
    invoiceNumber: await nextInvoiceNumber(), quoteId: quote.id, clientName: quote.name, company: quote.company, email: quote.email,
    projectName: quote.projectName, description: String(req.body.description || `Aurum Project Controls - ${quote.projectName}`), amount,
    vatRate, vatAmount, total: amount + vatAmount, dueDate: asDate(req.body.dueDate), notes: req.body.notes || null,
  } })
  res.status(201).json(invoice)
})

router.get('/invoices/:invoiceNumber', async (req, res): Promise<void> => {
  const invoice = await prisma.invoice.findUnique({ where: { invoiceNumber: req.params.invoiceNumber }, select: { invoiceNumber: true, clientName: true, company: true, email: true, projectName: true, description: true, amount: true, vatRate: true, vatAmount: true, total: true, currency: true, status: true, dueDate: true, paymentUrl: true } })
  if (!invoice) { res.status(404).json({ message: 'Invoice not found' }); return }
  res.json(invoice)
})

router.post('/invoices/:invoiceNumber/checkout', async (req, res): Promise<void> => {
  const invoice = await prisma.invoice.findUnique({ where: { invoiceNumber: req.params.invoiceNumber } })
  if (!invoice) { res.status(404).json({ message: 'Invoice not found' }); return }
  if (invoice.status === 'PAID') { res.status(400).json({ message: 'This invoice has already been paid.' }); return }
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    res.status(503).json({ message: 'Online card payment is not configured yet. Please use the payment details supplied by Aurum.' }); return
  }
  try {
    const params = new URLSearchParams()
    params.set('mode', 'payment')
    params.set('success_url', `${process.env.CLIENT_URL || 'http://localhost:5173'}/payment/${invoice.invoiceNumber}?paid=1&session_id={CHECKOUT_SESSION_ID}`)
    params.set('cancel_url', `${process.env.CLIENT_URL || 'http://localhost:5173'}/payment/${invoice.invoiceNumber}`)
    params.set('customer_email', invoice.email)
    params.set('line_items[0][price_data][currency]', invoice.currency.toLowerCase())
    params.set('line_items[0][price_data][product_data][name]', `Aurum Project Controls - ${invoice.projectName}`)
    params.set('line_items[0][price_data][product_data][description]', invoice.description)
    params.set('line_items[0][price_data][unit_amount]', String(Math.round(invoice.total * 100)))
    params.set('line_items[0][quantity]', '1')
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: params })
    const session = await response.json() as { id?: string, url?: string, error?: { message?: string } }
    if (!response.ok || !session.url) { res.status(502).json({ message: session.error?.message || 'Payment provider error.' }); return }
    await prisma.invoice.update({ where: { id: invoice.id }, data: { stripeSession: session.id, paymentUrl: session.url, status: 'PAYMENT_PENDING' } })
    res.json({ url: session.url })
  } catch { res.status(502).json({ message: 'Could not connect to the payment provider.' }) }
})

router.post('/invoices/:invoiceNumber/verify', async (req, res): Promise<void> => {
  const invoice = await prisma.invoice.findUnique({ where: { invoiceNumber: req.params.invoiceNumber } })
  if (!invoice) { res.status(404).json({ message: 'Invoice not found' }); return }
  if (invoice.status === 'PAID') { res.json({ paid: true }); return }
  const key = process.env.STRIPE_SECRET_KEY
  const sessionId = String(req.body.sessionId || invoice.stripeSession || '')
  if (!key || !sessionId) { res.json({ paid: false }); return }
  try {
    const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, { headers: { Authorization: `Bearer ${key}` } })
    const session = await response.json() as { payment_status?: string }
    if (response.ok && session.payment_status === 'paid') {
      await prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'PAID' } })
      res.json({ paid: true }); return
    }
    res.json({ paid: false })
  } catch { res.json({ paid: false }) }
})

router.get('/sales.xlsx', authenticate, async (req: AuthRequest, res): Promise<void> => {
  if (req.user?.role !== 'ADMIN' && req.user?.role !== 'COMMERCIAL_MANAGER') { res.status(403).json({ message: 'Access denied' }); return }
  const invoices = await prisma.invoice.findMany({ orderBy: { createdAt: 'desc' } })
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Sales')
  ws.columns = [
    { header: 'Invoice', key: 'invoice', width: 20 }, { header: 'Date', key: 'date', width: 14 }, { header: 'Client', key: 'client', width: 24 },
    { header: 'Company', key: 'company', width: 24 }, { header: 'Project', key: 'project', width: 30 }, { header: 'Description', key: 'description', width: 40 },
    { header: 'Amount', key: 'amount', width: 14 }, { header: 'VAT', key: 'vat', width: 14 }, { header: 'Total', key: 'total', width: 14 }, { header: 'Status', key: 'status', width: 18 },
  ]
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }
  invoices.forEach(i => ws.addRow({ invoice: i.invoiceNumber, date: i.createdAt.toISOString().slice(0,10), client: i.clientName, company: i.company || '', project: i.projectName, description: i.description, amount: i.amount, vat: i.vatAmount || 0, total: i.total, status: i.status }))
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Content-Disposition', 'attachment; filename="aurum-sales.xlsx"')
  await wb.xlsx.write(res); res.end()
})

export default router
