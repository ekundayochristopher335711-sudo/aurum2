import express from 'express'
import prisma from '../config/database'
import { authenticate, AuthRequest } from '../middleware/auth'
import { requireProjectAccess } from '../middleware/roleCheck'

const router = express.Router()

router.get('/:projectId/dashboard', authenticate, requireProjectAccess, async (req: AuthRequest, res): Promise<void> => {
  try {
    const projectId = req.params.projectId
    const now = new Date()

    const [
      openEWs,
      openRisks,
      openCEs,
      overdueCEs,
      cesByStatus,
      totalCEValue,
      riskExposure,
      recentAuditLogs,
      ewsByStatus,
    ] = await Promise.all([
      prisma.earlyWarning.count({ where: { projectId, status: 'OPEN' } }),
      prisma.riskItem.count({ where: { projectId, status: 'OPEN' } }),
      prisma.compensationEvent.count({ where: { projectId, status: { not: 'CLOSED' } } }),
      prisma.compensationEvent.count({
        where: { projectId, status: { not: 'CLOSED' }, dateResponseDue: { lt: now } },
      }),
      prisma.compensationEvent.groupBy({ by: ['status'], where: { projectId }, _count: { _all: true } }),
      prisma.compensationEvent.aggregate({
        where: { projectId },
        _sum: { valuationAmount: true },
      }),
      prisma.riskItem.aggregate({
        where: { projectId, status: 'OPEN' },
        _sum: { costImpact: true },
      }),
      prisma.auditLog.findMany({
        where: { projectId },
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.earlyWarning.groupBy({ by: ['status'], where: { projectId }, _count: { _all: true } }),
    ])

    res.json({
      kpis: {
        openEWs,
        openRisks,
        openCEs,
        overdueCEs,
        totalCEValue: totalCEValue._sum.valuationAmount ?? 0,
        riskExposure: riskExposure._sum.costImpact ?? 0,
      },
      cesByStatus: cesByStatus.map((r) => ({ status: r.status, count: r._count._all })),
      ewsByStatus: ewsByStatus.map((r) => ({ status: r.status, count: r._count._all })),
      recentActivity: recentAuditLogs.map((log) => ({
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        userName: log.user.name,
        createdAt: log.createdAt,
      })),
    })
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

router.get('/:projectId/audit-log', authenticate, requireProjectAccess, async (req: AuthRequest, res): Promise<void> => {
  try {
    const { entityType, page = '1', limit = '50' } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: {
          projectId: req.params.projectId,
          ...(entityType ? { entityType: entityType as string } : {}),
        },
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.auditLog.count({
        where: {
          projectId: req.params.projectId,
          ...(entityType ? { entityType: entityType as string } : {}),
        },
      }),
    ])

    res.json({ logs, total, page: Number(page), pages: Math.ceil(total / Number(limit)) })
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

export default router
