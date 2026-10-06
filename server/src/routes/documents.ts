import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import prisma from '../config/database'
import { authenticate, AuthRequest } from '../middleware/auth'
import { requireProjectAccess, requireProjectRole } from '../middleware/roleCheck'
import { logAudit } from '../services/auditService'

// Files live in the database (bytea) so they survive serverless deploys and are
// covered by database backups. Legacy rows may still point at ./uploads.
const UPLOAD_DIR = path.join(__dirname, '../../uploads')
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } })

const CATEGORIES = ['GENERAL', 'PHOTO', 'DRAWING'] as const
type Category = typeof CATEGORIES[number]

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic']

// Never select `data` in list responses - file bytes must not travel with JSON
const docSelect = {
  id: true, projectId: true, ceId: true, ewId: true, category: true, reference: true,
  name: true, size: true, mimeType: true, uploadedBy: true, createdAt: true,
}

const router = express.Router()

// ── List documents, optionally filtered by category or parent record ─────────
router.get('/:projectId/documents', authenticate, requireProjectAccess, async (req: AuthRequest, res): Promise<void> => {
  try {
    const { category, ceId, ewId } = req.query
    const docs = await prisma.document.findMany({
      where: {
        projectId: req.params.projectId,
        ...(category && CATEGORIES.includes(category as Category) ? { category: category as Category } : {}),
        ...(ceId ? { ceId: ceId as string } : {}),
        ...(ewId ? { ewId: ewId as string } : {}),
      },
      select: { ...docSelect, ce: { select: { id: true, ceNumber: true, title: true } }, ew: { select: { id: true, ewNumber: true, title: true } } },
      orderBy: { createdAt: 'desc' },
    })

    const userIds = [...new Set(docs.map((d) => d.uploadedBy))]
    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    const nameMap = new Map(users.map((u) => [u.id, u.name]))
    res.json(docs.map((d) => ({ ...d, uploadedByName: nameMap.get(d.uploadedBy) ?? 'Unknown' })))
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

// ── Upload: a photo proof, a drawing, or a general file ──────────────────────
router.post('/:projectId/documents',
  authenticate,
  requireProjectAccess,
  requireProjectRole('ADMIN', 'COMMERCIAL_MANAGER'),
  upload.single('file'),
  async (req: AuthRequest, res): Promise<void> => {
    if (!req.file) { res.status(400).json({ message: 'No file uploaded' }); return }

    const category = (CATEGORIES.includes(req.body.category) ? req.body.category : 'GENERAL') as Category
    const { ceId, ewId, reference } = req.body

    try {
      // Photo proofs must actually be images, or the gallery breaks
      if (category === 'PHOTO' && !IMAGE_TYPES.includes(req.file.mimetype)) {
        res.status(400).json({ message: 'Photo proofs must be an image (JPG, PNG, WEBP or GIF).' })
        return
      }
      // A parent record, when given, must belong to this project
      if (ceId) {
        const ce = await prisma.compensationEvent.findFirst({ where: { id: ceId, projectId: req.params.projectId } })
        if (!ce) { res.status(400).json({ message: 'Compensation event not found in this project' }); return }
      }
      if (ewId) {
        const ew = await prisma.earlyWarning.findFirst({ where: { id: ewId, projectId: req.params.projectId } })
        if (!ew) { res.status(400).json({ message: 'Early warning not found in this project' }); return }
      }

      const doc = await prisma.document.create({
        data: {
          projectId: req.params.projectId,
          ceId: ceId || null,
          ewId: ewId || null,
          category,
          reference: reference?.trim() || null,
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

// ── Download / inline view (authenticated; never a public URL) ────────────────
router.get('/:projectId/documents/:docId/download', authenticate, requireProjectAccess, async (req: AuthRequest, res): Promise<void> => {
  try {
    const doc = await prisma.document.findFirst({
      where: { id: req.params.docId, projectId: req.params.projectId },
    })
    if (!doc) { res.status(404).json({ message: 'Document not found' }); return }

    // `inline` lets the browser render image previews without downloading
    const disposition = req.query.inline === '1' ? 'inline' : 'attachment'
    res.setHeader('Content-Type', doc.mimeType)
    res.setHeader('Content-Disposition', `${disposition}; filename="${doc.name.replace(/"/g, '')}"`)

    if (doc.data) {
      await logAudit({ userId: req.user!.id, projectId: req.params.projectId, entityType: 'Document', entityId: doc.id, action: 'EXPORT', ipAddress: req.ip })
      res.send(Buffer.from(doc.data))
      return
    }

    // Legacy row stored on disk
    const filePath = path.join(UPLOAD_DIR, path.basename(doc.path || ''))
    if (!doc.path || !fs.existsSync(filePath)) { res.status(404).json({ message: 'File missing from storage' }); return }
    await logAudit({ userId: req.user!.id, projectId: req.params.projectId, entityType: 'Document', entityId: doc.id, action: 'EXPORT', ipAddress: req.ip })
    fs.createReadStream(filePath).pipe(res)
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

// ── Delete ───────────────────────────────────────────────────────────────────
router.delete('/:projectId/documents/:docId',
  authenticate,
  requireProjectAccess,
  requireProjectRole('ADMIN', 'COMMERCIAL_MANAGER'),
  async (req: AuthRequest, res): Promise<void> => {
    try {
      const { count } = await prisma.document.deleteMany({
        where: { id: req.params.docId, projectId: req.params.projectId },
      })
      if (count === 0) { res.status(404).json({ message: 'Document not found' }); return }
      await logAudit({ userId: req.user!.id, projectId: req.params.projectId, entityType: 'Document', entityId: req.params.docId, action: 'DELETE', ipAddress: req.ip })
      res.status(204).send()
    } catch {
      res.status(500).json({ message: 'Server error' })
    }
  },
)

export default router
