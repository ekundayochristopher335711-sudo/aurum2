import PDFDocument from 'pdfkit'
import { Response } from 'express'
import { LOGO_BASE64 } from '../assets/logoBase64'

const GOLD = '#B45309'
const NAVY = '#0F1F4B'
const SLATE = '#3D4E6B'
const MUTED = '#5C6B84'
const RULE = '#C9D3E3'
const BODY = '#243044'

// UK date (DD/MM/YYYY) - empty for missing values, so nothing renders as N/A
function fmtDate(value: unknown): string {
  if (!value) return ''
  const d = new Date(value as string)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB')
}

// £27,500,000.00 - UK grouping, two decimals (master template §15)
function fmtMoney(n: number): string {
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// OPEN -> Open, COMPENSATION_EVENT -> Compensation Event (display only - the
// stored data is never altered)
function humanize(value: unknown): string {
  const s = String(value ?? '').trim()
  if (!s) return ''
  return s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

// A value that must never reach the page (§5: never show N/A, null, undefined
// or dashes - the field is omitted instead)
function cleanValue(value: unknown): string {
  const s = String(value ?? '').trim()
  if (!s) return ''
  if (['N/A', 'n/a', '-', '—', 'null', 'undefined', 'TBC', 'None', 'Not specified'].includes(s)) return ''
  return s
}

const LOGO = Buffer.from(LOGO_BASE64, 'base64')

type Doc = InstanceType<typeof PDFDocument>

export interface ProjectMeta {
  name: string
  clientName?: string | null
  contractorName?: string | null
  contractType?: string | null
}

// Downloads are named after the project so they file correctly off-system:
// "Extension-of-ARI-N-001.pdf"
export function fileNameFor(project: ProjectMeta | string, ref: string, ext = 'pdf'): string {
  const name = typeof project === 'string' ? project : project.name
  const safe = (name || 'Project')
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
  return `${safe}-${ref}.${ext}`
}

const asMeta = (p: ProjectMeta | string): ProjectMeta => (typeof p === 'string' ? { name: p } : p)

// Company letterhead: platform identity left, contact block right (§2).
// The project itself lives in the banner below. Returns the y position where
// the project banner should begin.
function addLetterhead(doc: Doc, project: ProjectMeta): number {
  const left = 40
  const right = doc.page.width - 40

  try {
    doc.image(LOGO, left, 34, { fit: [50, 50] })
  } catch {
    // A missing/corrupt logo must never break a contractual document
  }

  const textX = left + 62
  doc.font('Helvetica-Bold').fontSize(19).fillColor(NAVY)
    .text('AURUM', textX, 36, { lineBreak: false, characterSpacing: 2 })
  doc.font('Helvetica').fontSize(8).fillColor(SLATE)
    .text('PROJECT CONTROLS', textX, 57, { lineBreak: false, characterSpacing: 2.2 })
  doc.font('Helvetica').fontSize(6.5).fillColor(MUTED)
    .text('NEC DEADLINES, NEVER MISSED', textX, 70, { lineBreak: false, characterSpacing: 1.2 })

  // Subtle vertical separator between identity and contact block
  const divX = doc.page.width / 2 + 20
  doc.moveTo(divX, 36).lineTo(divX, 88).lineWidth(0.75).strokeColor(RULE).stroke()

  // Contact block - real platform details only, never invented ones (§15)
  const contactX = divX + 12
  doc.font('Helvetica').fontSize(7.8).fillColor(SLATE)
  doc.text('notifications@aurumite.com', contactX, 38, { width: right - contactX, align: 'right', lineBreak: false })
  doc.text('www.aurumite.com', contactX, 50, { width: right - contactX, align: 'right', lineBreak: false })
  doc.font('Helvetica').fontSize(7).fillColor(MUTED)
  doc.text('NEC3 & NEC4 Contract Administration', contactX, 66, { width: right - contactX, align: 'right', lineBreak: false })

  // Double rule - the traditional letterhead divider
  doc.moveTo(left, 98).lineTo(right, 98).lineWidth(2).strokeColor(NAVY).stroke()
  doc.moveTo(left, 102).lineTo(right, 102).lineWidth(0.75).strokeColor(GOLD).stroke()
  doc.lineWidth(1)

  return 114
}

// Project information bar - full-width navy band directly under the
// letterhead, identical on every exported document type (§3, §17).
function addProjectBanner(doc: Doc, project: ProjectMeta): void {
  const left = 40
  const width = doc.page.width - 80
  const y = doc.y
  const height = 56
  doc.rect(left, y, width, height).fill(NAVY)
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#FFFFFF')
    .text(project.name || 'Project', left + 14, y + 9, { width: width - 28, lineBreak: false })
  const line2 = [
    project.clientName ? `Client: ${project.clientName}` : '',
    project.contractorName ? `Contractor: ${project.contractorName}` : '',
    project.contractType ? `Contract: ${project.contractType}` : '',
  ].filter(Boolean).join('    |    ')
  if (line2) {
    doc.font('Helvetica').fontSize(8.5).fillColor('#C7D2E8')
      .text(line2, left + 14, y + 33, { width: width - 28, lineBreak: false })
  }
  doc.y = y + height + 16
}

// Simplified continuation header for page 2+ (§10) - never the full letterhead.
function addContinuationHeader(doc: Doc, project: ProjectMeta, docType?: string, reference?: string): void {
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(NAVY)
    .text('AURUM PROJECT CONTROLS', 40, 38, { lineBreak: false, characterSpacing: 1.2 })
  const line2 = [
    project.name || 'Project',
    docType,
    reference ? `Reference: ${reference}` : '',
  ].filter(Boolean).join('   |   ')
  doc.font('Helvetica').fontSize(7.8).fillColor(MUTED)
    .text(line2, 40, 50, { width: doc.page.width - 80, lineBreak: false })
  doc.moveTo(40, 62).lineTo(doc.page.width - 40, 62).lineWidth(0.75).strokeColor(RULE).stroke()
  doc.lineWidth(1)
  doc.y = 74
}

// Document title - strong left-aligned dark-navy heading with the reference
// beneath it and a short accent underline (master template §4).
function addDocumentTitle(doc: Doc, title: string, reference?: string, y?: number): number {
  const top = y ?? doc.y
  doc.font('Helvetica-Bold').fontSize(23).fillColor(NAVY)
    .text(title.toUpperCase(), 40, top, { width: doc.page.width - 80, characterSpacing: 1.2, lineBreak: false })

  let next = doc.y + 6
  if (reference) {
    doc.font('Helvetica').fontSize(10.5).fillColor(SLATE)
      .text(reference, 40, next, { width: doc.page.width - 80, lineBreak: false })
    next = doc.y + 5
  }
  doc.moveTo(40, next + 4).lineTo(76, next + 4).lineWidth(3).strokeColor(GOLD).stroke()
  doc.moveTo(40, next + 14).lineTo(doc.page.width - 40, next + 14).lineWidth(0.75).strokeColor(RULE).stroke()
  doc.lineWidth(1)
  return next + 28
}

// Draws the footer on the CURRENT page. The bottom margin is temporarily
// removed: writing below the margin makes PDFKit spill onto a new page, which
// is what produced spurious blank pages.
function drawFooter(doc: Doc, project: ProjectMeta, reference: string, pageNum: number, pageCount: number) {
  const savedBottom = doc.page.margins.bottom
  doc.page.margins.bottom = 0

  const y = doc.page.height - 52
  doc.moveTo(40, y - 10).lineTo(doc.page.width - 40, y - 10).lineWidth(0.75).strokeColor(RULE).stroke()
  doc.lineWidth(1)
  const now = new Date()
  doc.font('Helvetica').fontSize(7.4).fillColor(MUTED)
    .text(`AURUM PROJECT CONTROLS  |  ${project.name}  |  ${reference}  |  Generated ${now.toLocaleDateString('en-GB')} ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
      40, y - 4, { width: doc.page.width - 140, lineBreak: false })
  doc.font('Helvetica').fontSize(7.4).fillColor(MUTED)
    .text(`Page ${pageNum} of ${pageCount}`, doc.page.width - 130, y - 4, { width: 90, align: 'right', lineBreak: false })
  doc.font('Helvetica').fontSize(6.5).fillColor(SLATE)
    .text('SAFETY   |   QUALITY   |   INTEGRITY   |   DELIVERY', 40, y + 8, { lineBreak: false, characterSpacing: 1.2 })

  doc.page.margins.bottom = savedBottom
}

// Stamps the footer on every buffered page, then closes the document. Using
// buffered pages is what allows an accurate "Page 1 of 3".
function finalise(doc: Doc, project: ProjectMeta, reference: string) {
  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i)
    drawFooter(doc, project, reference, i + 1, range.count)
  }
  doc.flushPages()
  doc.end()
}

// Section heading: a bold label above a hairline rule (formal, not a colour bar)
function sectionTitle(doc: Doc, text: string) {
  const y = doc.y
  doc.font('Helvetica-Bold').fontSize(12).fillColor(NAVY)
    .text(text.toUpperCase(), 40, y, { characterSpacing: 0.8 })
  const ruleY = doc.y + 5
  doc.moveTo(40, ruleY).lineTo(doc.page.width - 40, ruleY).lineWidth(0.75).strokeColor(RULE).stroke()
  doc.lineWidth(1)
  doc.y = ruleY + 14
  doc.fillColor(BODY)
}

// Two-column metadata grid - small grey labels above navy values (§5).
// Fields with no value are omitted entirely; nothing ever renders as N/A.
function fieldTable(doc: Doc, fields: Array<[string, string]>) {
  const cleaned = fields
    .map(([label, value]) => [label, cleanValue(value)] as [string, string])
    .filter(([, value]) => value !== '')
  const colW = (doc.page.width - 80 - 28) / 2
  const gap = 28
  let row: Array<[string, string]> = []
  let rowHeights: number[] = []
  const drawRow = () => {
    if (row.length === 0) return
    const startY = doc.y
    const h = Math.max(30, Math.max(...rowHeights) + 24)
    row.forEach(([label, value], i) => {
      const x = 40 + i * (colW + gap)
      doc.font('Helvetica').fontSize(8).fillColor(MUTED)
        .text(label, x, startY, { width: colW, lineBreak: false })
      doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY)
        .text(value, x, startY + 12, { width: colW, lineGap: 1.5 })
    })
    doc.y = startY + h
    row = []
    rowHeights = []
  }
  cleaned.forEach(([label, value]) => {
    doc.font('Helvetica-Bold').fontSize(10)
    rowHeights.push(12 + doc.heightOfString(value, { width: colW, lineGap: 1.5 }))
    row.push([label, value])
    if (row.length === 2) drawRow()
  })
  drawRow()
  doc.y += 6
  doc.font('Helvetica').fillColor(BODY)
}

// Engineering-document table row: navy header row with white text, thin
// bordered cells, naturally wrapping body text (§7). Text can never spill
// outside a cell - the row grows to fit the wrapped content.
function tableRow(doc: Doc, cols: string[], widths: number[], isHeader = false, y?: number) {
  const startY = y ?? doc.y
  const pad = 5
  const font = isHeader ? 'Helvetica-Bold' : 'Helvetica'
  const size = isHeader ? 8.5 : 8.25
  doc.font(font).fontSize(size)
  const texts = cols.map((c) => String(c ?? ''))
  const textHeights = texts.map((t, i) =>
    doc.heightOfString(t, { width: widths[i] - pad * 2, lineGap: 1.5 }),
  )
  const rowH = Math.max(...textHeights) + (isHeader ? 10 : 9)
  const totalW = widths.reduce((a, b) => a + b, 0)

  if (isHeader) {
    doc.rect(40, startY, totalW, rowH).fill(NAVY)
  } else {
    doc.lineWidth(0.5).rect(40, startY, totalW, rowH).fillAndStroke('#FFFFFF', RULE)
  }
  let x = 40
  texts.forEach((t, i) => {
    if (i > 0) {
      doc.moveTo(x, startY).lineTo(x, startY + rowH).lineWidth(0.5).strokeColor(RULE).stroke()
    }
    doc.font(font).fontSize(size)
      .fillColor(isHeader ? '#FFFFFF' : BODY)
      .text(t, x + pad, startY + 5, { width: widths[i] - pad * 2, lineGap: 1.5 })
    x += widths[i]
  })
  doc.lineWidth(1)
  doc.font('Helvetica').fillColor(BODY)
  doc.y = startY + rowH
}

// Signature block - what makes a notice read as a served contractual document
function signatureBlock(doc: Doc) {
  doc.moveDown(1.5)
  sectionTitle(doc, 'Acknowledgement of Receipt')
  const y = doc.y + 16
  const colW = (doc.page.width - 80 - 30) / 3
  const labels = ['Signed', 'Name & Position', 'Date']
  labels.forEach((label, i) => {
    const x = 40 + i * (colW + 15)
    doc.moveTo(x, y).lineTo(x + colW, y).lineWidth(0.75).strokeColor('#94A3B8').stroke()
    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(label, x, y + 5, { width: colW })
  })
  doc.lineWidth(1)
  doc.y = y + 24
}

export function generateEarlyWarningPDF(
  res: Response,
  ew: Record<string, unknown>,
  project: ProjectMeta | string,
) {
  const meta = asMeta(project)
  const ref = String(ew['ewNumber'] ?? 'EW')
  const doc = new PDFDocument({ size: 'A4', margins: { top: 40, left: 40, bottom: 64, right: 40 }, bufferPages: true })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${fileNameFor(meta, ref)}"`)
  doc.pipe(res)

  addLetterhead(doc, meta)
  addProjectBanner(doc, meta)
  doc.y = addDocumentTitle(doc, 'Early Warning', `Reference: ${ref}`)

  sectionTitle(doc, 'Particulars')
  fieldTable(doc, [
    ['Subject', String(ew['title'] ?? '')],
    ['Status', humanize(ew['status'])],
    ['Date Raised', fmtDate(ew['dateRaised'])],
    ['Date Required By', fmtDate(ew['dateRequired'])],
    ['Raised By', String(ew['raisedBy'] ?? '')],
    ['Assigned To', String(ew['assignedTo'] ?? '')],
    ['NEC Clause', '15.1'],
  ])

  doc.moveDown(0.5)
  sectionTitle(doc, 'Description of the Matter')
  doc.font('Helvetica').fontSize(9.75).fillColor(BODY)
    .text(String(ew['description'] ?? ''), 40, doc.y, { width: doc.page.width - 80, lineGap: 4, align: 'justify' })

  doc.moveDown(1.2)
  doc.font('Helvetica-Oblique').fontSize(8).fillColor(MUTED)
    .text('This Early Warning is given under the contract and forms part of the project record. Recipients should attend the next early warning meeting where this matter will be considered.',
      40, doc.y, { width: doc.page.width - 80, lineGap: 2 })

  // Document control block (§12) - only real data; approval fields are never
  // invented for records the application does not hold.
  if (doc.y > doc.page.height - 250) {
    doc.addPage()
    addContinuationHeader(doc, meta, 'Early Warning', ref)
  }
  sectionTitle(doc, 'Document Control')
  const ctrlW = [110, 373]
  tableRow(doc, ['Reference', ref], ctrlW)
  tableRow(doc, ['Revision', '01'], ctrlW)
  tableRow(doc, ['Date Raised', fmtDate(ew['dateRaised'])], ctrlW)
  tableRow(doc, ['Prepared By', String(ew['raisedBy'] ?? '')], ctrlW)
  doc.moveDown(0.5)

  signatureBlock(doc)
  finalise(doc, meta, ref)
}

const NOTICE_TYPE_LABELS: Record<string, string> = {
  EARLY_WARNING: 'Early Warning Notice',
  COMPENSATION_EVENT: 'Compensation Event Notice',
  INSTRUCTION: 'Project Manager’s Instruction',
  ACCEPTANCE: 'Notice of Acceptance',
  REJECTION: 'Notice of Rejection',
  QUOTATION: 'Quotation',
  ASSESSMENT: 'Assessment',
  GENERAL: 'General Notice',
}

export function generateNoticePDF(
  res: Response,
  notice: Record<string, unknown>,
  project: ProjectMeta | string,
) {
  const meta = asMeta(project)
  const typeLabel = NOTICE_TYPE_LABELS[String(notice['type'])] ?? 'Notice'
  const ref = String(notice['noticeNumber'] ?? 'Notice')
  const doc = new PDFDocument({ size: 'A4', margins: { top: 40, left: 40, bottom: 64, right: 40 }, bufferPages: true })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${fileNameFor(meta, ref)}"`)
  doc.pipe(res)

  addLetterhead(doc, meta)
  addProjectBanner(doc, meta)
  doc.y = addDocumentTitle(doc, typeLabel, `Reference: ${ref}`)

  const ce = notice['ce'] as Record<string, unknown> | null
  sectionTitle(doc, 'Particulars')
  fieldTable(doc, [
    ['Notice Type', typeLabel],
    ['Subject', String(notice['title'] ?? '')],
    ['Issued By', String(notice['issuedBy'] ?? '')],
    ['Issued To', String(notice['issuedTo'] ?? '')],
    ['Date Issued', fmtDate(notice['dateIssued'])],
    ['Response Due', fmtDate(notice['dueDate'])],
    ['Related Compensation Event', ce ? `${ce['ceNumber']} - ${ce['title']}` : ''],
  ])

  doc.moveDown(0.5)
  sectionTitle(doc, 'Notice')
  doc.font('Helvetica').fontSize(9.75).fillColor(BODY)
    .text(String(notice['content'] ?? ''), 40, doc.y, { width: doc.page.width - 80, lineGap: 4, align: 'justify' })

  doc.moveDown(1.2)
  doc.font('Helvetica-Oblique').fontSize(8).fillColor(MUTED)
    .text('This notice is issued under the contract and forms part of the project’s contractual record.',
      40, doc.y, { width: doc.page.width - 80 })

  // Document control block (§12) - only data the application actually holds
  if (doc.y > doc.page.height - 250) {
    doc.addPage()
    addContinuationHeader(doc, meta, typeLabel, ref)
  }
  sectionTitle(doc, 'Document Control')
  const ctrlW = [110, 373]
  tableRow(doc, ['Reference', ref], ctrlW)
  tableRow(doc, ['Revision', '01'], ctrlW)
  tableRow(doc, ['Date Issued', fmtDate(notice['dateIssued'])], ctrlW)
  tableRow(doc, ['Issued By', String(notice['issuedBy'] ?? '')], ctrlW)
  doc.moveDown(0.5)

  signatureBlock(doc)
  finalise(doc, meta, ref)
}

export function generateRiskRegisterPDF(
  res: Response,
  risks: Record<string, unknown>[],
  project: ProjectMeta | string,
) {
  const meta = asMeta(project)
  const doc = new PDFDocument({ size: 'A4', margins: { top: 40, left: 40, bottom: 64, right: 40 }, bufferPages: true })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${fileNameFor(meta, 'Risk-Register')}"`)
  doc.pipe(res)

  addLetterhead(doc, meta)
  addProjectBanner(doc, meta)
  doc.y = addDocumentTitle(doc, 'Risk Register', `${risks.length} item(s)  ·  ${fmtDate(new Date())}`)

  const cols = ['Risk ID', 'Description', 'Prob', 'Cost (£)', 'Time (d)', 'Status', 'Owner']
  const widths = [46, 152, 34, 62, 40, 62, 69]
  tableRow(doc, cols, widths, true)

  risks.forEach((r) => {
    const costRaw = r['costImpact']
    tableRow(doc, [
      String(r['riskId'] ?? ''),
      String(r['description'] ?? ''),
      String(r['probability'] ?? ''),
      typeof costRaw === 'number' ? fmtMoney(costRaw) : '',
      r['timeImpact'] != null ? String(r['timeImpact']) : '',
      humanize(r['status']),
      String(r['owner'] ?? ''),
    ], widths)
    if (doc.y > doc.page.height - 110) {
      doc.addPage()
      addContinuationHeader(doc, meta, 'Risk Register', `${risks.length} item(s)`)
      tableRow(doc, cols, widths, true)
    }
  })

  finalise(doc, meta, 'Risk Register')
}

export function generateCESummaryPDF(
  res: Response,
  ces: Record<string, unknown>[],
  project: ProjectMeta | string,
) {
  const meta = asMeta(project)
  const doc = new PDFDocument({ size: 'A4', margins: { top: 40, left: 40, bottom: 64, right: 40 }, bufferPages: true })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${fileNameFor(meta, 'CE-Summary')}"`)
  doc.pipe(res)

  const total = ces.reduce((sum, ce) => {
    const v = ce['valuationAmount']
    return sum + (typeof v === 'number' ? v : 0)
  }, 0)

  addLetterhead(doc, meta)
  addProjectBanner(doc, meta)
  doc.y = addDocumentTitle(doc, 'Compensation Event Summary',
    `${ces.length} event(s)  ·  Total valuation £${total.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)

  const cols = ['CE No.', 'Title', 'Clause', 'Notified', 'Due', 'Valuation (£)', 'Status']
  const widths = [48, 130, 50, 60, 60, 80, 57]
  tableRow(doc, cols, widths, true)

  ces.forEach((ce) => {
    const val = ce['valuationAmount']
    tableRow(doc, [
      String(ce['ceNumber'] ?? ''),
      String(ce['title'] ?? ''),
      String(ce['clauseRef'] ?? ''),
      fmtDate(ce['dateNotified']),
      fmtDate(ce['dateResponseDue']),
      typeof val === 'number' ? fmtMoney(val) : '',
      humanize(ce['status']),
    ], widths)
    if (doc.y > doc.page.height - 110) {
      doc.addPage()
      addContinuationHeader(doc, meta, 'Compensation Event Summary', `${ces.length} events`)
      tableRow(doc, cols, widths, true)
    }
  })

  finalise(doc, meta, 'CE Summary')
}

// ── Adjudication dossier ─────────────────────────────────────────────────────
// One document containing the whole contractual record: registers, the full
// text of every notice, and the audit trail. This is the bundle you hand to an
// adjudicator - the side with clean records wins.
export interface DossierData {
  project: ProjectMeta
  earlyWarnings: Array<Record<string, unknown>>
  risks: Array<Record<string, unknown>>
  ces: Array<Record<string, unknown>>
  notices: Array<Record<string, unknown>>
  auditLogs: Array<{ createdAt: Date; action: string; entityType: string; userName: string }>
  photoCount: number
  drawingCount: number
}

export function generateDossierPDF(res: Response, data: DossierData) {
  const meta = data.project
  const doc = new PDFDocument({ size: 'A4', margins: { top: 40, left: 40, bottom: 64, right: 40 }, bufferPages: true })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${fileNameFor(meta, 'Contract-Dossier')}"`)
  doc.pipe(res)

  // Cover
  addLetterhead(doc, meta)
  addProjectBanner(doc, meta)
  doc.y = addDocumentTitle(doc, 'Contract Dossier', `Complete project record  ·  ${fmtDate(new Date())}`)

  sectionTitle(doc, 'Contents of this bundle')
  fieldTable(doc, [
    ['Early warnings', String(data.earlyWarnings.length)],
    ['Risk register entries', String(data.risks.length)],
    ['Compensation events', String(data.ces.length)],
    ['Notices issued', String(data.notices.length)],
    ['Photographs on file', String(data.photoCount)],
    ['Drawings on file', String(data.drawingCount)],
    ['Audit trail entries', String(data.auditLogs.length)],
  ])
  doc.moveDown(1)
  doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(MUTED)
    .text('This bundle was produced automatically from the project record held in Aurum Project Controls. Every entry is timestamped and attributable. Photographs and drawings are held in the system and available on request.',
      40, doc.y, { width: doc.page.width - 80, lineGap: 2 })

  const newSection = (title: string) => {
    doc.addPage()
    addContinuationHeader(doc, meta, title)
    sectionTitle(doc, title)
  }

  const guardSpace = (needed = 90) => {
    if (doc.y > doc.page.height - needed) {
      doc.addPage()
      addContinuationHeader(doc, meta)
    }
  }

  // Early warnings
  newSection('Early Warning Register')
  if (data.earlyWarnings.length === 0) {
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('No early warnings recorded.', 40, doc.y)
  } else {
    const widths = [65, 200, 80, 80, 90]
    tableRow(doc, ['EW No.', 'Subject', 'Raised', 'Required by', 'Status'], widths, true)
    data.earlyWarnings.forEach((ew) => {
      tableRow(doc, [
        String(ew['ewNumber'] ?? ''),
        String(ew['title'] ?? ''),
        fmtDate(ew['dateRaised']),
        fmtDate(ew['dateRequired']),
        humanize(ew['status']),
      ], widths)
      guardSpace()
    })
  }

  // Risks
  newSection('Risk Register')
  if (data.risks.length === 0) {
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('No risks recorded.', 40, doc.y)
  } else {
    const widths = [55, 210, 40, 80, 60, 70]
    tableRow(doc, ['Risk ID', 'Description', 'Prob', 'Cost (£)', 'Time (d)', 'Status'], widths, true)
    data.risks.forEach((r) => {
      const cost = r['costImpact']
      tableRow(doc, [
        String(r['riskId'] ?? ''),
        String(r['description'] ?? ''),
        String(r['probability'] ?? ''),
        typeof cost === 'number' ? fmtMoney(cost) : '',
        r['timeImpact'] != null ? String(r['timeImpact']) : '',
        humanize(r['status']),
      ], widths)
      guardSpace()
    })
  }

  // Compensation events
  newSection('Compensation Events')
  if (data.ces.length === 0) {
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('No compensation events recorded.', 40, doc.y)
  } else {
    const widths = [55, 165, 55, 75, 75, 90]
    tableRow(doc, ['CE No.', 'Title', 'Clause', 'Notified', 'Due', 'Status'], widths, true)
    data.ces.forEach((ce) => {
      tableRow(doc, [
        String(ce['ceNumber'] ?? ''),
        String(ce['title'] ?? ''),
        String(ce['clauseRef'] ?? ''),
        fmtDate(ce['dateNotified']),
        fmtDate(ce['dateResponseDue']),
        humanize(ce['status']),
      ], widths)
      guardSpace()
    })
    const total = data.ces.reduce((s, ce) => s + (typeof ce['valuationAmount'] === 'number' ? ce['valuationAmount'] as number : 0), 0)
    doc.moveDown(0.5)
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(NAVY)
      .text(`Total valuation: ${fmtMoney(total)}`, 40, doc.y)
  }

  // Notices - full text, since this is the evidence that matters most
  newSection('Notices Issued')
  if (data.notices.length === 0) {
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('No notices issued.', 40, doc.y)
  } else {
    data.notices.forEach((n, i) => {
      guardSpace(140)
      if (i > 0) doc.moveDown(0.8)
      doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY)
        .text(`${n['noticeNumber']} - ${NOTICE_TYPE_LABELS[String(n['type'])] ?? 'Notice'}`, 40, doc.y, { width: doc.page.width - 80 })
      doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
        .text(`Issued ${n['dateIssued'] ? new Date(n['dateIssued'] as string).toLocaleDateString('en-GB') : ''} to ${n['issuedTo'] ?? ''}${n['dueDate'] ? `  ·  Response due ${new Date(n['dueDate'] as string).toLocaleDateString('en-GB')}` : ''}`,
          40, doc.y + 2, { width: doc.page.width - 80 })
      doc.moveDown(0.4)
      doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY).text(String(n['title'] ?? ''), 40, doc.y, { width: doc.page.width - 80 })
      doc.moveDown(0.2)
      doc.font('Helvetica').fontSize(9).fillColor('#334155')
        .text(String(n['content'] ?? ''), 40, doc.y, { width: doc.page.width - 80, lineGap: 3, align: 'justify' })
      doc.moveDown(0.4)
      doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).lineWidth(0.5).strokeColor(RULE).stroke()
      doc.lineWidth(1)
      doc.moveDown(0.4)
    })
  }

  // Audit trail
  newSection('Audit Trail')
  doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(MUTED)
    .text('Every recorded action on this project, most recent first.', 40, doc.y, { width: doc.page.width - 80 })
  doc.moveDown(0.8)
  if (data.auditLogs.length === 0) {
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('No audit entries.', 40, doc.y)
  } else {
    const widths = [110, 110, 130, 165]
    tableRow(doc, ['Date & time', 'Action', 'Record type', 'By'], widths, true)
    data.auditLogs.forEach((log) => {
      tableRow(doc, [
        new Date(log.createdAt).toLocaleString('en-GB'),
        log.action.replace(/_/g, ' '),
        log.entityType,
        log.userName,
      ], widths)
      guardSpace()
    })
  }

  finalise(doc, meta, 'Contract Dossier')
}

export function generateCommercialDashboardPDF(
  res: Response,
  data: {
    projectName: string
    project?: ProjectMeta
    openEWs: number
    openRisks: number
    openCEs: number
    totalCEValue: number
    riskExposure: number
    overdueItems: number
    cesByStatus: { status: string; count: number }[]
  },
) {
  const meta = data.project ?? { name: data.projectName }
  const doc = new PDFDocument({ size: 'A4', margins: { top: 40, left: 40, bottom: 64, right: 40 }, bufferPages: true })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${fileNameFor(meta, 'Commercial-Report')}"`)
  doc.pipe(res)

  addLetterhead(doc, meta)
  addProjectBanner(doc, meta)
  doc.y = addDocumentTitle(doc, 'Commercial Report',
    `Reporting date: ${fmtDate(new Date())}`)

  sectionTitle(doc, 'Key Performance Indicators')
  const kpis = [
    ['Open Early Warnings', String(data.openEWs)],
    ['Open Risk Items', String(data.openRisks)],
    ['Open Compensation Events', String(data.openCEs)],
    ['Total CE Valuation', `£${data.totalCEValue.toLocaleString('en-GB')}`],
    ['Risk Exposure (Cost)', `£${data.riskExposure.toLocaleString('en-GB')}`],
    ['Overdue Items', String(data.overdueItems)],
  ]

  const cols = 2
  const kpiWidth = (doc.page.width - 80) / cols
  let rowTop = doc.y
  kpis.forEach(([label, value], i) => {
    const x = 40 + (i % cols) * kpiWidth
    doc.rect(x + 3, rowTop, kpiWidth - 6, 48).fillAndStroke('#F8FAFC', RULE)
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(label, x + 12, rowTop + 9, { width: kpiWidth - 24 })
    doc.font('Helvetica-Bold').fontSize(16).fillColor(NAVY).text(value, x + 12, rowTop + 23, { width: kpiWidth - 24 })
    if (i % cols === cols - 1) rowTop += 56
  })
  doc.y = rowTop + 10
  doc.font('Helvetica')

  doc.moveDown(1)
  sectionTitle(doc, 'Compensation Events by Status')
  const statusWidths = [200, 100]
  tableRow(doc, ['Status', 'Count'], statusWidths, true)
  data.cesByStatus.forEach((row) => tableRow(doc, [row.status, String(row.count)], statusWidths))

  finalise(doc, meta, 'Commercial Report')
}
