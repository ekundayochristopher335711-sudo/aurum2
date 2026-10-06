import express from 'express'
import { body, validationResult } from 'express-validator'
import prisma from '../config/database'
import { authenticate, AuthRequest } from '../middleware/auth'
import { requireRole, requireProjectAccess, requireProjectRole } from '../middleware/roleCheck'
import { logAudit } from '../services/auditService'

const router = express.Router()

router.get('/', authenticate, async (req: AuthRequest, res): Promise<void> => {
  try {
    const where = req.user!.role === 'ADMIN'
      ? {}
      : { members: { some: { userId: req.user!.id } } }

    const projects = await prisma.project.findMany({
      where,
      include: {
        _count: {
          select: {
            earlyWarnings: true,
            compensationEvents: true,
            riskItems: true,
            notices: true,
          },
        },
        members: {
          include: { user: { select: { id: true, name: true, email: true, role: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json(projects)
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

router.post('/',
  authenticate,
  requireRole('ADMIN', 'COMMERCIAL_MANAGER'),
  body('name').notEmpty().trim(),
  async (req: AuthRequest, res): Promise<void> => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return }

    try {
      const { name, description, contractType, clientName, contractorName, startDate, endDate, contractValue } = req.body
      const project = await prisma.project.create({
        data: {
          name, description, contractType, clientName, contractorName,
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
          contractValue: contractValue ? Number(contractValue) : undefined,
          members: { create: { userId: req.user!.id, role: 'ADMIN' } },
        },
      })
      await logAudit({ userId: req.user!.id, projectId: project.id, entityType: 'Project', entityId: project.id, action: 'CREATE', ipAddress: req.ip })
      res.status(201).json(project)
    } catch {
      res.status(500).json({ message: 'Server error' })
    }
  },
)

router.get('/:projectId', authenticate, requireProjectAccess, async (req: AuthRequest, res): Promise<void> => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.projectId },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true, role: true } } },
        },
        _count: {
          select: {
            earlyWarnings: true,
            compensationEvents: true,
            riskItems: true,
            notices: true,
          },
        },
      },
    })
    if (!project) { res.status(404).json({ message: 'Project not found' }); return }
    res.json(project)
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

router.put('/:projectId',
  authenticate,
  requireProjectAccess,
  requireProjectRole('ADMIN', 'COMMERCIAL_MANAGER'),
  async (req: AuthRequest, res): Promise<void> => {
    try {
      const { id, members, _count, createdAt, updatedAt, ...updateData } = req.body
      if (updateData.startDate) updateData.startDate = new Date(updateData.startDate)
      if (updateData.endDate) updateData.endDate = new Date(updateData.endDate)
      const project = await prisma.project.update({ where: { id: req.params.projectId }, data: updateData })
      await logAudit({ userId: req.user!.id, projectId: project.id, entityType: 'Project', entityId: project.id, action: 'UPDATE', ipAddress: req.ip })
      res.json(project)
    } catch {
      res.status(500).json({ message: 'Server error' })
    }
  },
)

router.post('/:projectId/members',
  authenticate,
  requireProjectAccess,
  requireProjectRole('ADMIN'),
  async (req: AuthRequest, res): Promise<void> => {
    const { userId, role } = req.body
    if (!['ADMIN', 'COMMERCIAL_MANAGER', 'VIEWER'].includes(role)) {
      res.status(400).json({ message: 'Invalid role' })
      return
    }
    try {
      const member = await prisma.projectMember.upsert({
        where: { userId_projectId: { userId, projectId: req.params.projectId } },
        update: { role },
        create: { userId, projectId: req.params.projectId, role },
      })
      res.status(201).json(member)
    } catch {
      res.status(500).json({ message: 'Server error' })
    }
  },
)

// Complete a project - freezes it read-only, drops it from reminder emails.
// Inline admin check (not requireProjectRole) so reopen also works while frozen.
const isProjectAdmin = (req: AuthRequest) => req.user!.role === 'ADMIN' || req.projectRole === 'ADMIN'

router.post('/:projectId/complete', authenticate, requireProjectAccess, async (req: AuthRequest, res): Promise<void> => {
  if (!isProjectAdmin(req)) { res.status(403).json({ message: 'Only project admins can complete a project' }); return }
  try {
    const project = await prisma.project.update({ where: { id: req.params.projectId }, data: { isActive: false } })
    await logAudit({ userId: req.user!.id, projectId: project.id, entityType: 'Project', entityId: project.id, action: 'STATUS_CHANGE', changes: { status: { old: 'ACTIVE', new: 'COMPLETED' } }, ipAddress: req.ip })
    res.json(project)
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

router.post('/:projectId/reopen', authenticate, requireProjectAccess, async (req: AuthRequest, res): Promise<void> => {
  if (!isProjectAdmin(req)) { res.status(403).json({ message: 'Only project admins can reopen a project' }); return }
  try {
    const project = await prisma.project.update({ where: { id: req.params.projectId }, data: { isActive: true } })
    await logAudit({ userId: req.user!.id, projectId: project.id, entityType: 'Project', entityId: project.id, action: 'STATUS_CHANGE', changes: { status: { old: 'COMPLETED', new: 'ACTIVE' } }, ipAddress: req.ip })
    res.json(project)
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

// Remove a member from the project (project ADMIN only, never yourself)
router.delete('/:projectId/members/:userId',
  authenticate,
  requireProjectAccess,
  requireProjectRole('ADMIN'),
  async (req: AuthRequest, res): Promise<void> => {
    if (req.params.userId === req.user!.id) { res.status(400).json({ message: 'You cannot remove yourself from the project' }); return }
    try {
      const { count } = await prisma.projectMember.deleteMany({
        where: { projectId: req.params.projectId, userId: req.params.userId },
      })
      if (count === 0) { res.status(404).json({ message: 'Member not found' }); return }
      await logAudit({ userId: req.user!.id, projectId: req.params.projectId, entityType: 'ProjectMember', entityId: req.params.userId, action: 'DELETE', ipAddress: req.ip })
      res.status(204).send()
    } catch {
      res.status(500).json({ message: 'Server error' })
    }
  },
)

export default router
