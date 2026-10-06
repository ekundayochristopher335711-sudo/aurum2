import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import rateLimit from 'express-rate-limit'
import { body, validationResult } from 'express-validator'
import prisma from '../config/database'
import { authenticate, AuthRequest } from '../middleware/auth'
import { logAudit } from '../services/auditService'
import { sendPasswordResetEmail } from '../services/emailService'

const router = express.Router()

// Brute-force protection on credential endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again in 15 minutes.' },
})

router.post('/register',
  authLimiter,
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('name').notEmpty().trim(),
  async (req, res): Promise<void> => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return }

    const { email, password, name } = req.body
    try {
      const existing = await prisma.user.findUnique({ where: { email } })
      if (existing) { res.status(409).json({ message: 'Email already registered' }); return }

      const hashed = await bcrypt.hash(password, 12)
      // Role is NEVER taken from the request body. Self-registered users are
      // COMMERCIAL_MANAGER so they can create and administer their own projects;
      // access to any other project still requires membership.
      // Accounts start INACTIVE - a platform admin must approve them before
      // first sign-in. (Invited users bypass this; the invite is the approval.)
      const user = await prisma.user.create({
        data: { email, password: hashed, name, role: 'COMMERCIAL_MANAGER', isActive: false },
        select: { id: true, email: true, name: true, role: true, createdAt: true },
      })

      await logAudit({ userId: user.id, entityType: 'User', entityId: user.id, action: 'CREATE', changes: { status: { old: null, new: 'PENDING_APPROVAL' } }, ipAddress: req.ip })
      res.status(201).json({
        pendingApproval: true,
        message: 'Account created. An administrator must approve it before you can sign in.',
      })
    } catch {
      res.status(500).json({ message: 'Server error' })
    }
  },
)

router.post('/login',
  authLimiter,
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  async (req, res): Promise<void> => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return }

    const { email, password } = req.body
    try {
      const user = await prisma.user.findUnique({ where: { email } })
      if (!user) { res.status(401).json({ message: 'Invalid credentials' }); return }

      const valid = await bcrypt.compare(password, user.password)
      if (!valid) { res.status(401).json({ message: 'Invalid credentials' }); return }

      // Correct password but not yet approved/reactivated - tell them why
      if (!user.isActive) {
        res.status(403).json({ message: 'Your account is awaiting approval by an administrator. You will be able to sign in once it has been approved.' })
        return
      }

      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET!,
        { expiresIn: '24h' },
      )
      res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role }, token })
    } catch {
      res.status(500).json({ message: 'Server error' })
    }
  },
)

// ── Password reset ────────────────────────────────────────────────────────────
router.post('/forgot-password',
  authLimiter,
  body('email').isEmail().normalizeEmail(),
  async (req, res): Promise<void> => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return }

    try {
      const user = await prisma.user.findUnique({ where: { email: req.body.email } })
      // Always return 200 - never reveal whether an email is registered
      if (user && user.isActive) {
        await prisma.passwordReset.deleteMany({ where: { userId: user.id, usedAt: null } })
        const reset = await prisma.passwordReset.create({
          data: { userId: user.id, expiresAt: new Date(Date.now() + 60 * 60 * 1000) }, // 1 hour
        })
        // The reset email is a blocker for the person waiting, so it is sent
        // and confirmed BEFORE the response returns. Fire-and-forget races
        // Vercel freezing the function after the response - that is why
        // resets could arrive late, or together with the next request's email.
        try {
          await sendPasswordResetEmail(user.email, user.name, reset.token)
        } catch (emailError) {
          console.error('Password reset email failed:', emailError)
        }
      }
      res.json({ message: 'If that email is registered, a reset link has been sent.' })
    } catch {
      res.status(500).json({ message: 'Server error' })
    }
  },
)

router.post('/reset-password',
  authLimiter,
  body('token').notEmpty(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  async (req, res): Promise<void> => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return }

    try {
      const reset = await prisma.passwordReset.findUnique({ where: { token: req.body.token } })
      if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
        res.status(410).json({ message: 'This reset link is invalid or has expired.' })
        return
      }

      const hashed = await bcrypt.hash(req.body.password, 12)
      await prisma.$transaction([
        prisma.user.update({ where: { id: reset.userId }, data: { password: hashed } }),
        prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
      ])
      await logAudit({ userId: reset.userId, entityType: 'User', entityId: reset.userId, action: 'UPDATE', changes: { password: { old: '[redacted]', new: '[redacted]' } }, ipAddress: req.ip })
      res.json({ message: 'Password updated. You can now sign in.' })
    } catch {
      res.status(500).json({ message: 'Server error' })
    }
  },
)

// Re-authenticate for a destructive action (delete, remove member, complete).
// Rate limited so it can't be used to brute-force the signed-in user.
router.post('/verify-password',
  authenticate,
  authLimiter,
  body('password').notEmpty(),
  async (req: AuthRequest, res): Promise<void> => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) { res.status(400).json({ message: 'Password required' }); return }
    try {
      const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
      if (!user) { res.status(401).json({ message: 'Incorrect password' }); return }
      const valid = await bcrypt.compare(req.body.password, user.password)
      if (!valid) { res.status(401).json({ message: 'Incorrect password' }); return }
      res.json({ ok: true })
    } catch {
      res.status(500).json({ message: 'Server error' })
    }
  },
)

router.get('/me', authenticate, async (req: AuthRequest, res): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, email: true, name: true, role: true, createdAt: true, notifyContractEvents: true, notifyComments: true },
    })
    res.json(user)
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

// Change password while signed in (the only route before this was "forgot")
router.post('/change-password',
  authenticate,
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
  async (req: AuthRequest, res): Promise<void> => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return }

    try {
      const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
      if (!user) { res.status(404).json({ message: 'User not found' }); return }

      const valid = await bcrypt.compare(req.body.currentPassword, user.password)
      if (!valid) { res.status(400).json({ message: 'Your current password is not correct.' }); return }

      const hashed = await bcrypt.hash(req.body.newPassword, 12)
      await prisma.user.update({ where: { id: user.id }, data: { password: hashed } })
      await logAudit({ userId: user.id, entityType: 'User', entityId: user.id, action: 'UPDATE', changes: { password: { old: '[redacted]', new: '[redacted]' } }, ipAddress: req.ip })
      res.json({ message: 'Password changed successfully.' })
    } catch {
      res.status(500).json({ message: 'Server error' })
    }
  },
)

// Each person controls their own email volume
router.patch('/me/notifications', authenticate, async (req: AuthRequest, res): Promise<void> => {
  const { notifyContractEvents, notifyComments } = req.body
  try {
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        ...(typeof notifyContractEvents === 'boolean' ? { notifyContractEvents } : {}),
        ...(typeof notifyComments === 'boolean' ? { notifyComments } : {}),
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true, notifyContractEvents: true, notifyComments: true },
    })
    res.json(user)
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

router.get('/users', authenticate, async (req: AuthRequest, res): Promise<void> => {
  if (req.user!.role !== 'ADMIN') { res.status(403).json({ message: 'Admin only' }); return }
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })
    res.json(users)
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

// Admin: activate/deactivate an account or change its global role.
// Deactivated users cannot log in and existing tokens stop working.
router.patch('/users/:id', authenticate, async (req: AuthRequest, res): Promise<void> => {
  if (req.user!.role !== 'ADMIN') { res.status(403).json({ message: 'Admin only' }); return }
  if (req.params.id === req.user!.id) { res.status(400).json({ message: 'You cannot modify your own account here' }); return }

  const { isActive, role } = req.body
  if (role !== undefined && !['ADMIN', 'COMMERCIAL_MANAGER', 'VIEWER'].includes(role)) {
    res.status(400).json({ message: 'Invalid role' })
    return
  }
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
        ...(role !== undefined ? { role } : {}),
      },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
    })
    await logAudit({
      userId: req.user!.id, entityType: 'User', entityId: user.id, action: 'UPDATE',
      changes: { ...(isActive !== undefined ? { isActive: { old: !user.isActive, new: user.isActive } } : {}), ...(role !== undefined ? { role: { old: 'changed', new: role } } : {}) },
      ipAddress: req.ip,
    })
    res.json(user)
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

export default router
