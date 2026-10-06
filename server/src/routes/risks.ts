import express from 'express'
import { body, validationResult } from 'express-validator'
import prisma from '../config/database'
import { authenticate, AuthRequest } from '../middleware/auth'
import { requireProjectAccess, requireProjectRole } from '../middleware/roleCheck'
import { logAudit, diffObjects } from '../services/auditService'
import { nextNumber, createWithRetry } from '../services/numberingService'

const router = express.Router()

router.get('/:projectId/risks', authenticate, requireProjectAccess, async (req: AuthRequest, res): Promise<void> => {
  try {
    const { status } = req.query
    const risks = await prisma.riskItem.findMany({
      where: {
        projectId: req.params.projectId,
        ...(status ? { status: status as 'OPEN' | 'MITIGATED' | 'CLOSED' } : {}),
      },
      include: { earlyWarning: { select: { id: true, ewNumber: true, title: true } } },
      orderBy: { createdAt: 'desc' },
    })
    res.json(risks)
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

router.get('/:projectId/risks/:id', authenticate, requireProjectAccess, async (req: AuthRequest, res): Promise<void> => {
  try {
    const risk = await prisma.riskItem.findFirst({
      where: { id: req.params.id, projectId: req.params.projectId },
      include: { earlyWarning: true },
    })
    if (!risk) { res.status(404).json({ message: 'Risk not found' }); return }
    res.json(risk)
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

router.post('/:projectId/risks',
  authenticate,
  requireProjectAccess,
  requireProjectRole('ADMIN', 'COMMERCIAL_MANAGER'),
  body('description').notEmpty().trim(),
  body('probability').isInt({ min: 1, max: 5 }),
  async (req: AuthRequest, res): Promise<void> => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return }

    try {
      const { description, probability, costImpact, timeImpact, mitigation, owner, earlyWarningId } = req.body

      // A linked EW must belong to the same project
      if (earlyWarningId) {
        const ew = await prisma.earlyWarning.findFirst({ where: { id: earlyWarningId, projectId: req.params.projectId } })
        if (!ew) { res.status(400).json({ message: 'Linked Early Warning not found in this project' }); return }
      }

      const risk = await createWithRetry(async () => {
        const riskId = await nextNumber('riskItem', req.params.projectId, 'R')
        return prisma.riskItem.create({
          data: {
            riskId,
            projectId: req.params.projectId,
            description,
            probability: Number(probability),
            costImpact: costImpact !== undefined && costImpact !== null && costImpact !== '' ? Number(costImpact) : null,
            timeImpact: timeImpact !== undefined && timeImpact !== null && timeImpact !== '' ? Number(timeImpact) : null,
            mitigation: mitigation || null,
            owner: owner || null,
            earlyWarningId: earlyWarningId || null,
          },
          include: { earlyWarning: { select: { id: true, ewNumber: true, title: true } } },
        })
      })
      await logAudit({ userId: req.user!.id, projectId: req.params.projectId, entityType: 'RiskItem', entityId: risk.id, action: 'CREATE', ipAddress: req.ip })
      res.status(201).json(risk)
    } catch {
      res.status(500).json({ message: 'Server error' })
    }
  },
)

router.put('/:projectId/risks/:id',
  authenticate,
  requireProjectAccess,
  requireProjectRole('ADMIN', 'COMMERCIAL_MANAGER'),
  async (req: AuthRequest, res): Promise<void> => {
    try {
      const existing = await prisma.riskItem.findFirst({
        where: { id: req.params.id, projectId: req.params.projectId },
      })
      if (!existing) { res.status(404).json({ message: 'Risk not found' }); return }

      const { id, riskId, projectId, createdAt, updatedAt, earlyWarning, ...updateData } = req.body
      if (updateData.probability !== undefined) updateData.probability = Number(updateData.probability)
      if (updateData.costImpact !== undefined) {
        updateData.costImpact = updateData.costImpact === null || updateData.costImpact === '' ? null : Number(updateData.costImpact)
      }
      if (updateData.timeImpact !== undefined) {
        updateData.timeImpact = updateData.timeImpact === null || updateData.timeImpact === '' ? null : Number(updateData.timeImpact)
      }

      const risk = await prisma.riskItem.update({
        where: { id: req.params.id },
        data: updateData,
        include: { earlyWarning: { select: { id: true, ewNumber: true, title: true } } },
      })

      const changes = diffObjects(existing as unknown as Record<string, unknown>, updateData)
      const action = existing.status !== risk.status ? 'STATUS_CHANGE' : 'UPDATE'
      await logAudit({ userId: req.user!.id, projectId: req.params.projectId, entityType: 'RiskItem', entityId: risk.id, action, changes, ipAddress: req.ip })
      res.json(risk)
    } catch {
      res.status(500).json({ message: 'Server error' })
    }
  },
)

router.delete('/:projectId/risks/:id', authenticate, requireProjectAccess, requireProjectRole('ADMIN'), async (req: AuthRequest, res): Promise<void> => {
  try {
    const existing = await prisma.riskItem.findFirst({
      where: { id: req.params.id, projectId: req.params.projectId },
    })
    if (!existing) { res.status(404).json({ message: 'Risk not found' }); return }

    await prisma.riskItem.delete({ where: { id: req.params.id } })
    await logAudit({ userId: req.user!.id, projectId: req.params.projectId, entityType: 'RiskItem', entityId: req.params.id, action: 'DELETE', changes: { record: { old: `${existing.riskId}: ${existing.description.slice(0, 80)}`, new: null } }, ipAddress: req.ip })
    res.status(204).send()
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

export default router
