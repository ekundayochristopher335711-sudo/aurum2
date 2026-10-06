/**
 * Renders one of every exported document with realistic sample data to prove
 * the whole PDF pipeline works end to end (letterhead, banner, tables,
 * multi-page continuation, footers). Output goes to the OS temp folder.
 *
 * Run from the server folder:  npx tsx scripts/smoke-pdf.ts
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { Writable } from 'stream'
import {
  generateEarlyWarningPDF, generateNoticePDF, generateRiskRegisterPDF,
  generateCESummaryPDF, generateCommercialDashboardPDF, generateDossierPDF,
} from '../src/services/pdfService'

const outDir = path.join(os.tmpdir(), 'aurum-smoke')
fs.mkdirSync(outDir, { recursive: true })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function render(name: string, generate: (res: any) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream: any = new Writable({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      write(chunk: any, _enc: any, cb: any) { chunks.push(chunk); cb() },
    })
    stream.setHeader = () => {}
    stream.on('finish', () => {
      const bytes = Buffer.concat(chunks)
      fs.writeFileSync(path.join(outDir, name), bytes)
      console.log(`OK   ${name}  (${bytes.length} bytes)`)
      resolve()
    })
    stream.on('error', reject)
    try {
      generate(stream)
    } catch (e) {
      reject(e)
    }
  })
}

const project = {
  name: 'Riverside Innovation Project',
  clientName: 'BlueStone Infrastructure',
  contractorName: 'Apex Civil Engineering Ltd',
  contractType: 'NEC4',
}

const ew = {
  ewNumber: 'EW-001',
  title: 'Unexpected Groundwater Delay',
  description:
    'Unidentified groundwater has been encountered during excavation, which may affect the planned ' +
    'construction sequence and require additional drainage measures. A dewatering scheme is being ' +
    'priced with the designer and the programme is being re-examined.',
  status: 'OPEN',
  dateRaised: '2026-09-09',
  dateRequired: '2026-09-16',
  raisedBy: 'Site Project Manager',
  assignedTo: 'Site Engineer',
}

const longNoticeContent =
  'Pursuant to clause 61.1 of the contract, the Contractor notifies a compensation event arising ' +
  'from the physical conditions encountered in Zone 4. A quotation is requested in accordance with ' +
  'clause 62.1. '.repeat(12)

const main = async () => {
  await render('early-warning.pdf', (res: any) => generateEarlyWarningPDF(res, ew, project))

  await render('notice.pdf', (res: any) => generateNoticePDF(res, {
    noticeNumber: 'N-004', type: 'COMPENSATION_EVENT', title: 'Extension of Time - Groundwater',
    content: longNoticeContent,
    issuedBy: 'Site Project Manager', issuedTo: 'Project Manager',
    dateIssued: '2026-09-10', dueDate: '2026-09-24',
    ce: { ceNumber: 'CE-014', title: 'Groundwater Dewatering Scheme' },
  }, project))

  await render('risk-register.pdf', (res: any) => generateRiskRegisterPDF(res, [
    { riskId: 'R-001', description: 'Contaminated spoil requires licensed disposal off site at a premium rate', probability: 4, costImpact: 125000, timeImpact: 12, status: 'OPEN', owner: 'Site Project Manager' },
    { riskId: 'R-002', description: 'Late designer response blocks the drainage sign-off sequence', probability: 3, costImpact: null, timeImpact: null, status: 'MITIGATED', owner: null },
  ], project))

  await render('ce-summary.pdf', (res: any) => generateCESummaryPDF(res, [
    { ceNumber: 'CE-013', title: 'Additional drainage measures Zone 4', clauseRef: '60.1(2)', dateNotified: '2026-08-02', dateResponseDue: '2026-08-09', valuationAmount: 87400, status: 'ASSESSED' },
    { ceNumber: 'CE-014', title: 'Groundwater dewatering scheme', clauseRef: null, dateNotified: '2026-09-01', dateResponseDue: null, valuationAmount: null, status: 'NOTIFIED' },
  ], project))

  await render('commercial.pdf', (res: any) => generateCommercialDashboardPDF(res, {
    projectName: project.name, project,
    openEWs: 2, openRisks: 1, openCEs: 2, totalCEValue: 87400, riskExposure: 125000, overdueItems: 1,
    cesByStatus: [{ status: 'NOTIFIED', count: 1 }, { status: 'ASSESSED', count: 1 }],
  }))

  await render('dossier.pdf', (res: any) => generateDossierPDF(res, {
    project,
    earlyWarnings: [ew],
    risks: [
      { riskId: 'R-001', description: 'Contaminated spoil requires licensed disposal off site at a premium rate', probability: 4, costImpact: 125000, timeImpact: 12, status: 'OPEN', owner: 'Site Project Manager' },
      { riskId: 'R-002', description: 'Late designer response blocks the drainage sign-off sequence', probability: 3, costImpact: null, timeImpact: null, status: 'MITIGATED', owner: null },
    ],
    ces: [
      { ceNumber: 'CE-013', title: 'Additional drainage measures Zone 4', clauseRef: '60.1(2)', dateNotified: '2026-08-02', dateResponseDue: '2026-08-09', valuationAmount: 87400, status: 'ASSESSED' },
      { ceNumber: 'CE-014', title: 'Groundwater dewatering scheme', clauseRef: null, dateNotified: '2026-09-01', dateResponseDue: null, valuationAmount: null, status: 'NOTIFIED' },
    ],
    notices: [
      { noticeNumber: 'N-004', type: 'COMPENSATION_EVENT', title: 'Extension of Time - Groundwater', content: longNoticeContent, issuedTo: 'Project Manager', dateIssued: '2026-09-10', dueDate: '2026-09-24' },
    ],
    auditLogs: [
      { createdAt: new Date(), action: 'CREATE', entityType: 'CompensationEvent', userName: 'Christopher' },
      { createdAt: new Date(), action: 'STATUS_CHANGE', entityType: 'EarlyWarning', userName: 'Site Project Manager' },
    ],
    photoCount: 6,
    drawingCount: 3,
  }))

  console.log(`\nAll six exports rendered successfully -> ${outDir}`)
}

main().catch((e) => { console.error('SMOKE FAILED:', e); process.exit(1) })
