import express from 'express'
import { body, validationResult } from 'express-validator'
import prisma from '../config/database'
import { authenticate, AuthRequest } from '../middleware/auth'
import { requireProjectAccess, requireProjectRole } from '../middleware/roleCheck'
import { logAudit } from '../services/auditService'
import { sendCommentNotification } from '../services/emailService'

const TARGETS = ['PROJECT', 'EARLY_WARNING', 'RISK', 'COMPENSATION_EVENT', 'NOTICE'] as const
type Target = typeof TARGETS[number]

// Reacting with this is treated as a formal acknowledgement and audit-logged
export const ACK_EMOJI = '✅'

const router = express.Router()

// Human-readable reference for the record being discussed, used in emails
async function describeTarget(targetType: Target, targetId: string, projectName: string): Promise<string> {
  try {
    if (targetType === 'PROJECT') return projectName
    if (targetType === 'EARLY_WARNING') {
      const r = await prisma.earlyWarning.findUnique({ where: { id: targetId }, select: { ewNumber: true, title: true } })
      return r ? `${r.ewNumber} - ${r.title}` : 'Early Warning'
    }
    if (targetType === 'RISK') {
      const r = await prisma.riskItem.findUnique({ where: { id: targetId }, select: { riskId: true, description: true } })
      return r ? `${r.riskId} - ${r.description.slice(0, 60)}` : 'Risk'
    }
    if (targetType === 'COMPENSATION_EVENT') {
      const r = await prisma.compensationEvent.findUnique({ where: { id: targetId }, select: { ceNumber: true, title: true } })
      return r ? `${r.ceNumber} - ${r.title}` : 'Compensation Event'
    }
    const r = await prisma.notice.findUnique({ where: { id: targetId }, select: { noticeNumber: true, title: true } })
    return r ? `${r.noticeNumber} - ${r.title}` : 'Notice'
  } catch {
    return projectName
  }
}

// Managers (and platform admins) see restricted comments; viewers never do.
const canSeeRestricted = (req: AuthRequest): boolean =>
  req.user!.role === 'ADMIN' || req.projectRole === 'ADMIN' || req.projectRole === 'COMMERCIAL_MANAGER'

// ── List the thread for one record (or the project itself) ───────────────────
router.get('/:projectId/comments', authenticate, requireProjectAccess, async (req: AuthRequest, res): Promise<void> => {
  const { targetType, targetId } = req.query
  if (!targetType || !TARGETS.includes(targetType as Target)) {
    res.status(400).json({ message: 'Invalid targetType' })
    return
  }
  try {
    const comments = await prisma.comment.findMany({
      where: {
        projectId: req.params.projectId,
        targetType: targetType as Target,
        targetId: (targetId as string) || req.params.projectId,
        // Restricted comments are filtered out in the query itself, so they
        // never leave the server for someone who shouldn't see them.
        ...(canSeeRestricted(req) ? {} : { visibility: 'EVERYONE' as const }),
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
        reactions: { include: { user: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    })
    res.json(comments)
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

// ── Unread counts per thread, for badges on record lists ─────────────────────
router.get('/:projectId/comments/unread', authenticate, requireProjectAccess, async (req: AuthRequest, res): Promise<void> => {
  try {
    const [comments, views] = await Promise.all([
      prisma.comment.findMany({
        where: {
          projectId: req.params.projectId,
          authorId: { not: req.user!.id },
          ...(canSeeRestricted(req) ? {} : { visibility: 'EVERYONE' as const }),
        },
        select: { targetType: true, targetId: true, createdAt: true },
      }),
      prisma.commentView.findMany({ where: { userId: req.user!.id, projectId: req.params.projectId } }),
    ])

    const key = (t: string, id: string) => `${t}:${id}`
    const lastRead = new Map(views.map((v) => [key(v.targetType, v.targetId), v.lastReadAt]))
    const counts = new Map<string, { targetType: string; targetId: string; count: number }>()
    for (const c of comments) {
      const seenAt = lastRead.get(key(c.targetType, c.targetId))
      if (seenAt && c.createdAt <= seenAt) continue
      const k = key(c.targetType, c.targetId)
      const entry = counts.get(k)
      if (entry) entry.count += 1
      else counts.set(k, { targetType: c.targetType, targetId: c.targetId, count: 1 })
    }
    res.json([...counts.values()])
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

// ── Mark a thread as read (called when the thread is opened) ─────────────────
router.post('/:projectId/comments/read', authenticate, requireProjectAccess, async (req: AuthRequest, res): Promise<void> => {
  const targetType = req.body.targetType as Target
  if (!TARGETS.includes(targetType)) { res.status(400).json({ message: 'Invalid targetType' }); return }
  const targetId = req.body.targetId || req.params.projectId
  try {
    await prisma.commentView.upsert({
      where: { userId_targetType_targetId: { userId: req.user!.id, targetType, targetId } },
      update: { lastReadAt: new Date() },
      create: { userId: req.user!.id, projectId: req.params.projectId, targetType, targetId },
    })
    res.status(204).send()
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

// ── Toggle a reaction (WhatsApp-style: tap once to add, again to remove) ─────
router.post('/:projectId/comments/:id/reactions',
  authenticate,
  requireProjectAccess,
  body('emoji').isString().isLength({ min: 1, max: 8 }),
  async (req: AuthRequest, res): Promise<void> => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return }
    if (req.projectActive === false) {
      res.status(403).json({ message: 'This project has been completed and is read-only.' })
      return
    }
    try {
      const comment = await prisma.comment.findFirst({
        where: { id: req.params.id, projectId: req.params.projectId },
      })
      if (!comment) { res.status(404).json({ message: 'Comment not found' }); return }
      // Don't let a viewer react to a comment they aren't allowed to see
      if (comment.visibility === 'MANAGERS_ONLY' && !canSeeRestricted(req)) {
        res.status(403).json({ message: 'Not permitted' })
        return
      }

      const emoji = req.body.emoji as string
      const existing = await prisma.commentReaction.findUnique({
        where: { commentId_userId_emoji: { commentId: comment.id, userId: req.user!.id, emoji } },
      })
      if (existing) {
        await prisma.commentReaction.delete({ where: { id: existing.id } })
      } else {
        await prisma.commentReaction.create({ data: { commentId: comment.id, userId: req.user!.id, emoji } })
        // An acknowledgement is contractually meaningful - record who
        // acknowledged what and when, so it can be evidenced later.
        if (emoji === ACK_EMOJI) {
          await logAudit({
            userId: req.user!.id,
            projectId: req.params.projectId,
            entityType: 'Comment',
            entityId: comment.id,
            action: 'STATUS_CHANGE',
            changes: { acknowledged: { old: null, new: comment.body.slice(0, 120) } },
            ipAddress: req.ip,
          })
        }
      }

      const reactions = await prisma.commentReaction.findMany({
        where: { commentId: comment.id },
        include: { user: { select: { id: true, name: true } } },
      })
      res.json(reactions)
    } catch {
      res.status(500).json({ message: 'Server error' })
    }
  },
)

// ── Post a comment ───────────────────────────────────────────────────────────
// Viewers are intentionally allowed to comment: the client side of a contract
// often has read-only record access but must still be able to respond.
router.post('/:projectId/comments',
  authenticate,
  requireProjectAccess,
  requireProjectRole('ADMIN', 'COMMERCIAL_MANAGER', 'VIEWER'),
  body('body').trim().notEmpty().withMessage('Comment cannot be empty').isLength({ max: 5000 }),
  body('targetType').isIn(TARGETS),
  async (req: AuthRequest, res): Promise<void> => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return }

    const projectId = req.params.projectId
    const targetType = req.body.targetType as Target
    const targetId = req.body.targetId || projectId
    // Only managers may restrict a comment; a viewer's request is ignored
    const visibility = req.body.visibility === 'MANAGERS_ONLY' && canSeeRestricted(req)
      ? 'MANAGERS_ONLY' as const
      : 'EVERYONE' as const

    try {
      const comment = await prisma.comment.create({
        data: { projectId, targetType, targetId, body: req.body.body, authorId: req.user!.id, visibility },
        include: {
          author: { select: { id: true, name: true, email: true } },
          reactions: { include: { user: { select: { id: true, name: true } } } },
        },
      })
      await logAudit({ userId: req.user!.id, projectId, entityType: 'Comment', entityId: comment.id, action: 'CREATE', ipAddress: req.ip })

      // Notify the rest of the project team (fire-and-forget)
      prisma.project.findUnique({
        where: { id: projectId },
        include: { members: { include: { user: { select: { id: true, email: true, role: true, notifyComments: true } } } } },
      }).then(async (project) => {
        if (!project) return
        const recipients = project.members
          .filter((m) => m.user.id !== req.user!.id)
          // Respect each person's notification preference
          .filter((m) => m.user.notifyComments)
          // A restricted comment must not leak through the notification email
          .filter((m) => visibility === 'EVERYONE' || m.role === 'ADMIN' || m.role === 'COMMERCIAL_MANAGER' || m.user.role === 'ADMIN')
          .map((m) => m.user.email)
        if (recipients.length === 0) return
        const on = await describeTarget(targetType, targetId, project.name)
        return sendCommentNotification({
          recipients,
          projectName: project.name,
          on,
          authorName: comment.author.name,
          body: comment.body,
        })
      }).catch(console.error)

      res.status(201).json(comment)
    } catch {
      res.status(500).json({ message: 'Server error' })
    }
  },
)

// ── Delete a comment (author or project admin) ───────────────────────────────
router.delete('/:projectId/comments/:id', authenticate, requireProjectAccess, async (req: AuthRequest, res): Promise<void> => {
  try {
    const comment = await prisma.comment.findFirst({
      where: { id: req.params.id, projectId: req.params.projectId },
    })
    if (!comment) { res.status(404).json({ message: 'Comment not found' }); return }

    const isAdmin = req.user!.role === 'ADMIN' || req.projectRole === 'ADMIN'
    if (comment.authorId !== req.user!.id && !isAdmin) {
      res.status(403).json({ message: 'You can only delete your own comments' })
      return
    }
    if (req.projectActive === false) {
      res.status(403).json({ message: 'This project has been completed and is read-only.' })
      return
    }

    await prisma.comment.delete({ where: { id: comment.id } })
    await logAudit({ userId: req.user!.id, projectId: req.params.projectId, entityType: 'Comment', entityId: comment.id, action: 'DELETE', ipAddress: req.ip })
    res.status(204).send()
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

export default router
