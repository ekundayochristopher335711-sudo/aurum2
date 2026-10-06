import express from 'express'
import { body, validationResult } from 'express-validator'
import prisma from '../config/database'
import { authenticate, AuthRequest } from '../middleware/auth'
import { requireProjectAccess, requireProjectRole } from '../middleware/roleCheck'
import { logAudit, diffObjects } from '../services/auditService'
import { nextNumber, createWithRetry } from '../services/numberingService'
import { generateEarlyWarningPDF } from '../services/pdfService'
import { notifyContractEvent } from '../services/emailService'

const router = express.Router()

router.get('/:projectId/early-warnings', authenticate, requireProjectAccess, async (req: AuthRequest, res): Promise<void> => {
  try {
    const { status } = req.query
    const ews = await prisma.earlyWarning.findMany({
      where: {
        projectId: req.params.projectId,
        ...(status ? { status: status as 'OPEN' | 'MITIGATED' | 'CLOSED' } : {}),
      },
      include: { riskItems: { select: { id: true, riskId: true, status: true } } },
      orderBy: { dateRaised: 'desc' },
    })
    res.json(ews)
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

router.get('/:projectId/early-warnings/:id', authenticate, requireProjectAccess, async (req: AuthRequest, res): Promise<void> => {
  try {
    const ew = await prisma.earlyWarning.findFirst({
      where: { id: req.params.id, projectId: req.params.projectId },
      include: { riskItems: true },
    })
    if (!ew) { res.status(404).json({ message: 'Early Warning not found' }); return }
    res.json(ew)
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

// Formal EW notice PDF (NEC cl. 15)
router.get('/:projectId/early-warnings/:id/pdf', authenticate, requireProjectAccess, async (req: AuthRequest, res): Promise<void> => {
  try {
    const ew = await prisma.earlyWarning.findFirst({
      where: { id: req.params.id, projectId: req.params.projectId },
    })
    if (!ew) { res.status(404).json({ message: 'Early Warning not found' }); return }

    const [project, raisedByUser] = await Promise.all([
      prisma.project.findUnique({ where: { id: req.params.projectId } }),
      prisma.user.findUnique({ where: { id: ew.raisedBy }, select: { name: true } }),
    ])
    await logAudit({ userId: req.user!.id, projectId: req.params.projectId, entityType: 'EarlyWarning', entityId: ew.id, action: 'EXPORT', ipAddress: req.ip })
    generateEarlyWarningPDF(
      res,
      { ...ew, raisedBy: raisedByUser?.name ?? ew.raisedBy } as unknown as Record<string, unknown>,
      project ?? { name: 'Project' },
    )
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

router.post('/:projectId/early-warnings',
  authenticate,
  requireProjectAccess,
  requireProjectRole('ADMIN', 'COMMERCIAL_MANAGER'),
  body('title').notEmpty().trim(),
  body('description').notEmpty().trim(),
  body('dateRaised').isISO8601(),
  async (req: AuthRequest, res): Promise<void> => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return }

    try {
      const { title, description, assignedTo, dateRaised, dateRequired } = req.body
      const ew = await createWithRetry(async () => {
        const ewNumber = await nextNumber('earlyWarning', req.params.projectId, 'EW')
        return prisma.earlyWarning.create({
          data: {
            ewNumber,
            projectId: req.params.projectId,
            title,
            description,
            assignedTo: assignedTo || null,
            dateRaised: new Date(dateRaised),
            dateRequired: dateRequired ? new Date(dateRequired) : null,
            raisedBy: req.user!.id,
          },
          include: { riskItems: true },
        })
      })
      await logAudit({ userId: req.user!.id, projectId: req.params.projectId, entityType: 'EarlyWarning', entityId: ew.id, action: 'CREATE', ipAddress: req.ip })

      notifyContractEvent({
        projectId: req.params.projectId,
        excludeUserId: req.user!.id,
        heading: 'Early Warning raised',
        reference: ew.ewNumber,
        subject: ew.title,
        fields: [
          ['Early Warning', ew.ewNumber],
          ['Date raised', ew.dateRaised.toLocaleDateString('en-GB')],
          ['Required by', ew.dateRequired ? ew.dateRequired.toLocaleDateString('en-GB') : 'Not specified'],
          ['Assigned to', ew.assignedTo ?? 'Unassigned'],
        ],
        note: 'Recipients should attend the next early warning meeting where this matter will be considered.',
      }).catch(console.error)

      res.status(201).json(ew)
    } catch {
      res.status(500).json({ message: 'Server error' })
    }
  },
)

router.put('/:projectId/early-warnings/:id',
  authenticate,
  requireProjectAccess,
  requireProjectRole('ADMIN', 'COMMERCIAL_MANAGER'),
  async (req: AuthRequest, res): Promise<void> => {
    try {
      const existing = await prisma.earlyWarning.findFirst({
        where: { id: req.params.id, projectId: req.params.projectId },
      })
      if (!existing) { res.status(404).json({ message: 'Early Warning not found' }); return }

      const { id, ewNumber, projectId, createdAt, updatedAt, raisedBy, riskItems, ...updateData } = req.body
      if (updateData.dateRaised) updateData.dateRaised = new Date(updateData.dateRaised)
      if (updateData.dateRequired !== undefined) {
        updateData.dateRequired = updateData.dateRequired ? new Date(updateData.dateRequired) : null
      }

      const ew = await prisma.earlyWarning.update({
        where: { id: req.params.id },
        data: updateData,
        include: { riskItems: true },
      })

      const changes = diffObjects(existing as unknown as Record<string, unknown>, updateData)
      const action = existing.status !== ew.status ? 'STATUS_CHANGE' : 'UPDATE'
      await logAudit({ userId: req.user!.id, projectId: req.params.projectId, entityType: 'EarlyWarning', entityId: ew.id, action, changes, ipAddress: req.ip })
      res.json(ew)
    } catch {
      res.status(500).json({ message: 'Server error' })
    }
  },
)

router.delete('/:projectId/early-warnings/:id', authenticate, requireProjectAccess, requireProjectRole('ADMIN'), async (req: AuthRequest, res): Promise<void> => {
  try {
    const existing = await prisma.earlyWarning.findFirst({
      where: { id: req.params.id, projectId: req.params.projectId },
    })
    if (!existing) { res.status(404).json({ message: 'Early Warning not found' }); return }

    await prisma.earlyWarning.delete({ where: { id: req.params.id } })
    await logAudit({ userId: req.user!.id, projectId: req.params.projectId, entityType: 'EarlyWarning', entityId: req.params.id, action: 'DELETE', changes: { record: { old: `${existing.ewNumber}: ${existing.title}`, new: null } }, ipAddress: req.ip })
    res.status(204).send()
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

export default router
