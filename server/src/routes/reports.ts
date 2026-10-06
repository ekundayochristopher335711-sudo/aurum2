import express from 'express'
import prisma from '../config/database'
import { authenticate, AuthRequest } from '../middleware/auth'
import { requireProjectAccess } from '../middleware/roleCheck'
import { logAudit } from '../services/auditService'
import {
  generateRiskRegisterPDF,
  generateCESummaryPDF,
  generateCommercialDashboardPDF,
  generateDossierPDF,
} from '../services/pdfService'

const router = express.Router()

router.get('/:projectId/reports/risk-register', authenticate, requireProjectAccess, async (req: AuthRequest, res): Promise<void> => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.projectId } })
    const risks = await prisma.riskItem.findMany({
      where: { projectId: req.params.projectId },
      orderBy: { riskId: 'asc' },
    })
    await logAudit({ userId: req.user!.id, projectId: req.params.projectId, entityType: 'RiskRegister', entityId: req.params.projectId, action: 'EXPORT', ipAddress: req.ip })
    generateRiskRegisterPDF(res, risks as unknown as Record<string, unknown>[], project ?? { name: 'Project' })
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

router.get('/:projectId/reports/ce-summary', authenticate, requireProjectAccess, async (req: AuthRequest, res): Promise<void> => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.projectId } })
    const ces = await prisma.compensationEvent.findMany({
      where: { projectId: req.params.projectId },
      orderBy: { ceNumber: 'asc' },
    })
    await logAudit({ userId: req.user!.id, projectId: req.params.projectId, entityType: 'CESummary', entityId: req.params.projectId, action: 'EXPORT', ipAddress: req.ip })
    generateCESummaryPDF(res, ces as unknown as Record<string, unknown>[], project ?? { name: 'Project' })
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

router.get('/:projectId/reports/commercial', authenticate, requireProjectAccess, async (req: AuthRequest, res): Promise<void> => {
  try {
    const projectId = req.params.projectId
    const project = await prisma.project.findUnique({ where: { id: projectId } })
    const now = new Date()

    const [openEWs, openRisks, openCEs, overdueItems, cesByStatus, totalCEAgg, riskExposureAgg] = await Promise.all([
      prisma.earlyWarning.count({ where: { projectId, status: 'OPEN' } }),
      prisma.riskItem.count({ where: { projectId, status: 'OPEN' } }),
      prisma.compensationEvent.count({ where: { projectId, status: { not: 'CLOSED' } } }),
      prisma.compensationEvent.count({ where: { projectId, status: { not: 'CLOSED' }, dateResponseDue: { lt: now } } }),
      prisma.compensationEvent.groupBy({ by: ['status'], where: { projectId }, _count: { _all: true } }),
      prisma.compensationEvent.aggregate({ where: { projectId }, _sum: { valuationAmount: true } }),
      prisma.riskItem.aggregate({ where: { projectId, status: 'OPEN' }, _sum: { costImpact: true } }),
    ])

    await logAudit({ userId: req.user!.id, projectId, entityType: 'CommercialDashboard', entityId: projectId, action: 'EXPORT', ipAddress: req.ip })
    generateCommercialDashboardPDF(res, {
      projectName: project?.name || 'Project',
      project: project ?? undefined,
      openEWs,
      openRisks,
      openCEs,
      totalCEValue: totalCEAgg._sum.valuationAmount ?? 0,
      riskExposure: riskExposureAgg._sum.costImpact ?? 0,
      overdueItems,
      cesByStatus: cesByStatus.map((r) => ({ status: r.status, count: r._count._all })),
    })
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

// The adjudication bundle: the whole contractual record in one document
router.get('/:projectId/reports/dossier', authenticate, requireProjectAccess, async (req: AuthRequest, res): Promise<void> => {
  try {
    const projectId = req.params.projectId
    const [project, earlyWarnings, risks, ces, notices, auditLogs, photoCount, drawingCount] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId } }),
      prisma.earlyWarning.findMany({ where: { projectId }, orderBy: { ewNumber: 'asc' } }),
      prisma.riskItem.findMany({ where: { projectId }, orderBy: { riskId: 'asc' } }),
      prisma.compensationEvent.findMany({ where: { projectId }, orderBy: { ceNumber: 'asc' } }),
      prisma.notice.findMany({ where: { projectId }, orderBy: { noticeNumber: 'asc' } }),
      prisma.auditLog.findMany({
        where: { projectId },
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      prisma.document.count({ where: { projectId, category: 'PHOTO' } }),
      prisma.document.count({ where: { projectId, category: 'DRAWING' } }),
    ])

    await logAudit({ userId: req.user!.id, projectId, entityType: 'ContractDossier', entityId: projectId, action: 'EXPORT', ipAddress: req.ip })

    generateDossierPDF(res, {
      project: project ?? { name: 'Project' },
      earlyWarnings: earlyWarnings as unknown as Record<string, unknown>[],
      risks: risks as unknown as Record<string, unknown>[],
      ces: ces as unknown as Record<string, unknown>[],
      notices: notices as unknown as Record<string, unknown>[],
      auditLogs: auditLogs.map((l) => ({
        createdAt: l.createdAt, action: l.action, entityType: l.entityType, userName: l.user.name,
      })),
      photoCount,
      drawingCount,
    })
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

export default router
