import { Response, NextFunction } from 'express'
import { AuthRequest } from './auth'
import prisma from '../config/database'

export const requireRole = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) { res.status(401).json({ message: 'Unauthorized' }); return }
    if (!roles.includes(req.user.role)) { res.status(403).json({ message: 'Insufficient permissions' }); return }
    next()
  }
}

export const requireProjectAccess = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Unauthorized' }); return }

  const projectId = req.params.projectId
  const [project, member] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { isActive: true } }),
    req.user.role === 'ADMIN'
      ? Promise.resolve(null)
      : prisma.projectMember.findUnique({ where: { userId_projectId: { userId: req.user.id, projectId } } }),
  ])
  if (!project) { res.status(404).json({ message: 'Project not found' }); return }
  req.projectActive = project.isActive

  if (req.user.role === 'ADMIN') { req.projectRole = 'ADMIN'; next(); return }
  if (!member) { res.status(403).json({ message: 'No access to this project' }); return }
  req.projectRole = member.role
  next()
}

// Enforces the user's PER-PROJECT role (global ADMIN always passes) and
// blocks all writes once a project has been completed (read-only archive).
// Must run after requireProjectAccess, which resolves req.projectRole.
export const requireProjectRole = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) { res.status(401).json({ message: 'Unauthorized' }); return }
    if (req.projectActive === false) {
      res.status(403).json({ message: 'This project has been completed and is read-only. Reopen it to make changes.' })
      return
    }
    if (req.user.role === 'ADMIN') { next(); return }
    if (!req.projectRole || !roles.includes(req.projectRole)) {
      res.status(403).json({ message: 'Insufficient permissions for this project' })
      return
    }
    next()
  }
}
