import express from 'express'
import { body, validationResult } from 'express-validator'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import prisma from '../config/database'
import { authenticate, AuthRequest } from '../middleware/auth'
import { requireProjectAccess, requireProjectRole } from '../middleware/roleCheck'
import { logAudit, diffObjects } from '../services/auditService'
import { nextNumber, createWithRetry } from '../services/numberingService'
import { sendCEStatusChangeNotification, notifyContractEvent } from '../services/emailService'
import { isValidTransition, replyDueFrom, quotationDueFrom, quoteReplyDueFrom } from '../services/necRules'

// Files are stored IN the database (bytea) so they survive serverless deploys
// and are backed up with everything else. Legacy rows created before this
// change may still point at ./uploads on disk - downloads fall back to it.
const UPLOAD_DIR = path.join(__dirname, '../../uploads')
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

// List/detail responses must never drag file bytes along - always select
const docSelect = { id: true, ceId: true, category: true, name: true, size: true, mimeType: true, uploadedBy: true, createdAt: true }

const router = express.Router()

router.get('/:projectId/compensation-events', authenticate, requireProjectAccess, async (req: AuthRequest, res): Promise<void> => {
  try {
    const { status } = req.query
    const ces = await prisma.compensationEvent.findMany({
      where: {
        projectId: req.params.projectId,
        ...(status ? { status: status as 'NOTIFIED' | 'QUOTED' | 'ASSESSED' | 'IMPLEMENTED' | 'CLOSED' } : {}),
      },
      include: {
        notices: { select: { id: true, noticeNumber: true, type: true, dateIssued: true } },
        documents: { select: docSelect },
        _count: { select: { notices: true, documents: true } },
      },
      orderBy: { dateNotified: 'desc' },
    })
    res.json(ces)
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

router.get('/:projectId/compensation-events/:id', authenticate, requireProjectAccess, async (req: AuthRequest, res): Promise<void> => {
  try {
    const ce = await prisma.compensationEvent.findFirst({
      where: { id: req.params.id, projectId: req.params.projectId },
      include: {
        notices: true,
        documents: { select: docSelect },
      },
    })
    if (!ce) { res.status(404).json({ message: 'CE not found' }); return }
    res.json(ce)
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

router.post('/:projectId/compensation-events',
  authenticate,
  requireProjectAccess,
  requireProjectRole('ADMIN', 'COMMERCIAL_MANAGER'),
  body('title').notEmpty().trim(),
  body('description').notEmpty().trim(),
  body('dateNotified').isISO8601(),
  async (req: AuthRequest, res): Promise<void> => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return }

    try {
      const { title, description, clauseRef, dateAwareness, dateNotified, dateResponseDue, valuationAmount } = req.body
      const notified = new Date(dateNotified)
      // NEC deadline clocks: default the PM reply period (61.4) and the
      // quotation deadline (62.3) when not explicitly provided
      const responseDue = dateResponseDue ? new Date(dateResponseDue) : replyDueFrom(notified)
      const quotationDue = quotationDueFrom(notified)

      const ce = await createWithRetry(async () => {
        const ceNumber = await nextNumber('compensationEvent', req.params.projectId, 'CE')
        return prisma.compensationEvent.create({
          data: {
            ceNumber,
            projectId: req.params.projectId,
            title,
            description,
            clauseRef: clauseRef || null,
            dateAwareness: dateAwareness ? new Date(dateAwareness) : null,
            dateNotified: notified,
            dateResponseDue: responseDue,
            dateQuotationDue: quotationDue,
            valuationAmount: valuationAmount !== undefined && valuationAmount !== null && valuationAmount !== '' ? Number(valuationAmount) : null,
            notifiedBy: req.user!.id,
          },
          include: { notices: true, documents: { select: docSelect }, _count: { select: { notices: true, documents: true } } },
        })
      })
      await logAudit({ userId: req.user!.id, projectId: req.params.projectId, entityType: 'CompensationEvent', entityId: ce.id, action: 'CREATE', ipAddress: req.ip })

      notifyContractEvent({
        projectId: req.params.projectId,
        excludeUserId: req.user!.id,
        heading: 'Compensation Event notified',
        reference: ce.ceNumber,
        subject: ce.title,
        fields: [
          ['Compensation Event', ce.ceNumber],
          ['NEC clause', ce.clauseRef ?? 'Not stated'],
          ['Date notified', ce.dateNotified.toLocaleDateString('en-GB')],
          ['Response due', ce.dateResponseDue ? ce.dateResponseDue.toLocaleDateString('en-GB') : '-'],
          ['Quotation due', ce.dateQuotationDue ? ce.dateQuotationDue.toLocaleDateString('en-GB') : '-'],
        ],
        note: 'A reply is required within the contractual period shown above.',
      }).catch(console.error)

      res.status(201).json(ce)
    } catch {
      res.status(500).json({ message: 'Server error' })
    }
  },
)

router.put('/:projectId/compensation-events/:id',
  authenticate,
  requireProjectAccess,
  requireProjectRole('ADMIN', 'COMMERCIAL_MANAGER'),
  async (req: AuthRequest, res): Promise<void> => {
    try {
      const existing = await prisma.compensationEvent.findFirst({
        where: { id: req.params.id, projectId: req.params.projectId },
      })
      if (!existing) { res.status(404).json({ message: 'CE not found' }); return }

      const { id, ceNumber, projectId, createdAt, updatedAt, notices, documents, notifiedBy, _count, ...updateData } = req.body

      // NEC workflow is forward-only
      if (updateData.status && !isValidTransition(existing.status, updateData.status)) {
        res.status(400).json({ message: `Invalid NEC workflow transition: ${existing.status} → ${updateData.status}. Status can only move forward.` })
        return
      }

      if (updateData.dateNotified) updateData.dateNotified = new Date(updateData.dateNotified)
      if (updateData.dateAwareness !== undefined) {
        updateData.dateAwareness = updateData.dateAwareness ? new Date(updateData.dateAwareness) : null
      }
      if (updateData.dateResponseDue !== undefined) {
        updateData.dateResponseDue = updateData.dateResponseDue ? new Date(updateData.dateResponseDue) : null
      }
      if (updateData.dateQuotationDue !== undefined) {
        updateData.dateQuotationDue = updateData.dateQuotationDue ? new Date(updateData.dateQuotationDue) : null
      }
      // cl. 62.3: once the quotation is submitted (status → QUOTED), the PM has
      // 2 weeks to reply - restart the response clock automatically
      if (updateData.status === 'QUOTED' && existing.status !== 'QUOTED' && updateData.dateResponseDue === undefined) {
        updateData.dateResponseDue = quoteReplyDueFrom(new Date())
      }
      if (updateData.valuationAmount !== undefined) {
        updateData.valuationAmount = updateData.valuationAmount === null || updateData.valuationAmount === '' ? null : Number(updateData.valuationAmount)
      }

      const ce = await prisma.compensationEvent.update({
        where: { id: req.params.id },
        data: updateData,
        include: { notices: true, documents: { select: docSelect }, _count: { select: { notices: true, documents: true } } },
      })

      const changes = diffObjects(existing as unknown as Record<string, unknown>, updateData)
      const statusChanged = existing.status !== ce.status
      await logAudit({ userId: req.user!.id, projectId: req.params.projectId, entityType: 'CompensationEvent', entityId: ce.id, action: statusChanged ? 'STATUS_CHANGE' : 'UPDATE', changes, ipAddress: req.ip })

      if (statusChanged) {
        // Notify project team of the workflow move (fire-and-forget)
        prisma.project.findUnique({
          where: { id: req.params.projectId },
          include: { members: { include: { user: { select: { email: true } } } } },
        }).then((project) => {
          if (!project) return
          const recipients = project.members.filter((m) => m.role !== 'VIEWER').map((m) => m.user.email)
          return sendCEStatusChangeNotification(ce.ceNumber, ce.title, project.name, existing.status, ce.status, req.user!.email, recipients)
        }).catch(console.error)
      }

      res.json(ce)
    } catch {
      res.status(500).json({ message: 'Server error' })
    }
  },
)

router.post('/:projectId/compensation-events/:id/documents',
  authenticate,
  requireProjectAccess,
  requireProjectRole('ADMIN', 'COMMERCIAL_MANAGER'),
  upload.single('file'),
  async (req: AuthRequest, res): Promise<void> => {
    if (!req.file) { res.status(400).json({ message: 'No file uploaded' }); return }
    try {
      const ce = await prisma.compensationEvent.findFirst({
        where: { id: req.params.id, projectId: req.params.projectId },
      })
      if (!ce) { res.status(404).json({ message: 'CE not found' }); return }

      // Photos are recognised so they surface in the CE photo gallery
      const isImage = req.file.mimetype.startsWith('image/')
      const doc = await prisma.document.create({
        data: {
          projectId: req.params.projectId,
          ceId: req.params.id,
          category: isImage ? 'PHOTO' : 'GENERAL',
          name: req.file.originalname,
          path: '',
          size: req.file.size,
          mimeType: req.file.mimetype,
          uploadedBy: req.user!.id,
          data: req.file.buffer,
        },
        select: docSelect,
      })
      await logAudit({ userId: req.user!.id, projectId: req.params.projectId, entityType: 'Document', entityId: doc.id, action: 'CREATE', ipAddress: req.ip })
      res.status(201).json(doc)
    } catch {
      res.status(500).json({ message: 'Server error' })
    }
  },
)

// NOTE: document listing, upload, download and delete now live in routes/documents.ts

// Deleting contractual records is restricted to project ADMINs and is always audited
router.delete('/:projectId/compensation-events/:id', authenticate, requireProjectAccess, requireProjectRole('ADMIN'), async (req: AuthRequest, res): Promise<void> => {
  try {
    const existing = await prisma.compensationEvent.findFirst({
      where: { id: req.params.id, projectId: req.params.projectId },
      include: { documents: { select: { path: true } } },
    })
    if (!existing) { res.status(404).json({ message: 'CE not found' }); return }

    await prisma.compensationEvent.delete({ where: { id: req.params.id } })
    // Remove orphaned legacy disk files (DB-stored files cascade automatically)
    for (const doc of existing.documents) {
      if (!doc.path) continue
      const filePath = path.join(UPLOAD_DIR, path.basename(doc.path))
      fs.promises.unlink(filePath).catch(() => {})
    }
    await logAudit({ userId: req.user!.id, projectId: req.params.projectId, entityType: 'CompensationEvent', entityId: req.params.id, action: 'DELETE', changes: { record: { old: `${existing.ceNumber}: ${existing.title}`, new: null } }, ipAddress: req.ip })
    res.status(204).send()
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

export default router
