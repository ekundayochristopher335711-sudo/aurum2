import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import prisma from '../config/database'

export interface AuthRequest extends Request {
  user?: { id: string; email: string; role: string }
  projectRole?: string
  projectActive?: boolean
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) { res.status(401).json({ message: 'No token provided' }); return }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string; email: string; role: string }
    const user = await prisma.user.findUnique({ where: { id: decoded.id } })
    if (!user || !user.isActive) { res.status(401).json({ message: 'Invalid token' }); return }
    req.user = { id: user.id, email: user.email, role: user.role }
    next()
  } catch {
    res.status(401).json({ message: 'Invalid token' })
  }
}
