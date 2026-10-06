import express from 'express'
import { body, validationResult } from 'express-validator'
import prisma from '../config/database'
import { authenticate, AuthRequest } from '../middleware/auth'
import { requireProjectAccess, requireProjectRole } from '../middleware/roleCheck'
import { logAudit } from '../services/auditService'
import { generateNoticePDF } from '../services/pdfService'
import { notifyContractEvent } from '../services/emailService'
import { nextNumber, createWithRetry } from '../services/numberingService'

const NOTICE_TYPES = ['EARLY_WARNING', 'COMPENSATION_EVENT', 'INSTRUCTION', 'ACCEPTANCE', 'REJECTION', 'QUOTATION', 'ASSESSMENT', 'GENERAL']

const router = express.Router()

router.get('/:projectId/notices', authenticate, requireProjectAccess, async (req: AuthRequest, res): Promise<void> => {
  try {
    const { type, ceId } = req.query
    const notices = await prisma.notice.findMany({
      where: {
        projectId: req.params.projectId,
        ...(type ? { type: type as 'EARLY_WARNING' | 'COMPENSATION_EVENT' | 'INSTRUCTION' | 'ACCEPTANCE' | 'REJECTION' | 'QUOTATION' | 'ASSESSMENT' | 'GENERAL' } : {}),
        ...(ceId ? { ceId: ceId as string } : {}),
      },
      include: { ce: { select: { id: true, ceNumber: true, title: true } } },
      orderBy: { dateIssued: 'desc' },
    })
    res.json(notices)
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

router.post('/:projectId/notices',
  authenticate,
  requireProjectAccess,
  requireProjectRole('ADMIN', 'COMMERCIAL_MANAGER'),
  body('title').notEmpty().trim(),
  body('content').notEmpty().trim(),
  body('type').isIn(NOTICE_TYPES),
  body('issuedTo').notEmpty().trim(),
  body('dateIssued').isISO8601(),
  async (req: AuthRequest, res): Promise<void> => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return }

    try {
      const { title, content, type, issuedTo, ceId, dateIssued, dueDate } = req.body

      // A linked CE must belong to the same project
      if (ceId) {
        const ce = await prisma.compensationEvent.findFirst({ where: { id: ceId, projectId: req.params.projectId } })
        if (!ce) { res.status(400).json({ message: 'Linked CE not found in this project' }); return }
      }

      const notice = await createWithRetry(async () => {
        const noticeNumber = await nextNumber('notice', req.params.projectId, 'N')
        return prisma.notice.create({
          data: {
            noticeNumber,
            projectId: req.params.projectId,
            title,
            content,
            type,
            issuedBy: req.user!.id,
            issuedTo,
            ceId: ceId || null,
            dateIssued: new Date(dateIssued),
            dueDate: dueDate ? new Date(dueDate) : null,
          },
          include: { ce: { select: { id: true, ceNumber: true, title: true } } },
        })
      })
      await logAudit({ userId: req.user!.id, projectId: req.params.projectId, entityType: 'Notice', entityId: notice.id, action: 'CREATE', ipAddress: req.ip })

      notifyContractEvent({
        projectId: req.params.projectId,
        excludeUserId: req.user!.id,
        heading: 'Notice issued',
        reference: notice.noticeNumber,
        subject: notice.title,
        fields: [
          ['Notice', notice.noticeNumber],
          ['Type', String(notice.type).replace(/_/g, ' ')],
          ['Issued to', notice.issuedTo],
          ['Date issued', notice.dateIssued.toLocaleDateString('en-GB')],
          ['Response due', notice.dueDate ? notice.dueDate.toLocaleDateString('en-GB') : 'Not specified'],
        ],
        note: 'This notice forms part of the project’s contractual record.',
      }).catch(console.error)

      res.status(201).json(notice)
    } catch {
      res.status(500).json({ message: 'Server error' })
    }
  },
)

router.get('/:projectId/notices/:id/pdf', authenticate, requireProjectAccess, async (req: AuthRequest, res): Promise<void> => {
  try {
    const notice = await prisma.notice.findFirst({
      where: { id: req.params.id, projectId: req.params.projectId },
      include: { ce: true },
    })
    if (!notice) { res.status(404).json({ message: 'Notice not found' }); return }

    const [project, issuer] = await Promise.all([
      prisma.project.findUnique({ where: { id: req.params.projectId } }),
      prisma.user.findUnique({ where: { id: notice.issuedBy }, select: { name: true } }),
    ])
    await logAudit({ userId: req.user!.id, projectId: req.params.projectId, entityType: 'Notice', entityId: notice.id, action: 'EXPORT', ipAddress: req.ip })
    generateNoticePDF(
      res,
      { ...notice, issuedBy: issuer?.name ?? notice.issuedBy } as unknown as Record<string, unknown>,
      project ?? { name: 'Project' },
    )
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

router.delete('/:projectId/notices/:id', authenticate, requireProjectAccess, requireProjectRole('ADMIN'), async (req: AuthRequest, res): Promise<void> => {
  try {
    const existing = await prisma.notice.findFirst({
      where: { id: req.params.id, projectId: req.params.projectId },
    })
    if (!existing) { res.status(404).json({ message: 'Notice not found' }); return }

    await prisma.notice.delete({ where: { id: req.params.id } })
    await logAudit({ userId: req.user!.id, projectId: req.params.projectId, entityType: 'Notice', entityId: req.params.id, action: 'DELETE', changes: { record: { old: `${existing.noticeNumber}: ${existing.title}`, new: null } }, ipAddress: req.ip })
    res.status(204).send()
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

export default router
