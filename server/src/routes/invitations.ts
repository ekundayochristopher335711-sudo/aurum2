import express, { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { body, validationResult } from 'express-validator'
import prisma from '../config/database'
import { authenticate, AuthRequest } from '../middleware/auth'
import { requireProjectAccess, requireProjectRole } from '../middleware/roleCheck'
import { logAudit } from '../services/auditService'
import { sendInvitationEmail } from '../services/emailService'

// Project-scoped router → mounted at /api/projects
const router = express.Router()
// Public router (token flows, no auth) → mounted at /api/invitations
export const publicRouter = express.Router()

// ── Send invitation ───────────────────────────────────────────────────────────
router.post('/:projectId/invitations',
  authenticate,
  requireProjectAccess,
  requireProjectRole('ADMIN', 'COMMERCIAL_MANAGER'),
  body('email').isEmail().normalizeEmail(),
  body('role').isIn(['ADMIN', 'COMMERCIAL_MANAGER', 'VIEWER']),
  async (req: AuthRequest, res): Promise<void> => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return }

    const { email, role } = req.body
    const projectId = req.params.projectId

    try {
      const project = await prisma.project.findUnique({ where: { id: projectId } })
      if (!project) { res.status(404).json({ message: 'Project not found' }); return }

      // Check if user already a member
      const existingUser = await prisma.user.findUnique({ where: { email } })
      if (existingUser) {
        const alreadyMember = await prisma.projectMember.findUnique({
          where: { userId_projectId: { userId: existingUser.id, projectId } },
        })
        if (alreadyMember) { res.status(409).json({ message: 'User is already a member of this project' }); return }
      }

      // Expire any previous pending invitations for this email+project
      await prisma.invitation.deleteMany({
        where: { email, projectId, acceptedAt: null },
      })

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      const invitation = await prisma.invitation.create({
        data: { email, projectId, role, expiresAt, invitedBy: req.user!.id },
      })

      const inviteUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/accept-invitation/${invitation.token}`
      const inviter = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { name: true } })

      await sendInvitationEmail(email, inviter?.name ?? 'A team member', project.name, role, inviteUrl)

      await logAudit({ userId: req.user!.id, projectId, entityType: 'Invitation', entityId: invitation.id, action: 'CREATE', ipAddress: req.ip })
      res.status(201).json({ message: `Invitation sent to ${email}`, token: invitation.token })
    } catch (e) {
      console.error(e)
      res.status(500).json({ message: 'Failed to send invitation' })
    }
  },
)

// ── Get pending invitations for a project ────────────────────────────────────
router.get('/:projectId/invitations',
  authenticate,
  requireProjectAccess,
  requireProjectRole('ADMIN', 'COMMERCIAL_MANAGER'),
  async (req: AuthRequest, res): Promise<void> => {
    try {
      const invitations = await prisma.invitation.findMany({
        where: { projectId: req.params.projectId, acceptedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      })
      res.json(invitations)
    } catch {
      res.status(500).json({ message: 'Server error' })
    }
  },
)

// ── Revoke invitation (scoped to the project) ────────────────────────────────
router.delete('/:projectId/invitations/:id',
  authenticate,
  requireProjectAccess,
  requireProjectRole('ADMIN', 'COMMERCIAL_MANAGER'),
  async (req: AuthRequest, res): Promise<void> => {
    try {
      const { count } = await prisma.invitation.deleteMany({
        where: { id: req.params.id, projectId: req.params.projectId },
      })
      if (count === 0) { res.status(404).json({ message: 'Invitation not found' }); return }
      res.status(204).send()
    } catch {
      res.status(500).json({ message: 'Server error' })
    }
  },
)

// ── Public: preview invitation (no auth) ─────────────────────────────────────
publicRouter.get('/:token', async (req, res): Promise<void> => {
  try {
    const invitation = await prisma.invitation.findUnique({
      where: { token: req.params.token },
      include: { project: { select: { name: true, contractType: true } } },
    })
    if (!invitation) { res.status(404).json({ message: 'Invitation not found' }); return }
    if (invitation.acceptedAt) { res.status(410).json({ message: 'Invitation already accepted' }); return }
    if (invitation.expiresAt < new Date()) { res.status(410).json({ message: 'Invitation has expired' }); return }

    res.json({
      email: invitation.email,
      role: invitation.role,
      projectName: invitation.project.name,
      contractType: invitation.project.contractType,
    })
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

// ── Public: accept invitation (no auth) ──────────────────────────────────────
publicRouter.post('/:token/accept',
  body('name').notEmpty().trim(),
  body('password').isLength({ min: 8 }),
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return }

    try {
      const invitation = await prisma.invitation.findUnique({ where: { token: req.params.token } })
      if (!invitation) { res.status(404).json({ message: 'Invitation not found' }); return }
      if (invitation.acceptedAt) { res.status(410).json({ message: 'Already accepted' }); return }
      if (invitation.expiresAt < new Date()) { res.status(410).json({ message: 'Invitation expired' }); return }

      const { name, password } = req.body
      const hashed = await bcrypt.hash(password, 12)

      let user = await prisma.user.findUnique({ where: { email: invitation.email } })
      if (!user) {
        // The invitation role applies to THIS PROJECT ONLY. The global role is
        // always VIEWER - never taken from the invitation (privilege escalation).
        user = await prisma.user.create({
          data: { email: invitation.email, password: hashed, name, role: 'VIEWER' },
        })
      }

      // Add to project with the invited per-project role
      await prisma.projectMember.upsert({
        where: { userId_projectId: { userId: user.id, projectId: invitation.projectId } },
        update: { role: invitation.role },
        create: { userId: user.id, projectId: invitation.projectId, role: invitation.role },
      })

      // Mark accepted
      await prisma.invitation.update({
        where: { token: req.params.token },
        data: { acceptedAt: new Date() },
      })

      res.json({ message: 'Account created successfully. You can now sign in.' })
    } catch (e) {
      console.error(e)
      res.status(500).json({ message: 'Failed to accept invitation' })
    }
  },
)

export default router
